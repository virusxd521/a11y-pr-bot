# a11y-pr-bot

A QODO-style review bot, narrowed to **accessibility**. On every pull request it flags a11y violations in changed React (`.jsx`/`.tsx`) code and posts inline + summary comments with plain-English user impact and concrete fixes.

## How it works

Hybrid detection — deterministic first, AI second:

1. **Diff** — list changed `.jsx`/`.tsx` files and their added line ranges (so inline comments land on real diff lines).
2. **Lint** — run `eslint-plugin-jsx-a11y` over the changed files. Deterministic, no hallucination.
3. **LLM** — an OpenRouter pass rewrites each linter hit as user impact + fix, **and** catches issues the linter can't (non-descriptive link text, labels wired to custom components, color-only meaning, heading order, ARIA misuse).
4. **Map** — attach WCAG success criterion + severity; filter to `min-severity`.
5. **Comment** — inline comments on changed lines + one summary comment that **updates in place** on re-pushes (no spam).

No app build or render required.

## Use it in a repo

Add `OPENROUTER_API_KEY` as a repo secret, then drop in `.github/workflows/a11y.yml` (see [a11y.yml.example](.github/workflows/a11y.yml.example)):

```yaml
on:
  pull_request:
permissions:
  contents: read
  pull-requests: write
jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: virusxd521/a11y-pr-bot@v1
        with:
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `openrouter-api-key` | `""` | OpenRouter key. Omit to run **eslint-only** (degraded) mode. |
| `model` | `anthropic/claude-3.5-haiku` | OpenRouter model id. |
| `min-severity` | `serious` | Lowest severity to report (`critical`/`serious`/`moderate`/`minor`). |
| `fail-on` | `none` | Fail the check at/above this severity (`none`/`serious`/`critical`). |
| `globs` | `**/*.{jsx,tsx}` | UI files to review. |

## Local dry-run (no PR needed)

```bash
npm install
export OPENROUTER_API_KEY=sk-or-...   # optional; omit for eslint-only
npm run review -- --dry-run --files fixtures/bad-component.tsx
```

Prints findings to stdout. Use this to iterate on the prompt and severity mapping.

## Scope (MVP) and limits

- **React/JSX only** for the deterministic stage — `eslint-plugin-jsx-a11y` is JSX/TSX-only. HTML/Vue/Svelte are seen by the LLM pass only.
- Inline comments require lines to be part of the diff; off-diff findings go to the summary.
- Plain `pull_request` does **not** expose secrets to forked PRs. This MVP targets same-repo branches. For forks you'd switch to `pull_request_target` and accept its security trade-offs (it runs with write access on untrusted code).

## Roadmap (next)

- Dynamic **axe-core** on rendered pages for gold-standard WCAG coverage (prototype lives in `accessibility-scanner`).
- HTML/Vue/Svelte deterministic linting.
- `ncc`-bundled `dist/` + Marketplace publish.
- Hosted GitHub App variant.
