import fs from "node:fs";
import path from "node:path";
import { getOctokit, context } from "@actions/github";
import { runEslint } from "./eslint-runner";
import { llmReview } from "./llm";
import { getChangedFiles } from "./diff";
import { renderInlineBody, renderSummary, postReview } from "./comment";
import { meetsMin, compareSeverity } from "./severity";
import type { Config, FailOn, Finding, Severity } from "./types";

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (flag: string): boolean => process.argv.includes(flag);

function loadConfig(): Config {
  const inActions = process.env.GITHUB_ACTIONS === "true";
  const isPrEvent = (process.env.GITHUB_EVENT_NAME ?? "").startsWith("pull_request");
  const mode: "pr" | "local" = inActions && isPrEvent && !hasFlag("--dry-run") ? "pr" : "local";

  const filesArg = arg("--files");
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--") && /\.(jsx|tsx)$/.test(a));
  const files = filesArg
    ? filesArg.split(",").map((s) => s.trim()).filter(Boolean)
    : positional;

  return {
    mode,
    files,
    workspace: process.env.GITHUB_WORKSPACE || process.cwd(),
    model: arg("--model") ?? process.env.OPENROUTER_MODEL ?? "anthropic/claude-3.5-haiku",
    apiKey: process.env.OPENROUTER_API_KEY,
    minSeverity: (arg("--min-severity") ?? process.env.A11Y_MIN_SEVERITY ?? "serious") as Severity,
    failOn: (process.env.A11Y_FAIL_ON ?? "none") as FailOn,
    globs: (process.env.A11Y_GLOBS ?? "**/*.{jsx,tsx}").split(",").map((s) => s.trim()),
  };
}

// Merge a file's eslint findings with an LLM enrichment/expansion pass.
async function reviewFile(absPath: string, relPath: string, eslintForFile: Finding[], cfg: Config): Promise<Finding[]> {
  let content: string;
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch {
    return eslintForFile;
  }

  if (!cfg.apiKey) return eslintForFile; // degraded: eslint-only

  const { enriched, additional } = await llmReview({
    absPath,
    relPath,
    content,
    eslintFindings: eslintForFile,
    model: cfg.model,
    apiKey: cfg.apiKey,
  });

  const enrichedBase = eslintForFile.map((f) => {
    const m = enriched.find((e) => e.line === f.line && (e.ruleOrIssue === f.ruleOrIssue || e.ruleOrIssue === ""));
    return m
      ? { ...f, explanation: m.explanation || f.explanation, suggestedFix: m.suggestedFix || f.suggestedFix }
      : f;
  });

  const baseKeys = new Set(enrichedBase.map((f) => `${f.line}:${f.wcag ?? f.ruleOrIssue}`));
  const extra = additional.filter((a) => !baseKeys.has(`${a.line}:${a.wcag ?? a.ruleOrIssue}`));

  return [...enrichedBase, ...extra];
}

async function collectFindings(absFiles: string[], cfg: Config): Promise<Finding[]> {
  const eslintFindings = await runEslint(absFiles, cfg.workspace);

  const byFile = new Map<string, Finding[]>();
  for (const abs of absFiles) byFile.set(abs, []);
  for (const f of eslintFindings) {
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }

  const out: Finding[] = [];
  for (const [abs, list] of byFile) {
    out.push(...(await reviewFile(abs, path.relative(cfg.workspace, abs), list, cfg)));
  }
  return out;
}

const byLoc = (a: Finding, b: Finding): number =>
  compareSeverity(a.severity, b.severity) || a.file.localeCompare(b.file) || a.line - b.line;

function exitCode(findings: Finding[], failOn: FailOn): number {
  if (failOn === "none") return 0;
  const threshold: Severity = failOn === "critical" ? "critical" : "serious";
  return findings.some((f) => meetsMin(f.severity, threshold)) ? 1 : 0;
}

async function runLocal(cfg: Config): Promise<void> {
  const absFiles = cfg.files.map((f) => path.resolve(cfg.workspace, f));
  if (absFiles.length === 0) {
    console.error(
      "Usage: npm run review -- --dry-run --files <file.tsx>[,<file2.tsx>] [--min-severity serious] [--model <id>]",
    );
    process.exit(2);
  }
  console.log(
    `a11y-pr-bot (dry-run) · ${absFiles.length} file(s) · min-severity=${cfg.minSeverity} · llm=${cfg.apiKey ? cfg.model : "disabled"}`,
  );

  const all = await collectFindings(absFiles, cfg);
  const filtered = all.filter((f) => meetsMin(f.severity, cfg.minSeverity)).sort(byLoc);

  if (filtered.length === 0) {
    console.log("\nNo issues at or above the configured severity.");
  } else {
    console.log(`\nFound ${filtered.length} issue(s):\n`);
    for (const f of filtered) {
      const rel = path.relative(cfg.workspace, f.file);
      console.log(`  [${f.severity}] ${rel}:${f.line}  ${f.ruleOrIssue}${f.wcag ? ` (WCAG ${f.wcag})` : ""} [${f.source}]`);
      console.log(`      ${f.explanation}`);
      if (f.suggestedFix) console.log(`      fix: ${f.suggestedFix}`);
    }
  }
  process.exit(exitCode(filtered, cfg.failOn));
}

async function runPR(cfg: Config): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN is required in PR mode.");
    process.exit(2);
  }
  const octokit = getOctokit(token);
  const pr = context.payload.pull_request;
  if (!pr) {
    console.error("No pull_request in the event payload.");
    process.exit(2);
  }
  const { owner, repo } = context.repo;
  const pull_number = pr.number;

  const changed = await getChangedFiles(octokit, owner, repo, pull_number);
  if (changed.length === 0) {
    console.log("No changed JSX/TSX files; nothing to review.");
    return;
  }

  const addedByAbs = new Map<string, Set<number>>();
  const absFiles = changed.map((c) => {
    const abs = path.join(cfg.workspace, c.filename);
    addedByAbs.set(abs, c.addedLines);
    return abs;
  });

  const all = await collectFindings(absFiles, cfg);
  const filtered = all.filter((f) => meetsMin(f.severity, cfg.minSeverity)).sort(byLoc);

  const inline = filtered
    .filter((f) => addedByAbs.get(f.file)?.has(f.line))
    .map((f) => ({ path: path.relative(cfg.workspace, f.file), line: f.line, body: renderInlineBody(f) }));

  const summary = renderSummary(filtered, cfg.workspace);
  await postReview(octokit, owner, repo, pull_number, summary, inline);

  console.log(`a11y-pr-bot: ${filtered.length} issue(s), ${inline.length} inline. min-severity=${cfg.minSeverity}`);
  process.exit(exitCode(filtered, cfg.failOn));
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (cfg.mode === "local") await runLocal(cfg);
  else await runPR(cfg);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
