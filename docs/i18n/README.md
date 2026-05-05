# Internationalisation (i18n)

> **Last validated:** 2026-05-05 by Devin. **Next review:** 2026-08-04.
> **Status:** Active

Sergeant поки **UA-only** і не приймає англомовних beta-юзерів. Замість дорогого
runtime-i18n до того, як з'явиться product-вимога, ми тримаємо **lightweight foundation**
у `apps/web/src/shared/i18n/uk.ts` — одна заміна `messages.x.y` ↔ `t('x.y')` буде
достатня для миттєвого swap-у.

## Документи

| Документ                         | Призначення                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| [`readiness.md`](./readiness.md) | Phase 1–4 readiness, ESLint rule `no-cyrillic-jsx-literal`, allowlist burndown plan. |

## Поточний стан (round 15, 2026-05-05)

- Foundation closed: 6 message-груп, ~80 ключів у `uk.ts`.
- ESLint rule `sergeant-design/no-cyrillic-jsx-literal` — `warn`-mode + allowlist.
- Burndown через codemod `scripts/codemods/i18n-burndown/` — pack-и по 5–10 файлів за PR.
- Runtime swap (Phase 4) — **не починається** до існування product-вимоги.

## Cross-links

- Source каталог: [`apps/web/src/shared/i18n/uk.ts`](../../apps/web/src/shared/i18n/uk.ts).
- Burndown codemod: [`scripts/codemods/i18n-burndown/`](../../scripts/codemods/i18n-burndown/README.md).
- Web deep-dive item #18: [`docs/diagnostics/2026-05-03-web-deep-dive/00-overview.md`](../diagnostics/2026-05-03-web-deep-dive/00-overview.md).
- Allowlist file: [`apps/web/eslint.i18n-allowlist.json`](../../apps/web/eslint.i18n-allowlist.json).
