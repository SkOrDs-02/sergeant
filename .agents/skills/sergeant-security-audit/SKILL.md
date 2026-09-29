---
name: sergeant-security-audit
description: "Use when running a security review of Sergeant code or API, auditing deps with pnpm audit, or checking PAT/credential safety; before any auth or user-data surface ships; UA: security review, перевірка безпеки, аудит."
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` so UA-only chat routing still resolves the right SKILL.
---

# Security Audit у Sergeant

Security review in Sergeant is not a generic OWASP checklist. Every surface has Sergeant-specific bindings that an agent without this skill systematically misses.

## Non-negotiable commands (run before any security claim)

```bash
pnpm audit --audit-level=moderate     # CVEs across all pnpm workspaces
pnpm lint                             # catches Pino redaction violations via ESLint rules
pnpm typecheck                        # catches unsafe type coercions
```

## Hard Rules that govern security

| Rule | What to verify |
|---|---|
| **Hard Rule #20 — No OpenClaw PATs in production** | Grep diff for any literal `OPENCLAW_GITHUB_PAT` / `Git_PAT` not in env-var context; `assertStartupEnv()` fail-closes if either leaks into prod `process.env` (defense-in-depth after the OpenClaw Gateway decommission — ADR-0075) |
| **Hard Rule #21 — Pino redaction policy** | New logging path → verify key is covered by `REDACT_KEY_NAMES` in `packages/shared/src/lib/pii.ts`; check `apps/server/src/obs/logger.ts` redaction walker |
| **Hard Rule #22 — Skill body security scan** | When reviewing `.agents/skills/**/SKILL.md` changes run `pnpm lint:skills` — 7-category threat scanner |

## Server-side API security (`apps/server`)

- **Auth:** Every route in `apps/server/src/modules/` must apply Better Auth session middleware. Confirm `requireSession` (or equivalent) is present — verify the error path, not just the happy path.
- **Input validation:** Every request body must pass through a Zod schema. Raw `req.body` access without schema = flag immediately.
- **SQL injection — audit BOTH access paths.** `drizzle.ts` wraps the same `pg` Pool as `db.ts`, so Sergeant has two live query surfaces and checking only one misses half the attack area:
  1. **Raw `pg`** (most modules — `ai-memory`, `logRetention`, …): flag any query string built by concatenation/interpolation instead of `$1` placeholders.
  2. **Drizzle**: flag user-controlled interpolation inside `` sql`...` `` tagged templates.
  Also check `dbReplica.ts` call sites (`queryReplica()`) — same rules apply there.
- **Hard Rule #1 (bigint coercion):** Serializers that skip `Number()` cast on `bigint` DB fields can expose internal types to API consumers — flag as data-contract issue.

## Pino redaction (`apps/server/src/obs/logger.ts`)

The logger imports `REDACT_KEY_NAMES` from the package root `@sergeant/shared` (source of truth: `packages/shared/src/lib/pii.ts`). Redaction is key-name based (case-insensitive), recursive, non-mutating. Primitives redact to `"[redacted]"`, objects to `null`.

When adding a surface that logs user data:

1. Check whether the key name is already in `REDACT_KEY_NAMES`.
2. If not, add it in `packages/shared/src/lib/pii.ts` — the shared package exports it to both server logger and browser Sentry SDK.
3. Run `pnpm lint` — ESLint rules check redaction policy compliance.

Do not mutate the log object before passing to Pino; redaction runs non-mutating on the value passed in.

## Supply chain (`pnpm audit`)

```bash
# Flag high/critical CVEs across all workspaces
pnpm audit --json | jq '.vulnerabilities | to_entries[]
  | select(.value.severity == "high" or .value.severity == "critical")'
