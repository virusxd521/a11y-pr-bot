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

## 5. Production on Render (always-on, QODO-style)

`npm run app` on your laptop only works while the laptop is on. To run 24/7 like QODO, deploy the same server to Render. The repo already includes `render.yaml`.

Do step 1 first (registering the App gives you `APP_ID` / `PRIVATE_KEY` / `WEBHOOK_SECRET`). Then:

1. **Render → New + → Blueprint** → connect the `a11y-pr-bot` repo. Render reads `render.yaml` and creates the web service.
2. **Environment tab** → set the four secrets:
   - `APP_ID`, `WEBHOOK_SECRET`, `OPENROUTER_API_KEY`
   - `PRIVATE_KEY` — paste the whole `.pem` contents (including the `-----BEGIN/END-----` lines).
3. After it deploys, copy the service URL, e.g. `https://a11y-pr-bot.onrender.com`.
4. **GitHub → the App's settings → Webhook URL** → set it to `https://a11y-pr-bot.onrender.com/api/github/webhooks` (and the same `WEBHOOK_SECRET`).
5. **Install** the App on your repos → "All repositories". Done.

Now every PR in every installed repo is reviewed, with no workflow file anywhere.

> Free tier note: Render's free web service sleeps after ~15 min idle, so the first PR after a quiet spell waits ~30–60s for cold start (GitHub retries webhooks, so nothing is lost). Upgrade the plan to keep it always warm.

Nothing changes per repo — installing/uninstalling the App is the only knob.

## Action vs App — when to use which

| | Action (per-repo) | App (fleet) |
|---|---|---|
| Setup | workflow file + secret per repo | install once, pick "all repositories" |
| Hosting | none (runs in GitHub CI) | a small always-on server |
| Best for | trying it on one repo | covering an org with zero per-repo work |

Both share the exact same detection pipeline (`src/core.ts`).
