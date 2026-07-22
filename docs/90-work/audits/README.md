# Audits — каталог документів та статусів

> **Last validated:** 2026-07-20 by @cursoragent (post fast-forward archive). **Next review:** 2026-10-18.
> **Status:** Active

> **Single source of truth → root [`AGENTS.md`](../../../AGENTS.md).** Цей файл —
> індекс аудиторських документів. Не дублюй repo policy: hard rules,
> performance budgets, governance — у `docs/04-governance/governance/`.

## Що тут лежить

| Шлях                                                         | Призначення                                                                                                                                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`_runner-report.md`](./_runner-report.md)                   | Останній triage digest audits-runner (Reference; шляхи всередині можуть вказувати на pre-archive локації — канон після 2026-07-20 = `archive/`)                                         |
| [`user-story-ledger.csv`](./user-story-ledger.csv)           | CSV ledger user-story проходів                                                                                                                                                          |
| [`2026-07-21-design-audit.md`](./2026-07-21-design-audit.md) | Дизайн-аудит apps/web (Reference): скоринг-baseline для наступної ітерації + уроки методології                                                                                          |
| [`product-knowledge-finyk.md`](./product-knowledge-finyk.md) | **Active.** Продуктовий аудит знань finyk: тріангуляція founder ↔ доки ↔ код (37 питань). Канон, який він породив — [`docs/01-product/model/finyk.md`](../../01-product/model/finyk.md) |
| [`archive/`](./archive/)                                     | Усі завершені / Closed / Draft-stub аудити й прожарки (fast-forward 2026-07-20)                                                                                                         |

Живий `Active` аудит у корені каталогу один — `product-knowledge-finyk.md`
(продуктовий аудит знань finyk, 2026-07-22). Новий аудит кладеться сюди як
`YYYY-MM-DD-*.md`; після `Closed`/`Done` — `git mv` у `archive/`.

## Архів (зведення)

Повний список — у [`archive/`](./archive/). Ключові групи:

- **Прожарки 2026-05** — `archive/2026-05-13-*-roast.md`, UX/revenue/security/testing/…
- **Page-audits** — `archive/2026-05-13-page-audit-*.md` + consolidated
- **Deep / synthesis** — `archive/2026-05-15-deep-audit-state-of-repo.md`, `archive/2026-05-03-web-deep-dive/`
- **Cleanup / fable5 / financial** — `archive/2026-06-08-codebase-cleanup-audit.md`, `archive/2026-06-11-fable5-independent-audit.md`, `archive/2026-06-28-financial-launch-monetization-audit.md`
- **Production-readiness / browser loops** — `archive/production-readiness-*.md`, `archive/*-browser-*.md`, `archive/user-story-loop.md`
- **Draft stubs** — `archive/2026-08-XX-sync-engine-roast.md`, `archive/2026-08-XX-openclaw-internal-roast.md`

**Batch 2026-07-20** (fast-forward, 90-day gate skipped): усі ще живі Closed/Done/Reference аудити перенесено з кореня в `archive/`. Деталі — [`archive/README.md`](./archive/README.md).

## Як читати

`Status` у хедери файлу — lifecycle: `Active` / `Draft` / `Closed` / `Archived` / `Reference` / `Scaffolded`.
`Implemented` / `Outstanding` — coarse-grain лічильники всередині документа (не дублюємо в цьому README після архівування).

## Process

- При злитті PR-у, що закриває recommendation з аудиту: оновити inline статус у самому документі.
- Коли документ повністю `Closed` / `Done` / `Reference` і більше не є living tracker — `git mv` у `archive/` + оновити inbound-лінки (`pnpm docs:check-links`, `pnpm lint:archive-move-depth`). Fast-forward без 90 днів — лише за явним рішенням founder-а (як Batch 2026-07-20).
- CI freshness-gate (`scripts/check-tech-debt-freshness.mjs`) форсить `Last validated:` на living tracker-ах; архівні файли — read-only (`Next review: ніколи`).
- Для нових аудитів використовуй шаблон з [`archive/2026-04-28-ux-ui-audit.md`](./archive/2026-04-28-ux-ui-audit.md) (front-matter + Lifecycle-status + явний tracker).
