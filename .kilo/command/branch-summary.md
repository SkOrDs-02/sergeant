---
description: Summarize the current branch — commits ahead of base, changed files, risk hotspots
---

You are summarizing the working state of the current branch.

1. Detect current branch: `git rev-parse --abbrev-ref HEAD`.
2. Detect default base: try `origin/HEAD` via `git symbolic-ref refs/remotes/origin/HEAD`; fall back to `main`, then `master`.
3. Commits ahead: `git log --oneline <base>..HEAD` (cap at 30; if more, show first 20 + "…and N more").
4. Diff stats: `git diff --stat <base>...HEAD` (cap at 100 files; group tail as "…and N more files").
5. Risk hotspots — files with the largest diffs and any path matching these patterns:
   - `apps/server/**/auth*`, `apps/server/**/middleware/**`
   - `apps/web/src/**/queryKeys*` (Hard Rule #2 — RQ keys factory)
   - `db-schema/**`, `db-schema/migrations/**` (Hard Rule #4 — sequential migrations)
   - `pnpm-lock.yaml`, `package.json` (dep bumps)
   - any path in `apps/server/**/openclaw*` or matching `**/pat*.ts` (Hard Rule #20 — no PATs in prod)
6. Produce this report:

   ## Branch `<head>` vs `<base>`
   - **Commits ahead:** <N> (showing <M>)
   - **Files changed:** <N> (+<additions> / -<deletions>)
   - **Commits (top):**
     - `<sha7>` <subject> — <author>
   - **Top files by churn:**
     - `<path>` — +<a> / -<d>
   - **Risk hotspots:**
     - `🟡 <file>` — <why it matters, one line + rule ref>
   - **Suggested next step:** <single line — e.g. "run `/check`", "split into 2 PRs", "needs rebas on <base>">

7. If `pnpm check` is reasonably fast in this repo (<5 min), suggest running it. Never auto-run heavy commands.
8. Do not commit, push, or open a PR — only report.
