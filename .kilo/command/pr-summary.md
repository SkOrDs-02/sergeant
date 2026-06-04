---
description: Summarize a GitHub PR (title, author, scope, changed files, risk)
---

You are summarizing a pull request.

1. If the user passed a PR number / URL, use it. Otherwise infer from the current branch via `git rev-parse --abbrev-ref HEAD` and `gh pr view --json number,title,author,baseRefName,headRefName,url` (or `github_list_pull_requests` then `github_get_pull_request`).
2. Fetch PR metadata with `github_get_pull_request` (owner, repo, pull_number).
3. Fetch the file list with `github_get_pull_request_files` and cap at 50 files; group by directory.
4. Fetch CI status with `github_get_pull_request_status`.
5. Produce a compact report in this exact shape:

   ## PR <number> — <title>
   - **Author:** <login> • **Branch:** `<head>` → `<base>` • **URL:** <url>
   - **Status checks:** <✅ passing / ❌ failing / ⏳ pending — list failed checks if any>
   - **Scope:** <N> files, +<additions> / -<deletions>
   - **Top directories touched:**
     - `<dir>/` — <N> files
   - **Notable changes (≤ 5 bullets):**
     - <one-line change with risk tag: `🟢 low` / `🟡 medium` / `🔴 high`>
   - **Suggested reviewers:** <handle1>, <handle2> (infer from CODEOWNERS for the touched directories; if unsure, omit)

6. If a check is failing, name it explicitly and link to the run.
7. Do **not** post a review comment — only report. The user decides what to do.
