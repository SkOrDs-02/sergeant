# Governance

> **Last touched:** 2026-09-19 by @claude. **Next review:** 2026-12-30.
> **Status:** Active

Governance у Sergeant навмисно розділено на людино-читану політику і машинно-читане enforcement: текст пояснює «чому», JSON-реєстри й генератори дають CI те, що можна перевірити.

## Джерела істини

- [AGENTS.md](../../../AGENTS.md) — людино-читаний контракт репо: hard rules, інваріанти, бюджети, антипатерни.
- [hard-rules.json](./hard-rules.json) — машинно-читаний реєстр Hard Rules для CI й тулінгу; схема — [hard-rules.schema.json](./hard-rules.schema.json), і її справді читає `scripts/check-hard-rules-registry.mjs`.
- [rules/](./rules/README.md) — канонічні тіла правил (по файлу на правило) плюс ненумеровані ESLint-конвенції. 3-way sync `AGENTS.md ↔ hard-rules.json ↔ rules/*.md` стереже `pnpm lint:hard-rules-registry`.
- [hard-rules-matrix.md](./hard-rules-matrix.md) — згенерована матриця enforcement; руками не редагувати (`pnpm hard-rules:check`).
- [review-checklist.md](./review-checklist.md) — операційний чекліст рев'юера.
- [release-policy.md](./release-policy.md) — класи релізів, блокери, порядок, очікування щодо нотаток.
- [incident-severity-policy.md](./incident-severity-policy.md) — модель severity і поріг для постмортему.
- [security-incident-policy.md](./security-incident-policy.md) — класифікація компрометації доступу і first-response.
- [policy-review.md](./policy-review.md) і [doc-freshness.md](./doc-freshness.md) — каденс і процес перегляду.
- [freshness-dashboard.html](./freshness-dashboard.html) — згенерований дашборд `Last validated` / `Next review` (`pnpm docs:freshness-dashboard`).
- [pnpm-overrides-policy.md](./pnpm-overrides-policy.md) — правила для `pnpm.overrides`; гейт `pnpm lint:overrides`. Самі записи — у [`pnpm-overrides.md`](../../../pnpm-overrides.md).
- [harness-versioning.md](./harness-versioning.md) — bump-правила для `.agents/harness-versions.json`.
- [snapshot.md](./snapshot.md) — динамічний снапшот для агентів (`pnpm snapshot`).
- [wip-limits.json](./wip-limits.json) — ліміти WIP на трекер для `pnpm docs:check-wip-limits`, trust-badge і `docs/today.md`.
- [external-link-allowlist.json](./external-link-allowlist.json) — allowlist для `pnpm docs:check-links` (immutable ADR-permalink-и, anti-bot хости, localhost). Кожен запис потребує змістовного `reason`; лоадер відкидає порожні й короткі.
- [repo-map.auto.json](./repo-map.auto.json), [service-catalog.auto.json](./service-catalog.auto.json) — згенеровані артефакти (Rule #25); редагуй генератори у `scripts/docs/`, не файли.
- [schemas/](./schemas/) — JSON Schema для `repo-map`, `service-catalog` і `pr-ledger`. **Описові, не enforced:** генератори лише пишуть `$schema` рядком, а `scripts/ci/update-pr-backlinks.mjs --check` валідує ledger власним кодом, не через `ajv` по схемі. Розходження схеми з фактичним виводом сьогодні ніхто не зловить — це борг, не гарантія.

### Історичне — не редагувати, не виконувати

- [ai-pr-checklist.md](./ai-pr-checklist.md) — Deprecated: guard-воркфлоу прибрано ([ADR-0082](../adr/0082-private-storage-repo-posture.md)); файл лишається як контекст до старих PR.
- [feature-flags.md](./feature-flags.md) — Deprecated: реєстр тумблерів живе у [`docs/engineering/architecture/feature-flags.md`](../../engineering/architecture/feature-flags.md) (канон за `AGENTS.md § See also`).
- Audit freeze 2026-05-05 → 2026-06-02 — завершений 4-тижневий фриз на нові audit/initiative/playbook/ADR-файли; воркфлоу `audit-freeze.yml` і секцію PR-шаблону знято 2026-06-03. Запис — [upstream-permalink](https://github.com/SkOrDs-02/sergeant/blob/4da4557c5cadb298f889fbea3d7457f71bd223ee/docs/04-governance/governance/audit-freeze-2026-05-05.md).

## CI-гейти

- `pnpm lint:governance-sync --strict`
- `pnpm lint:hard-rules-registry`
- `pnpm hard-rules:check`
- `pnpm docs:check-freshness-coverage`
- `pnpm docs:check-freshness-dashboard`
- `pnpm docs:check-adr-graph` — статуси, двобічний Supersedes і README-індекс ADR
- `pnpm docs:check-pr-ledger` — Rule #26

## Коли оновлювати governance-доки

- змінюється hard rule або механізм його enforcement
- новий playbook стає канонічним для ризикованого воркфлоу
- змінюється процес релізу чи реагування на інциденти
- ADR змінює статус — supersede з обох кінців плюс рядок у [`adr/README.md`](../adr/README.md)
