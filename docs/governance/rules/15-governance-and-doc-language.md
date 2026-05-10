# Rule 15 — Read governance before coding; update docs alongside code; internal docs in Ukrainian

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-09 by @Skords-01
> **Next review:** 2026-08-07
> **Status:** Active

> Per-rule canonical body for Hard Rule #15. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `**/*`

## Enforced by

- **ci** — pnpm lint:governance-sync (errors on dangling apps/packages/scripts refs in non-aspirational docs)
- **ci** — pnpm docs:check-freshness-coverage
- **ci** — pnpm lint:hard-rules-registry (this rule's own enforcer)
- **pr-template** — .github/PULL_REQUEST_TEMPLATE.md (Hard Rule #15 checkboxes)

## Why / What is enforced

> Why a hard rule? Because rules are useless if no one reads them, and docs are dangerous if they describe behaviour the code no longer has. Both failure modes have shipped here ([#1143](https://github.com/Skords-01/Sergeant/pull/1143) deleted scaffolded code partly because the AI agent skipped the playbook; multiple Tailwind-opacity bugs survived because the design-system doc still listed deprecated tokens). This rule closes both gaps.

#### Before writing any code

Both AI agents and human contributors **must** read the relevant governance up front, in this order:

1. **`AGENTS.md`** — Hard Rules (#1–#15), Module ownership map for the path you're touching, AI-marker conventions, Domain invariants.
2. **`CONTRIBUTING.md`** — branch/commit conventions, pre-commit hooks, PR checklist.
3. **`CLAUDE.md`** — Claude/AI-specific commands and guardrails (sister file to AGENTS.md).
4. **The matching playbook** in `docs/playbooks/` — pick by trigger phrase. New API endpoint → `add-api-endpoint.md`. New HubChat tool → `add-hubchat-tool.md`. Removing code → `cleanup-dead-code.md`. Migrations → `add-migration.md`.
5. **The freshness header** of every doc you cite or change (`> Last validated: YYYY-MM-DD by @owner`). If the doc is stale (`Next review` date passed), flag it in the PR — don't blindly trust it, but don't silently ignore it either.

If you're an AI agent, treat steps 1–4 as a **pre-flight checklist**: do not begin implementation until you can name (a) the Hard Rules that apply, (b) the playbook(s) you'll follow, (c) the owner of the path. If no playbook exists for the task type, write a one-paragraph mini-plan and link it in the PR.

#### During the work

- Do not work around a rule because it's inconvenient. If you genuinely believe a rule is wrong, raise it in the PR description (or open an `AGENTS.md` PR first) — don't ship code that violates it.
- If you discover the rule is unclear or contradictory, fix it in the same PR (one paragraph in `AGENTS.md` is cheaper than the next confused agent).
- Honour `@scaffolded` / `@deprecated` / `@experimental` markers (Hard Rule #10).

#### Before opening the PR — update docs alongside code

Documentation is part of the change set, not a follow-up. Treat any of the following as **must-update** when the underlying code/contract moves:

| Code change                                       | Docs that must move with it                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New / changed JSON response shape                 | `packages/api-client/**` types **+** the matching contract test (Hard Rule #3). If the response is documented in `docs/api/*.md`, update there too.                    |
| New SQL migration                                 | `docs/architecture/data-exchange-storage-audit.md` (DB-level invariants), and any ER-diagram in `docs/architecture/`.                                                  |
| New / removed npm script                          | `CONTRIBUTING.md § Everyday Commands`, `CLAUDE.md § Quick commands`.                                                                                                   |
| New Hard Rule, lint rule, or convention           | `AGENTS.md` § Hard Rules (the canonical entry) **+** mirror summary in `CONTRIBUTING.md § Hard rules`. PR template's "AGENTS.md updated?" checkbox **must** be ticked. |
| New design token, palette, or component           | `docs/design/design-system.md`, `docs/design/brandbook.md`, and the relevant audit (`docs/audits/*-audit-*.md`) if it changes status.                                  |
| Deprecating a behaviour                           | Add `@deprecated` JSDoc with `@removeBy YYYY-MM-DD` (Hard Rule #10) **+** update the consuming doc to mark the section `> **Status:** Deprecated`.                     |
| New playbook trigger or HubChat tool              | `docs/playbooks/<name>.md` (or update the existing playbook). Cross-link from `CLAUDE.md § Before you write code` if it's a frequent trigger.                          |
| Anything that invalidates an existing doc's claim | Update the doc in the same PR, or move it to `docs/<area>/archive/` with a `> **Status:** Archived` badge if the claim is no longer relevant.                          |

In every doc you touch, also bump the freshness header:

```md
> **Last validated:** 2026-04-29 by @your-handle. **Next review:** 2026-07-29.
> **Status:** Active
```

If you genuinely change nothing in the doc but its claims still hold, leave the header alone — _do not_ touch the date just to silence freshness warnings. The freshness checker (`scripts/check-tech-debt-freshness.mjs`) accepts unchanged dates.

#### What this rule blocks

- Silent contract drift (server changed, `api-client` didn't).
- Stale design-system docs that still document deprecated tokens / removed components.
- AI agents shipping code that violates a Hard Rule because they didn't read AGENTS.md.
- "Just a one-line change" PRs that quietly remove behaviour the docs still promise.

#### Verification

The PR template includes the relevant boxes (`AGENTS.md updated?`, "Docs updated alongside code?"). CI catches the cases that are mechanically detectable:

- `pnpm lint:governance-sync` — fails (error, not warning) on **concrete** dangling `apps/.../*.ts` / `packages/.../*.ts` / `scripts/...` refs in non-aspirational docs (anything outside `docs/launch/`, `docs/planning/`, `docs/integrations/*-roadmap.md`, `docs/audits/*-implementation-roadmap.md`, ADRs with `Status: proposed`). Refs containing glob/placeholder syntax (`*`, `?`, `<>`, `[]`, `{}`) are skipped — those are templates, not concrete claims.
- `pnpm docs:check-freshness-coverage`, `pnpm docs:check-playbook-index`, `pnpm docs:check-playbook-schema`, `pnpm hard-rules:check`, `pnpm api:check-openapi` — supplementary gates per category.

The remaining categories (api-client type drift, CHANGELOG entries, design-system updates) are still reviewer- and self-discipline-enforced. If a reviewer spots an unchecked-but-required doc update, that's a request-changes signal — not a "follow-up issue". And if `lint:governance-sync` shows a path you renamed/moved, **do not** silence it by adding `<>` placeholders unless the file truly is aspirational — fix the doc to reference the real new path.

#### Doc-source-of-truth language

> Promoted from soft → hard 2026-04-30: agents kept emitting English-only ADR/playbook prose, leaving the repo bilingual-by-accident.

All **prose** in internal docs (ADRs, playbooks, audits, RFCs, architecture docs, governance docs, tech-debt notes, runbooks, design specs) is written in **Ukrainian**. The **only** English-by-default surfaces are:

- `README.md` (public-facing, GitHub default-rendered).
- ADR titles and Status badges (canonical English keywords: `proposed`, `accepted`, `superseded`, `shipped`).
- The first H1 of `AGENTS.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `DEVIN.md` (shared-tooling convention).
- OpenAPI / `docs/api/*` schema & description fields (consumed by tooling).
- Commit messages (Conventional Commits English vocabulary — Hard Rule #5).
- PR titles & descriptions (English so reviewers across timezones / Devin / Codex can scan).
- Code identifiers, command names, log lines, env-var names, error codes (always English).
- Verbatim quotes from English-language sources (RFCs, vendor docs, Stripe error names, etc.).

Inside any of those English surfaces it's still fine to mix Ukrainian prose where it clarifies (e.g. `> _Update 2026-04-30_:` blocks); the rule is about the **default** language for new prose, not a ban.

If a reviewer sees a new prose paragraph or table cell in English in a doc that's not on the exception list above, that's a request-changes signal — switch to Ukrainian and keep the technical terms (token names, flags, function/class identifiers) verbatim.

## Related

- **agents** — #15
