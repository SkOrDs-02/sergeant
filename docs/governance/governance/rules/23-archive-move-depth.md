# Rule 23 — Documentation history — no local archive trees

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last touched:** 2026-09-06 by Codex. **Next review:** 2027-03-06.
> **Status:** Active

> Per-rule canonical body for Hard Rule #23. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `docs/**/archive/**`

## Enforced by

- **ci** — `pnpm lint:archive-move-depth`
- **test** — `scripts/__tests__/check-archive-move-depth.test.mjs`

## Why

Локальні `archive/` дублюють Git history, роздувають навігацію і залишають поруч із каноном застарілі твердження. За [ADR-0081](../../adr/0081-repository-simplification.md) завершений snapshot видаляється з checkout після фіксації Outcome та merge evidence, а потрібні історичні посилання ведуть на immutable commit permalink. Історична назва команди збережена для сумісності CI; gate тепер блокує будь-який каталог `archive` усередині `docs/`.

## BAD

```markdown
docs/work/specs/audits/archive/2026-05-old-audit.md
```

## GOOD

```markdown
[Історичний аудит](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-13-testing-devx-roast.md)
```

## Related

- **agents** — #23
- **adr** — [`ADR-0081`](../../adr/0081-repository-simplification.md)
