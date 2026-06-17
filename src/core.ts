import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runEslint } from "./eslint-runner";
import { llmReview } from "./llm";
import { getChangedFiles } from "./diff";
import { getFileContent } from "./fetch-content";
import { renderInlineBody, renderSummary, postReview } from "./comment";
import { meetsMin, compareSeverity } from "./severity";
import type { Config, Finding } from "./types";

// A file to review: its repo-relative path, contents, and (for PRs) which lines
// were added. addedLines === null means "review the whole file" (local dry-run).
export type ReviewInput = {
  filename: string;
  content: string;
  addedLines: Set<number> | null;
};

export const byLoc = (a: Finding, b: Finding): number =>
  compareSeverity(a.severity, b.severity) || a.file.localeCompare(b.file) || a.line - b.line;

// Write inputs to a throwaway temp tree so ESLint can lint real files,
// preserving relative paths so the config globs still match.
function writeTemp(inputs: ReviewInput[]): { root: string; absFiles: string[] } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "a11y-pr-bot-"));
  const absFiles: string[] = [];
  for (const inp of inputs) {
    const abs = path.join(root, inp.filename);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, inp.content, "utf8");
    absFiles.push(abs);
  }
  return { root, absFiles };
}

async function reviewFileContent(
  filename: string,
  content: string,
  eslintForFile: Finding[],
  cfg: Config,
): Promise<Finding[]> {
  if (!cfg.apiKey) return eslintForFile; // degraded: eslint-only

  const { enriched, additional } = await llmReview({
    file: filename,
    content,
    eslintFindings: eslintForFile,
    model: cfg.model,
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
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

// Run the eslint + LLM pipeline over in-memory file contents.
// Returns findings keyed by repo-relative filename. Shared by Action, App, and dry-run.
export async function runReview(inputs: ReviewInput[], cfg: Config): Promise<Finding[]> {
  if (inputs.length === 0) return [];

  const { root, absFiles } = writeTemp(inputs);
  try {
    const eslintFindings = await runEslint(absFiles, root);
    for (const f of eslintFindings) f.file = path.relative(root, f.file); // temp path -> relative

    const byFile = new Map<string, Finding[]>();
    for (const inp of inputs) byFile.set(inp.filename, []);
    for (const f of eslintFindings) {
      const list = byFile.get(f.file) ?? [];
      list.push(f);
      byFile.set(f.file, list);
    }

    const out: Finding[] = [];
    for (const inp of inputs) {
      out.push(...(await reviewFileContent(inp.filename, inp.content, byFile.get(inp.filename) ?? [], cfg)));
    }
    return out;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// End-to-end review of one pull request: fetch changed files, run the pipeline,
// post inline + summary comments. Works for any repo with no checkout.
export async function reviewPullRequest(args: {
  octokit: any;
  owner: string;
  repo: string;
  pull_number: number;
  headSha: string;
  cfg: Config;
}): Promise<{ findings: Finding[]; inlineCount: number }> {
  const { octokit, owner, repo, pull_number, headSha, cfg } = args;

  const changed = await getChangedFiles(octokit, owner, repo, pull_number);
  if (changed.length === 0) return { findings: [], inlineCount: 0 };

  const inputs: ReviewInput[] = [];
  for (const c of changed) {
    const content = await getFileContent(octokit, owner, repo, c.filename, headSha);
    if (content == null) continue;
    inputs.push({ filename: c.filename, content, addedLines: c.addedLines });
  }

  const findings = (await runReview(inputs, cfg)).filter((f) => meetsMin(f.severity, cfg.minSeverity)).sort(byLoc);

  const addedByFile = new Map(changed.map((c) => [c.filename, c.addedLines]));
  const inline = findings
    .filter((f) => addedByFile.get(f.file)?.has(f.line))
    .map((f) => ({ path: f.file, line: f.line, body: renderInlineBody(f) }));

  const summary = renderSummary(findings, "");
  await postReview(octokit, owner, repo, pull_number, summary, inline);

  return { findings, inlineCount: inline.length };
}