```

- Cross-reference CVEs with `renovate.json` — if Renovate already has a pending update PR, do not create a duplicate; comment on the existing one instead.
- For license/compliance risk (e.g. a copyleft transitive dep), inspect the resolved tree directly — `pnpm licenses list --json` — and record anything actionable in [`docs/governance/security/audit-exceptions.md`](../../../docs/governance/security/audit-exceptions.md). The repo has **no** `THIRD_PARTY_LICENSES.md`; do not look for one.
- Run `pnpm outdated` to surface packages outside Renovate range constraints.
- For safe dep bumps, follow `docs/start/instructions/bump-dep-safely.md`.

## Frontend security (`apps/web`)

- `dangerouslySetInnerHTML` → always flag for XSS review; require sanitization proof.
- LocalStorage access outside `apps/web/src/shared/lib/storage/` `TypedStore` wrappers → flag as unreviewed data leakage surface.
- Auth tokens must travel only via HttpOnly cookies managed by Better Auth; tokens must never appear in `localStorage` or any JS-accessible storage.

## Mobile security (`apps/mobile`)

- MMKV keys holding sensitive data (tokens, PII) must not store plaintext; verify encryption configuration.
- Deep links wired via `apps/mobile/app.config.ts` (`scheme: "sergeant"` + Android `intentFilters`) and routed through expo-router under `apps/mobile/app/`: ensure unknown scheme parameters are sanitized before use in routing.

## Adversarial pass — try to disprove every finding before reporting it

A finding nobody argued against is a claim, not a result. Run this pass as a **separate step after** collecting findings, with the hunting context set aside: re-read the code the finding points at and argue the opposite case.

For each finding, answer all four. Any "no" drops it out of the report body.

1. **Reachability.** Is there a concrete path from untrusted input to this code? Name the entry route in `apps/server/src/routes/` or the UI surface. "An attacker could call this internal helper" is not a path.
2. **Existing gate.** Is it already blocked upstream? Check the Zod schema, `requireSession`, `REDACT_KEY_NAMES`, and the ESLint rules in `packages/eslint-plugin-sergeant-design` before claiming the surface is unguarded.
3. **Citation.** Open the file at the exact line you cite and confirm the quoted code is there, in the version under review. A finding that quotes code that no longer exists is worse than no finding.
4. **Remediation.** Does the fix change behavior an existing test asserts? If yes, say so in the finding — a "fix" that breaks a green test is a design decision, not a patch.

Record the verdict per finding:

| Verdict | Meaning | Where it goes |
|---|---|---|
| `confirmed` | All four answered yes | Report body, with severity |
| `needs_validation` | Reachability plausible but unproven | Report appendix, phrased as a question |
| `rejected` | Failed any check | Listed with the reason it was dropped |

Report rejected findings too, one line each. A reviewer who sees "checked and dropped: X because Zod schema already rejects it" knows that area was covered; silence looks identical to never having looked.

## Coverage ledger — say what you did NOT check

Before reporting, list the trust boundaries in scope and mark each one. An audit that names five findings and stays silent about mobile deep links reads as "mobile is clean" when it may mean "mobile was never opened".

| Boundary | Checked | Note |
|---|---|---|
| Server routes (auth + Zod) | yes/no | which modules |
| SQL — raw `pg` and Drizzle, incl. `queryReplica()` | yes/no | |
| Pino redaction on new log paths | yes/no | |
| Client storage (`TypedStore`, MMKV) | yes/no | |
| Deps (`pnpm audit`) | yes/no | |
| Skill bodies (`pnpm lint:skills`) | yes/no | only if `.agents/skills/**` changed |

Unchecked is a legitimate answer when the diff does not touch that boundary. Say it explicitly rather than omitting the row.

## Severity triage

| Level | Action |
|---|---|
| Critical — CVE / hardcoded secret / auth bypass | Block PR; escalate via `docs/start/instructions/access-governance.md` § Suspected account compromise |
| High — injection vector / missing auth check | Must-fix before merge |
| Medium — logging exposure / outdated dep with known exploit | Fix in this PR or create tracked issue |
| Low — best-practice gap / minor config drift | PR comment; not a blocker |

## What NOT to do

- Do not run `npm audit` — pnpm workspaces require `pnpm audit` to cover all packages.
- Do not flag Drizzle's query builder as "raw SQL risk" without confirming user input reaches it.
- Do not confuse OpenClaw PATs (Hard Rule #20) with Better Auth session tokens — different threat models, different remediation paths.
- Do not audit redaction by searching log output for plaintext values — Sergeant's redaction is key-name based; verify the key is listed in `REDACT_KEY_NAMES`.

## Playbooks

- `docs/start/instructions/security-pen-test-checklist.md` — full pentest workflow before launch.
- `docs/start/instructions/access-governance.md` § Suspected account compromise — escalation when credential found in code or logs.
- `docs/start/instructions/rotate-secrets.md` — rotate when a credential is exposed.
- `docs/start/instructions/bump-dep-safely.md` — safe dependency updates after audit findings.
- Skill catalog: `docs/start/agents/agent-skills-catalog.md`.
