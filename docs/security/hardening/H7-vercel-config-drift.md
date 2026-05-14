# H7 — `apps/web/vercel.json` vs root `vercel.json` config drift

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-04 — SSOT at `apps/web/vercel.json` + CI guard, after live-rollback of an incorrect SSOT choice).

| Field          | Value                                                           |
| -------------- | --------------------------------------------------------------- |
| **Severity**   | High (CVSS 7.0, AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N)            |
| **Sprint**     | [Sprint 2](./sprint-2.md)                                       |
| **Owner**      | devops                                                          |
| **Effort**     | 0.5 person-day (incl. live-rollback after wrong-SSOT incident)  |
| **Status**     | Closed (2026-05-04 — SSOT at `apps/web/vercel.json` + CI guard) |
| **Discovered** | 2026-05-03 deep security review                                 |

## Summary

Two `vercel.json` files exist: one at the repository root (94 lines) and one
under `apps/web/vercel.json` (98 lines). Vercel reads only the file that lives
in the project's configured Root Directory. The Vercel project for `sergeant`
is configured with **Root Directory = `apps/web`**, so the live file is
`apps/web/vercel.json` — the root copy was dead code that silently aged out.
Security headers (COOP/COEP/Permissions-Policy, the CSP from
[C2](./C2-frontend-csp.md)) only protect users via whichever file is "live".

## Affected files

- `vercel.json` (root) — dead config until 2026-05-04, now removed.
- `apps/web/vercel.json` — the live config Vercel reads.
- Vercel project setting "Root Directory" (out of repo, value: `apps/web`).

## Evidence

Side-by-side `diff vercel.json apps/web/vercel.json` (taken on 2026-05-03)
showed divergent `headers[*]` blocks. The root file shipped richer headers
(COOP/COEP added in PR #1551); `apps/web/vercel.json` predated that refresh.
The Vercel-bot PR comment metadata
(`{"isMonorepo":true,"rootDirectory":"apps/web"}`) confirms the live file is
`apps/web/vercel.json`, not the root one.

## Impact

1. **Silent header regression.** A future change to "Root Directory" in the
   Vercel UI silently downgrades production headers without any code change or
   PR review.
2. **CSP rollout blocked.** [C2](./C2-frontend-csp.md) plans to ship CSP via
   Vercel headers; if the wrong file is live, the CSP will simply be absent in
   production.
3. **Audit trail gap.** Header drift cannot be reconstructed from the git log
   alone because the failure mode is "correct file, wrong project setting".
4. **Build break (realised 2026-05-04, PR #1595).** Deleting
   `apps/web/vercel.json` while leaving Vercel's Root Directory at `apps/web`
   removed the `installCommand` / `buildCommand` Vercel was actually reading,
   so production builds started failing with rolldown's `cannot resolve
@sergeant/db-schema/sqlite/migrations` error. Caught on the post-merge
   Vercel preview status; remediated in PR-#1599 (this card).

## Recommendation

- Pick a single source of truth. **Decision (2026-05-04):** keep
  `apps/web/vercel.json` because the Vercel project's Root Directory is
  `apps/web`. Delete the root `vercel.json` (it is dead config, never read by
  Vercel).
- Add a CI guard `scripts/check-vercel-config.sh` that fails if any
  `vercel.json` exists outside `apps/web/`.
- Document the Vercel "Root Directory" expected value (= `apps/web`) and the
  out-of-repo settings contract in `docs/deploy/vercel.md`.

## Correction points

- Delete root `vercel.json`.
- Keep `apps/web/vercel.json` as SSOT, with `outputDirectory: "dist"` (relative
  to Root Directory) and `installCommand` + `buildCommand` that pre-build
  `@sergeant/db-schema` before `@sergeant/web`.
- Update `scripts/check-vercel-config.sh` to forbid any `vercel.json` outside
  `apps/web/`:

```bash
#!/usr/bin/env bash
set -euo pipefail
mapfile -t extras < <(find . -path ./node_modules -prune -o \
  -name vercel.json -not -path ./apps/web/vercel.json -print)
if [[ ${#extras[@]} -gt 0 ]]; then
  echo "::error::Found extra vercel.json files (only apps/web/vercel.json is allowed):"
  printf '::error::  %s\n' "${extras[@]}"
  exit 1
fi
[[ -f apps/web/vercel.json ]] || { echo "::error::apps/web/vercel.json missing"; exit 1; }
```

- `.github/workflows/ci.yml` — keep `bash scripts/check-vercel-config.sh` in
  the `check` job (already wired in 2026-05-04 morning batch, just inverted).
- `docs/deploy/vercel.md` — already documents the SSOT and the Vercel project
  configuration; updated to note that Root Directory must remain `apps/web`.
- `docs/security/access-matrix.md` — link Vercel project settings to the
  privileged surfaces register.

## Verification

- **CI:** dropping a stub `vercel.json` at the repo root or under any other
  app (e.g. `apps/server/vercel.json`) and pushing a PR fails the `check` job.
- **Manual:** in Vercel UI, confirm "Root Directory" is `apps/web` and deploy
  preview responds with `Cross-Origin-Opener-Policy: same-origin`. Production
  preview on PR-#1599 went green after the SSOT swap, confirming
  `installCommand` / `buildCommand` are honoured again.
- **Header smoke:** `curl -sI https://app.sergeant.example | grep -i
'cross-origin-opener-policy'` returns the expected value.

## Implementation log

| Date       | Event                                                                                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-03 | Drift detected during Sprint 2 prep; card opened.                                                                                                                                                                    |
| 2026-05-04 | First attempt (PR #1595): deleted `apps/web/vercel.json` on the wrong assumption that Root Directory = `/`. Vercel build started failing post-merge with rolldown `@sergeant/db-schema/sqlite/migrations` error.     |
| 2026-05-04 | Live-rolled in PR-#1599: restored `apps/web/vercel.json` (now SSOT), deleted root `vercel.json` (dead config), inverted `scripts/check-vercel-config.sh`, refreshed `docs/deploy/vercel.md`. Card closed in earnest. |

## Cross-references

- [`./C2-frontend-csp.md`](./C2-frontend-csp.md)
- [`../disaster-recovery.md`](../disaster-recovery.md) — Vercel re-deploy
  procedure relies on `apps/web/vercel.json`.
- [`../../deploy/vercel.md`](../../deploy/vercel.md) — Vercel project SSOT
  - incident playbook (this file is the long-term remediation).
