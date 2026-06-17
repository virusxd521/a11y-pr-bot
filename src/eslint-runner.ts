import { ESLint } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wcagForRule } from "./wcag-map";
import type { Finding } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.resolve(here, "..", "eslint.config.mjs");

// Run jsx-a11y over the given absolute file paths and return only a11y findings.
// `cwd` must be the repo root so the config `files` globs match the checked-out files.
export async function runEslint(absFiles: string[], cwd: string): Promise<Finding[]> {
  if (absFiles.length === 0) return [];

  const eslint = new ESLint({
    cwd,
    overrideConfigFile: CONFIG_FILE,
    errorOnUnmatchedPattern: false,
  });

  let results: ESLint.LintResult[];
  try {
    results = await eslint.lintFiles(absFiles);
  } catch (err) {
    console.error(`[eslint] lint failed: ${(err as Error).message}`);
    return [];
  }

  const findings: Finding[] = [];
  for (const result of results) {
    for (const msg of result.messages) {
      if (!msg.ruleId || !msg.ruleId.startsWith("jsx-a11y/")) continue;
      const map = wcagForRule(msg.ruleId);
      findings.push({
        file: result.filePath,
        line: msg.line ?? 1,
        ruleOrIssue: msg.ruleId,
        wcag: map?.wcag,
        severity: map?.severity ?? "moderate",
        source: "eslint",
        explanation: msg.message,
        suggestedFix: "",
      });
    }
  }
  return findings;
}
