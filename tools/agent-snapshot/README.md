# tools/agent-snapshot

Single-file Node script that gathers a "dynamic context" report for Sergeant
agents at session start. See
[`docs/04-governance/adr/0067-dynamic-agent-snapshot.md`](../../docs/04-governance/adr/0067-dynamic-agent-snapshot.md)
for the full design.

## Usage

```bash
pnpm snapshot                            # writes .kilocode/snapshot.md
node tools/agent-snapshot/snapshot.mjs /tmp/out.md   # write to a custom path
pnpm snapshot --refresh                  # bypass 15-min cache
```

## Sections (always present, gracefully degraded)

1. Repo (branch, base, worktree count, dirty state)
2. CI last run on main (via `gh api …/check-runs`)
3. Budgets (apps/web JS/CSS bundle, Lighthouse CI)
4. Open entropy-janitor issues (via `gh issue list --label 'entropy-janitor/*'`)
5. Recent PR-ledger entries (read from `docs/04-governance/pr-ledger/index.json`)
6. Hard-rule drift warnings (registry vs. per-rule file count)
7. Active initiative deadlines (next 30 days, `TODO(NNNN-...): YYYY-MM-DD`)
8. Agent hints (last commit metadata, AI-marker scan, branch → suggested skill)

Each section degrades to `[unavailable: <reason>]` if its dependency fails;
the script never throws on a missing `gh` or unreadable file.

## Constraints

- Zero runtime dependencies — uses only Node stdlib (`node:child_process`,
  `node:fs`, `node:path`).
- Output is hard-capped at **50 KB**; on overflow, the richest sections
  (entropy issues, CI failure details) are dropped, never truncated mid-line.
- Cache lives in `.kilocode/snapshot.cache.json` (15-min TTL by mtime),
  force-refresh via `--refresh`; auto-invalidated when `.git/FETCH_HEAD`
  mtime is <60s (a `git pull` just happened).
- Script never reads Sentry DSN, tokens, or any other env-defined secret
  (Hard Rule #21 redaction policy applies).
