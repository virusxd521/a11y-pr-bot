import type { Probot } from "probot";
import { reviewPullRequest } from "./core";
import type { Config, FailOn, Severity } from "./types";

// Config for the App comes purely from env (set once on the host).
function appConfig(): Config {
  return {
    mode: "pr",
    files: [],
    workspace: "",
    model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-3.5-haiku",
    apiKey: process.env.OPENROUTER_API_KEY,
    minSeverity: (process.env.A11Y_MIN_SEVERITY ?? "serious") as Severity,
    failOn: (process.env.A11Y_FAIL_ON ?? "none") as FailOn,
    globs: (process.env.A11Y_GLOBS ?? "**/*.{jsx,tsx}").split(",").map((s) => s.trim()),
  };
}

// GitHub App entrypoint. Installed once on an account/org, it reviews PRs across
// every repo it can see — no per-repo workflow file.
export default (app: Probot): void => {
  app.on(["pull_request.opened", "pull_request.synchronize", "pull_request.reopened"], async (context) => {
    const { owner, repo } = context.repo();
    const pr = context.payload.pull_request;

    try {
      const { findings, inlineCount } = await reviewPullRequest({
        octokit: context.octokit,
        owner,
        repo,
        pull_number: pr.number,
        headSha: pr.head.sha,
        cfg: appConfig(),
      });
      context.log.info(`a11y-pr-bot: ${findings.length} issue(s), ${inlineCount} inline on ${owner}/${repo}#${pr.number}`);
    } catch (err) {
      context.log.error(err as Error);
    }
  });
};
