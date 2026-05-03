# H7 — `apps/web/vercel.json` vs root `vercel.json` config drift

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                                |
| -------------- | ---------------------------------------------------- |
| **Severity**   | High (CVSS 7.0, AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N) |
| **Sprint**     | [Sprint 2](./sprint-2.md)                            |
| **Owner**      | devops                                               |
| **Effort**     | 0.25 person-day                                      |
| **Status**     | Open                                                 |
| **Discovered** | 2026-05-03 deep security review                      |

## Summary

Two `vercel.json` files exist: one at the repository root (91 lines) and one
under `apps/web/vercel.json`. Vercel reads only the file that lives in the
project's configured root directory. If the project is configured with the
repository root, `apps/web/vercel.json` becomes dead code (and vice versa).
Security headers (COOP/COEP/Permissions-Policy, the future CSP from
[C2](./C2-frontend-csp.md)) only protect users via whichever file is "live".

## Affected files

- `vercel.json` (root)
- `apps/web/vercel.json`
- Vercel project setting "Root Directory" (out of repo)

## Evidence

Side-by-side `diff vercel.json apps/web/vercel.json` shows divergent
`headers[*]` blocks. The root file ships richer headers; the per-app file
predates a previous header refresh.

## Impact

1. **Silent header regression.** A future change to "Root Directory" in the
   Vercel UI silently downgrades production headers without any code change or
   PR review.
2. **CSP rollout blocked.** [C2](./C2-frontend-csp.md) plans to ship CSP via
   Vercel headers; if the wrong file is live, the CSP will simply be absent in
   production.
3. **Audit trail gap.** Header drift cannot be reconstructed from the git log
   alone because the failure mode is "correct file, wrong project setting".

## Recommendation

- Pick a single source of truth. Recommended: keep the root `vercel.json`
  (matches monorepo convention used by Turborepo + pnpm workspaces) and delete
  `apps/web/vercel.json`.
- Add a CI guard `scripts/check-vercel-config.sh` that fails if both files
  exist or if the live file diverges from a checksum committed to the repo.
- Document the Vercel "Root Directory" expected value in
  `docs/deploy/vercel.md` (creating that page if needed).

## Correction points

- Delete `apps/web/vercel.json`.
- Add `scripts/check-vercel-config.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
if [[ -f apps/web/vercel.json ]]; then
  echo "::error::apps/web/vercel.json exists — only the root vercel.json is allowed."
  exit 1
fi
```

- `.github/workflows/ci.yml` — add `bash scripts/check-vercel-config.sh` to the
  lint job.
- `docs/deploy/vercel.md` (new) — describe the SSOT and the Vercel project
  configuration.
- `docs/security/access-matrix.md` — link Vercel project settings to the
  privileged surfaces register.

## Verification

- **CI:** dropping a stub `apps/web/vercel.json` and pushing a PR fails the
  lint job.
- **Manual:** in Vercel UI, confirm "Root Directory" is `/` and deploy preview
  responds with `Cross-Origin-Opener-Policy: same-origin`.
- **Header smoke:** `curl -sI https://app.sergeant.example | grep -i
  'cross-origin-opener-policy'` returns the expected value.

## Cross-references

- [`./C2-frontend-csp.md`](./C2-frontend-csp.md)
- [`../disaster-recovery.md`](../disaster-recovery.md) — Vercel re-deploy
  procedure relies on the root file.
