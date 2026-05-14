# Rule 23 — Archive-move depth integrity — no broken `../X` links in docs archives

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-14 by Codex
> **Next review:** 2026-08-12
> **Status:** Active

> Per-rule canonical body for Hard Rule #23. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `docs/**/archive/**/*.md`

## Enforced by

- **ci** — `pnpm lint:archive-move-depth`
- **test** — `scripts/__tests__/check-archive-move-depth.test.mjs`

## Why

When an audit or plan moves into an `archive/` folder, every relative link outside that subtree becomes one directory deeper. Broken links often look plausible in review (`../initiatives/foo.md`) but resolve to a non-existent sibling under the old folder. The gate catches the common one-level depth drift and prints the corrected target.

## BAD

```markdown
<!-- docs/audits/archive/2026-05-old-audit.md -->

[Plan](../initiatives/foo.md)
```

## GOOD

```markdown
<!-- docs/audits/archive/2026-05-old-audit.md -->

[Plan](../../initiatives/foo.md)
```

## Related

- **agents** — #23
- **audit** — `docs/audits/2026-05-13-dead-code-hard-rules-roast.md` § P2
