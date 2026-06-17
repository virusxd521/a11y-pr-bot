import fs from "node:fs";
import path from "node:path";
import { getOctokit, context } from "@actions/github";
import { runReview, reviewPullRequest, byLoc, type ReviewInput } from "./core";
import { resolveLlmConfig } from "./llm-config";
import { meetsMin } from "./severity";
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
  const files = filesArg ? filesArg.split(",").map((s) => s.trim()).filter(Boolean) : positional;

  const { apiKey, baseURL, model } = resolveLlmConfig(arg("--model"));
  return {
    mode,
    files,
    workspace: process.env.GITHUB_WORKSPACE || process.cwd(),
    model,
    apiKey,
    baseURL,
    minSeverity: (arg("--min-severity") ?? process.env.A11Y_MIN_SEVERITY ?? "serious") as Severity,
    failOn: (process.env.A11Y_FAIL_ON ?? "none") as FailOn,
    globs: (process.env.A11Y_GLOBS ?? "**/*.{jsx,tsx}").split(",").map((s) => s.trim()),
  };
}

function exitCode(findings: Finding[], failOn: FailOn): number {
  if (failOn === "none") return 0;
  const threshold: Severity = failOn === "critical" ? "critical" : "serious";
  return findings.some((f) => meetsMin(f.severity, threshold)) ? 1 : 0;
}

async function runLocal(cfg: Config): Promise<void> {
  if (cfg.files.length === 0) {
    console.error(
      "Usage: npm run review -- --dry-run --files <file.tsx>[,<file2.tsx>] [--min-severity serious] [--model <id>]",
    );
    process.exit(2);
  }
  console.log(
    `a11y-pr-bot (dry-run) · ${cfg.files.length} file(s) · min-severity=${cfg.minSeverity} · llm=${cfg.apiKey ? cfg.model : "disabled"}`,
  );

  const inputs: ReviewInput[] = [];
  for (const f of cfg.files) {
    try {
      inputs.push({ filename: f, content: fs.readFileSync(path.resolve(cfg.workspace, f), "utf8"), addedLines: null });
    } catch {
      console.error(`[skip] cannot read ${f}`);
    }
  }

  const findings = (await runReview(inputs, cfg)).filter((f) => meetsMin(f.severity, cfg.minSeverity)).sort(byLoc);

  if (findings.length === 0) {
    console.log("\nNo issues at or above the configured severity.");
  } else {
    console.log(`\nFound ${findings.length} issue(s):\n`);
    for (const f of findings) {
      console.log(`  [${f.severity}] ${f.file}:${f.line}  ${f.ruleOrIssue}${f.wcag ? ` (WCAG ${f.wcag})` : ""} [${f.source}]`);
      console.log(`      ${f.explanation}`);
      if (f.suggestedFix) console.log(`      fix: ${f.suggestedFix}`);
    }
  }
  process.exit(exitCode(findings, cfg.failOn));
}

async function runActionPR(cfg: Config): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN is required in PR mode.");
    process.exit(2);
  }
  const pr = context.payload.pull_request;
  if (!pr) {
    console.error("No pull_request in the event payload.");
    process.exit(2);
  }
  const { owner, repo } = context.repo;

  const { findings, inlineCount } = await reviewPullRequest({
    octokit: getOctokit(token),
    owner,
    repo,
    pull_number: pr.number,
    headSha: (pr as any).head.sha,
    cfg,
  });

  console.log(`a11y-pr-bot: ${findings.length} issue(s), ${inlineCount} inline. min-severity=${cfg.minSeverity}`);
  process.exit(exitCode(findings, cfg.failOn));
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (cfg.mode === "local") await runLocal(cfg);
  else await runActionPR(cfg);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
