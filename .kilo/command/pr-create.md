---
description: Create a PR with proper template, scope, and reviewers
argument-hint: "[draft]"
---

Create a GitHub pull request following project conventions.

1. Get current branch: `git rev-parse --abbrev-ref HEAD`.
2. Get base branch: `git symbolic-ref refs/remotes/origin/HEAD 2>$null` → fallback to `main`.
3. Get commit summary: `git log --oneline <base>..HEAD`.
4. Get changed files: `git diff --stat <base>...HEAD`.
5. Determine scope from branch name and changed files.
6. Draft PR body following `.github/PULL_REQUEST_TEMPLATE.md`:
   - Summary (2-3 lines from commits)
   - Governing Skill (infer from changed paths)
   - Playbook (if applicable)
   - Verification (what was run)
   - Docs and Governance
   - Risk and Rollout
   - Hard Rule #15 acknowledgement
7. Create PR: `gh pr create --title "<scope>: <title>" --body "<body>" ${1:-}` (pass `draft` if first arg is "draft").
8. Report PR URL and number.

Do NOT merge. Only create the PR.
