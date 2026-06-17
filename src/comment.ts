import type { Finding, Severity } from "./types";
import { SEVERITY_ORDER, compareSeverity } from "./severity";

const MARKER = "<!-- a11y-pr-bot -->";

const sevLabel = (s: Severity) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderInlineBody(f: Finding): string {
  const wcag = f.wcag ? ` · WCAG ${f.wcag}` : "";
  const rule = f.source === "eslint" ? `\`${f.ruleOrIssue}\`` : `**${f.ruleOrIssue}**`;
  let body = `**a11y · ${sevLabel(f.severity)}**${wcag} — ${rule}\n\n${f.explanation}`;
  if (f.suggestedFix) body += `\n\n**Fix:** ${f.suggestedFix}`;
  body += `\n\n<sub>flagged by a11y-pr-bot</sub>`;
  return body;
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

const relName = (file: string, workspace: string) =>
  file.startsWith(workspace) ? file.slice(workspace.length).replace(/^[/\\]/, "") : file;

export function renderSummary(all: Finding[], workspace: string): string {
  if (all.length === 0) {
    return `${MARKER}\n### Accessibility review\n\nNo accessibility issues found in the changed JSX/TSX at or above the configured severity.`;
  }

  const counts = countBySeverity(all);
  const chips = SEVERITY_ORDER.filter((s) => counts[s] > 0)
    .map((s) => `**${counts[s]}** ${sevLabel(s)}`)
    .join(" · ");

  const sorted = [...all].sort(
    (a, b) => compareSeverity(a.severity, b.severity) || a.file.localeCompare(b.file) || a.line - b.line,
  );

  const rows = sorted
    .map((f) => {
      const loc = `${relName(f.file, workspace)}:${f.line}`;
      const wcag = f.wcag ? `WCAG ${f.wcag}` : "—";
      const expl = f.explanation.replace(/\|/g, "\\|").replace(/\n/g, " ");
      return `| ${sevLabel(f.severity)} | \`${loc}\` | ${wcag} | ${f.ruleOrIssue} | ${expl} |`;
    })
    .join("\n");

  return [
    MARKER,
    "### Accessibility review",
    "",
    `Found **${all.length}** issue(s): ${chips}`,
    "",
    "| Severity | Location | WCAG | Rule / Issue | Impact |",
    "| --- | --- | --- | --- | --- |",
    rows,
    "",
    "<sub>Inline comments are posted on changed lines. Issues outside the diff are listed here only. — a11y-pr-bot</sub>",
  ].join("\n");
}

// Upsert the single summary comment, then post inline comments as one review.
export async function postReview(
  octokit: any,
  owner: string,
  repo: string,
  pull_number: number,
  summaryBody: string,
  inline: Array<{ path: string; line: number; body: string }>,
): Promise<void> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pull_number,
    per_page: 100,
  });
  const existing = comments.find((c: any) => typeof c.body === "string" && c.body.includes(MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body: summaryBody });
  } else {
    await octokit.rest.issues.createComment({ owner, repo, issue_number: pull_number, body: summaryBody });
  }

  if (inline.length === 0) return;

  try {
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number,
      event: "COMMENT",
      comments: inline.map((i) => ({ path: i.path, line: i.line, side: "RIGHT", body: i.body })),
    });
  } catch (err) {
    // Off-diff lines or stale SHAs cause 422s — degrade gracefully, summary already has everything.
    console.error(`[comment] inline review failed: ${(err as Error).message}. Findings remain in the summary.`);
  }
}

export { MARKER };
