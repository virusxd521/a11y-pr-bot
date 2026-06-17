import type { Severity } from "./types";

// Lifted from deque-jira-bridge/axe-to-jira.ts:30 — keeps severity language consistent
// with the existing axe -> Jira pipeline so findings map to the same priorities.
export const impactToPriority: Record<Severity, string> = {
  critical: "Highest",
  serious: "High",
  moderate: "Medium",
  minor: "Low",
};

export const SEVERITY_ORDER: Severity[] = ["critical", "serious", "moderate", "minor"];

const rank: Record<Severity, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

export const isSeverity = (v: string): v is Severity =>
  (SEVERITY_ORDER as string[]).includes(v);

export const normalizeSeverity = (v: unknown): Severity =>
  typeof v === "string" && isSeverity(v) ? v : "moderate";

// True when `sev` is at least as severe as `min` (critical >= serious >= ...).
export const meetsMin = (sev: Severity, min: Severity): boolean => rank[sev] <= rank[min];

export const compareSeverity = (a: Severity, b: Severity): number => rank[a] - rank[b];
