# Run a11y-pr-bot as a GitHub App (all repos, zero per-repo setup)

The Action (`README.md`) runs per-repo via a workflow file. The **App** runs once and reviews PRs across **every repo you install it on** — no workflow file in any repo. This is the QODO SaaS model.

```
PR opened in ANY installed repo
        │  (GitHub sends a webhook)
        ▼
  a11y-pr-bot server  ──fetches changed files via API──▶ eslint + LLM
        │
        ▼
  posts inline + summary comments  (authenticated as the App installation)
```

## 1. Register the App (one-time, automated)

```bash
npm install
npm run app
```

Open http://localhost:3000 → click **Register a GitHub App**. Probot walks you through GitHub's manifest flow and, when you finish, writes `APP_ID`, `PRIVATE_KEY`, and `WEBHOOK_SECRET` into your `.env`. It also opens a `smee.io` proxy so GitHub webhooks reach your laptop during development.

The manifest pre-selects what the App needs:

| Setting | Value |
|---|---|
| Permissions | Pull requests: read & write · Contents: read · Metadata: read |
| Webhook events | `pull_request` |

## 2. Add your LLM key

Put your OpenRouter key in `.env`:

```
OPENROUTER_API_KEY=sk-or-...
```

(Without it the App still runs — eslint-only.)

## 3. Install it on your repos

After registration, GitHub offers an **Install** button → choose **All repositories** (or pick a set). That's the "zero per-repo setup" step: every selected repo is now covered.

## 4. See it work

Open any PR that changes a `.jsx`/`.tsx` file in **any** installed repo → the bot comments automatically. Restart-safe and idempotent (summary upserts, inline comments replaced on re-run).

## 5. Production (always-on)

`npm run app` on your laptop only works while the laptop is running. For real fleet use, deploy the same server to an always-on host and set a real webhook URL (no smee):

- Any Node host (Render, Railway, Fly.io, a small VM) — run `npm run app` with `APP_ID` / `PRIVATE_KEY` / `WEBHOOK_SECRET` / `OPENROUTER_API_KEY` as env vars, and point the App's webhook URL at it.
- Set the App's **Webhook URL** (in its GitHub settings) to `https://<your-host>/api/github/webhooks`.

Nothing changes per repo — installing/uninstalling the App is the only knob.

## Action vs App — when to use which

| | Action (per-repo) | App (fleet) |
|---|---|---|
| Setup | workflow file + secret per repo | install once, pick "all repositories" |
| Hosting | none (runs in GitHub CI) | a small always-on server |
| Best for | trying it on one repo | covering an org with zero per-repo work |

Both share the exact same detection pipeline (`src/core.ts`).
