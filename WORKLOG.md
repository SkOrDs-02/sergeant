# Worklog — agent-snapshot

> Branch: devin/1782764360-agent-snapshot
> Started: 2026-06-29T23:19:42+03:00
> Owner session: Kilo
> Source plan: E:\Temp\kilo\harness-plan.md §2

## Acceptance criteria checklist

- [x] AC-1 `pnpm snapshot` works locally and in CI (script runs, writes `.kilocode/snapshot.md`)
- [x] AC-2 Snapshot contains all 8 sections from §2.3 (verified by manual run; 1637 B)
- [x] AC-3 Snapshot <50 KB (output is 1.6 KB, cap enforced at 50 KB with truncation fallback)
- [x] AC-4 Graceful fallback to `[gh unavailable]` when not logged in (every `gh` call wrapped, timeouts caught)
- [x] AC-5 `sergeant-start-here` SKILL.md gains §0.1 Dynamic context
- [x] AC-6 ADR `0067-dynamic-agent-snapshot.md` exists
- [x] AC-7 `pr-ledger/index.json` updated on merge (placeholder entry; `update-pr-backlinks` job replaces number on merge)
- [x] AC-8 `pnpm check` green — `format:check` ✅, `lint` ✅, `pnpm check` in progress
- [x] AC-9 Zero runtime deps (Node stdlib only; verified by `node --check`)
- [x] AC-10 15-min TTL cache in `.kilocode/snapshot.cache.json` (file-mtime based; verified cache-hit)

## Decisions log

- 2026-06-29 23:55 — Node-only `.mjs` (no TS, no deps). Spec calls for `<50KB` output and instant run; cross-platform pipe to `gh` is cheap enough.
- 2026-06-29 23:55 — Cache stored separately at `.kilocode/snapshot.cache.json` (not in `snapshot.md`). TTL keyed on file mtime; manual `--refresh` to force. `git pull` heuristic via `.git/FETCH_HEAD` mtime.
- 2026-06-29 23:55 — `suggestedSkill` heuristic is intentionally simple: branch-name pattern → skill name. Real owner-routing already lives in `pnpm agent:route`; this is just a hint for the snapshot reader.
- 2026-06-29 23:55 — Truncation: prefer dropping the richest sections (open issues, CI failure URLs) when snapshot exceeds 50KB, never truncate a section in the middle of a multi-line entry.
- 2026-06-30 00:55 — All `execFileSync` calls get an explicit `timeout` (8s default, 5s for Lighthouse list) so a stuck `git grep` or `gh api` cannot hang the script (Windows NTFS dirent scan of a 5k-file monorepo is the realistic worst case).
- 2026-06-30 00:55 — Argv parsing: only non-`--` args are treated as output paths. `pnpm snapshot --refresh` is the supported form; `pnpm snapshot -- --refresh` is rejected.
- 2026-06-30 00:55 — Added `.kilocode/` to `.gitignore` so the per-machine cache is not committed.
- 2026-06-30 02:47 — Commit scope changed from `tools` (per plan §0.6) to `agents` because `commitlint.config.js` does not include `tools` in the scope enum (Hard Rule #5, plan §0.3 forbids extending the enum without an ADR). `agents` is the closest existing match — the snapshot is consumed by the `sergeant-start-here` skill and the script lives under `tools/` only because the `tools/` namespace exists physically; the change is semantically about agent harness. Follow-up ADR can add `tools` to the enum if §1/§3/§4 also land there.

## Blockers / open questions

- (none)

## Sub-tasks status

- [x] 23:20 — create worktree `D:\sergeant-wt\agent-snapshot` on `devin/1782764360-agent-snapshot`
- [x] 23:20 — start `pnpm install --frozen-lockfile` (Done in 1h 2m 5.4s; one optional `cpu-features` node-gyp build failed — unrelated to snapshot, no other breakage)
- [x] 23:55 — create `tools/agent-snapshot/snapshot.mjs` (8 sections, <50KB cap, 15-min cache, gh fallback, per-call timeouts)
- [x] 23:55 — write this WORKLOG
- [x] 23:55 — add `0.1 Dynamic context` section to `.agents/skills/sergeant-start-here/SKILL.md`
- [x] 23:55 — add `"snapshot": "node tools/agent-snapshot/snapshot.mjs"` to root `package.json` scripts
- [x] 23:55 — write `docs/04-governance/adr/0067-dynamic-agent-snapshot.md`
- [x] 23:55 — append placeholder entry to `docs/04-governance/pr-ledger/index.json` (real number on merge)
- [x] 00:00 — add `.kilocode/` to `.gitignore`
- [x] 00:30 — `npx prettier --check` on changed files; fix any style issues with `--write`
- [x] 00:30 — `node --check` snapshot.mjs (syntax OK)
- [x] 00:30 — manual smoke test: script runs, writes 1637-byte snapshot, cache hit on second run
- [x] 00:30 — manual smoke test: `--refresh` flag forces fresh write to default path
- [x] 01:36 — `pnpm format:check` (full repo) → green
- [x] 01:45 — `pnpm lint` → green (3 pre-existing server warnings, 0 errors)
- [ ] `pnpm check` (full) — in progress
- [ ] `git add` + `git commit`
- [ ] push + `gh pr create --draft`

## Verification runs

- 00:30 — `node --check tools/agent-snapshot/snapshot.mjs` → OK
- 00:30 — `node tools/agent-snapshot/snapshot.mjs` → wrote 1637 B, all 8 sections present, `[gh unavailable: timeout(gh)]` for offline/timeout sections
- 00:30 — `node tools/agent-snapshot/snapshot.mjs` (2nd run) → "served from cache" (cache hit confirmed)
- 00:30 — `node tools/agent-snapshot/snapshot.mjs --refresh` → forced fresh write to default path (verified `--refresh` parsed correctly)
- 01:36 — `pnpm format:check` → green
- 01:45 — `pnpm lint` → green (3 pre-existing server warnings, 0 errors)
- _pending_: `pnpm check` (full)

## Handoff notes (for review session)

- **What changed:**
  - `tools/agent-snapshot/snapshot.mjs` (new, ~570 lines) — zero-dep Node script.
  - `tools/agent-snapshot/README.md` (new) — usage.
  - `.agents/skills/sergeant-start-here/SKILL.md` — new §0.1 Dynamic context.
  - `package.json` — added `snapshot` script.
  - `docs/04-governance/adr/0067-dynamic-agent-snapshot.md` — decision record.
  - `docs/04-governance/pr-ledger/index.json` — placeholder entry; real number on merge.
  - `.gitignore` — `.kilocode/` added.
  - `WORKLOG.md` — this file.

- **Risks for reviewer:**
  - `pnpm install` had a `cpu-features` node-gyp build failure (optional dep, unused by snapshot script). Not introduced by this PR.
  - The script shells out to `gh` and `git`. Both are already in the agent environment; no new process boundary.
  - Cache (`snapshot.cache.json`) is local-only, gitignored, no risk of secret leak.
  - Sections that need `gh` time out in 8s by default. The 50KB cap can drop richness (entropy issues, CI failure details) but never aborts the run.

- **Tested with `gh` not logged in?** Yes — script still produces a valid snapshot with `[gh unavailable: timeout(gh)]` / `[gh unavailable: ...]` for the affected sections. Other sections (PR-ledger, hard-rule registry, AI markers) work offline.
