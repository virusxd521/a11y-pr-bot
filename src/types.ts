// Severity vocabulary mirrors axe-core / deque-jira-bridge impact levels.
export type Severity = "critical" | "serious" | "moderate" | "minor";

export type FailOn = "none" | "serious" | "critical";

// A single accessibility finding, from either the linter or the LLM pass.
export type Finding = {
  file: string; // absolute path on disk
  line: number;
  ruleOrIssue: string; // eslint ruleId (e.g. jsx-a11y/alt-text) or LLM issue title
  wcag?: string; // success criterion, e.g. "1.1.1"
  severity: Severity;
  source: "eslint" | "llm";
  explanation: string; // plain-English user impact
  suggestedFix: string;
};

export type Config = {
  mode: "pr" | "local";
  files: string[]; // explicit files for local mode
  workspace: string; // repo root (GITHUB_WORKSPACE or cwd)
  model: string;
  apiKey?: string;
  minSeverity: Severity;
  failOn: FailOn;
  globs: string[];
};
