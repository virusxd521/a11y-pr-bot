import OpenAI from "openai";
import type { Finding, Severity } from "./types";
import { normalizeSeverity } from "./severity";

const SYSTEM = [
  "You are a senior web accessibility (a11y) reviewer auditing React (JSX/TSX) code for WCAG 2.1 AA violations.",
  "You are given a source file (with line numbers) and the deterministic findings already produced by eslint-plugin-jsx-a11y.",
  "Your job has two parts:",
  "1. ENRICH each linter finding with a one-sentence plain-English user impact and a concrete code-level fix.",
  "2. ADD only high-confidence issues the linter cannot detect: non-descriptive link/button text, labels wired to custom components, meaning conveyed by color alone, illogical heading order, misused ARIA, missing form field instructions.",
  "Be conservative — do not invent issues. Every line you cite must exist in the snippet.",
  "Reply with ONLY a JSON object, no prose, matching:",
  '{ "enriched": [ { "line": number, "ruleOrIssue": string, "explanation": string, "suggestedFix": string } ],',
  '  "additional": [ { "line": number, "issue": string, "wcag": string, "severity": "critical|serious|moderate|minor", "explanation": string, "suggestedFix": string } ] }',
].join("\n");

export type LlmResult = {
  enriched: Array<{ line: number; ruleOrIssue: string; explanation: string; suggestedFix: string }>;
  additional: Finding[];
};

const EMPTY: LlmResult = { enriched: [], additional: [] };

function numberLines(content: string): string {
  return content
    .split("\n")
    .map((l, i) => `${String(i + 1).padStart(4, " ")}  ${l}`)
    .join("\n");
}

function stripFences(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

export async function llmReview(input: {
  absPath: string;
  relPath: string;
  content: string;
  eslintFindings: Finding[];
  model: string;
  apiKey: string;
}): Promise<LlmResult> {
  const { absPath, relPath, content, eslintFindings, model, apiKey } = input;

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const linterSummary = eslintFindings.length
    ? eslintFindings.map((f) => `- line ${f.line}: ${f.ruleOrIssue} — ${f.explanation}`).join("\n")
    : "(none)";

  const user = [
    `File: ${relPath}`,
    "",
    "Existing eslint-plugin-jsx-a11y findings:",
    linterSummary,
    "",
    "Source (line-numbered):",
    "```tsx",
    numberLines(content),
    "```",
  ].join("\n");

  let raw: string;
  try {
    const res = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });
    raw = res.choices[0]?.message?.content ?? "";
  } catch (err) {
    console.error(`[llm] request failed for ${relPath}: ${(err as Error).message}`);
    return EMPTY;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    console.error(`[llm] could not parse JSON for ${relPath}; skipping LLM pass for this file`);
    return EMPTY;
  }

  const enriched = Array.isArray(parsed?.enriched)
    ? parsed.enriched
        .filter((e: any) => typeof e?.line === "number")
        .map((e: any) => ({
          line: e.line,
          ruleOrIssue: String(e.ruleOrIssue ?? ""),
          explanation: String(e.explanation ?? ""),
          suggestedFix: String(e.suggestedFix ?? ""),
        }))
    : [];

  const additional: Finding[] = Array.isArray(parsed?.additional)
    ? parsed.additional
        .filter((a: any) => typeof a?.line === "number")
        .map((a: any) => ({
          file: absPath,
          line: a.line,
          ruleOrIssue: String(a.issue ?? "Accessibility issue"),
          wcag: a.wcag ? String(a.wcag) : undefined,
          severity: normalizeSeverity(a.severity) as Severity,
          source: "llm" as const,
          explanation: String(a.explanation ?? ""),
          suggestedFix: String(a.suggestedFix ?? ""),
        }))
    : [];

  return { enriched, additional };
}
