# Дизайн

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-02.
> **Status:** Active

Брендбук, дизайн-система, спеціалізовані патерни, активний v2-rollout і архів закритих аудитів.

## Як знайти потрібне

- **Канонічний контракт для нового UI-коду** → [`design-system.md`](./design-system.md).
- **Бренд (голос, ім'я, палітра)** → [`brandbook.md`](./brandbook.md).
- **Активний v2 редизайн (rollout, migration, live status, backlog)** → [`redesign-v2/`](./redesign-v2/README.md).
- **Спеціалізовані UX-патерни** → таблиця нижче.
- **Закриті аудити та реалізовані пропозиції (для governance-trace)** → [`archive/`](./archive/README.md).
- **Product-side design specs** → [`specs/`](./specs/README.md).
- **Портативний конфіг візуальної системи для AI-агентів** → [`DESIGN.md`](../../../DESIGN.md).

## v2 redesign (травень 2026)

Sergeant v2 редизайн (foundation merged 2026-05) додав parallel v2 token
namespace (glass surfaces, mesh background, ink-strong, Manrope шрифт,
22 нові Lucide icons, AIPill / InsightCard AI surfaces). Legacy `--c-*`
токени лишилися активні — нічого не зламано. Весь кластер винесено в
підпапку [`redesign-v2/`](./redesign-v2/README.md): 5 файлів (governance,
migration, execution-plan, live execution-status, backlog) плюс index,
що підказує куди йти cold.

## Живий styleguide

Сторінка [`/design-showcase`](../../../apps/web/src/core/DesignShowcase) (внутрішня,
лише в dev/preview-збірках) — реально живий showcase усіх примітивів:

- сайдбар з 11 розділами (Кольори, Типографіка, Spacing, Elevation, Motion,
  Форми, Фідбек, Overlays, Theming, A11y, Module Accents);
- тогли theme (light/dark/hc), density (comfortable/compact), напрямок (LTR/RTL)
  та reduced-motion override прямо в шапці;
- у кожному розділі — live demo + копі-паст snippet + Do / Don't таблиця +
  pinned convention badges (дизайн-конвенції — tokens + review, retired ADR-0081).

Якщо щось нове додаєш у `@shared/components/ui` — спочатку онови розділ,
у якому воно живе, а тоді бампай freshness у `design-system.md`.

## Maturity matrix (primitives)

Колонка «Конвенції» — дизайн-конвенції, що тримаються tokens + review
(колишні ESLint-правила retired [ADR-0081](../../04-governance/adr/0081-repository-simplification.md)):

| Розділ         | Maturity   | Showcase якір | Конвенції (tokens + review)                                       |
| -------------- | ---------- | ------------- | ----------------------------------------------------------------- |
| Кольори        | **stable** | `#colors`     | no raw hex, opacity scale, `-strong` companion, no raw dark pairs |
| Типографіка    | **stable** | `#typography` | `.text-style-*` utilities, 12px floor, no arbitrary text size     |
| Spacing        | **stable** | `#spacing`    | radius rhythm (no `rounded-lg`)                                   |
| Elevation      | **stable** | `#elevation`  | —                                                                 |
| Motion         | **stable** | `#motion`     | animation budget (ex-HR #17)                                      |
| Форми          | **stable** | `#forms`      | `focus-visible:` not `focus:`                                     |
| Фідбек         | **stable** | `#feedback`   | empty-state tiers, toast error action                             |
| Overlays       | **stable** | `#overlays`   | `focus-visible:` not `focus:`                                     |
| Theming        | **beta**   | `#theming`    | no raw dark pairs, no raw hex                                     |
| A11y           | **stable** | `#a11y`       | `focus-visible:`, `-strong` contrast, 44px touch targets          |
| Module accents | **stable** | `#accents`    | module-accent containment                                         |

`beta` — API ще не зафіксовано (Theming поки що читає лише `useDarkMode`,
шедулер у роботі); `experimental` — поки що порожньо.

## Enforcement status

Після ADR-0081 частина конвенцій знову має **механічний гейт** — grep-скрипт
[`scripts/check-design-conventions.mjs`](../../../scripts/check-design-conventions.mjs)
(`pnpm lint:design-conventions`, входить у `pnpm lint` і CI `check`): no raw hex
у className, `focus-visible:` замість `focus:`, 12px floor (`text-2xs` і
`text-[<12px]` лише з allowlist-винятками у самому скрипті). Скоуп скрипта —
`apps/web/src`, `apps/landing/src`, `apps/mobile-shell/src` (`SCAN_DIRS`).
**Review-only** лишаються AST-рівневі конвенції: opacity scale, `-strong`
companions, module-accent containment — свідомо не покриті grep-скриптом.

`apps/mobile/src` під гейт **не** заведений: NativeWind-поверхня має 156
порушень 12px-floor і нуль `.text-style-*`, тож мігрувати немає куди —
розширення gated на створення семантичної шкали для mobile
([`frontend.md` п.8](../../90-work/tech-debt/frontend.md)).

44×44 touch-target floor гейтить окремий лейн — блокуючий job
`Mobile UI audit (44px touch targets)` у [`ci.yml`](../../../.github/workflows/ci.yml)
(`apps/web/tests/mobile/*.spec.ts` під `pointer: coarse`).

## Пріоритет документів

1. [`design-system.md`](./design-system.md) — канонічний контракт для нового UI-коду.
   Якщо патерн / спеціалізована дока конфліктує з дизайн-системою — перемагає
   дизайн-система.
2. Спеціалізовані патерни (`cross-module-prompts.md`, `empty-states.md`,
   `module-accent.md`, `radius-rhythm.md`, `undo-pattern.md`,
   `unified-bottom-nav.md`) — уточнюють конкретні UX-рішення.
3. v2-rollout кластер (`redesign-v2/`) — переходи на v2 поверх дизайн-системи.
4. Архів (`archive/`, `specs/archive/`) — закриті аудити та superseded specs.
   Жоден з цих файлів не є живим контрактом — лише історичний контекст
   для governance-посилань.

## Identity / brand

| Документ                         | Опис                                                    |
| -------------------------------- | ------------------------------------------------------- |
| [`brandbook.md`](./brandbook.md) | Бренд-голос, ім'я, hero-градієнти, marketing-references |

## Canonical contract

| Документ                                 | Опис                                                                |
| ---------------------------------------- | ------------------------------------------------------------------- |
| [`design-system.md`](./design-system.md) | Дизайн-система: токени, типографія, компоненти, варіанти, API, lint |

## Спеціалізовані патерни

| Документ                                                   | Опис                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`anti-slop-strategy.md`](./anti-slop-strategy.md)         | Диференціація від «генерованого» вигляду: аудит, 5 принципів, slop-тест   |
| [`cross-module-prompts.md`](./cross-module-prompts.md)     | Cross-module nudges із anti-nag-механікою                                 |
| [`density-hierarchy-spec.md`](./density-hierarchy-spec.md) | Правила 1–2 типографіки по геро-блоках модулів + межа застосовності П2    |
| [`empty-states.md`](./empty-states.md)                     | Правила empty / error / zero-data станів (3 tier-и)                       |
| [`module-accent.md`](./module-accent.md)                   | Module-accent CSS variables, ESLint containment, Tailwind utilities       |
| [`radius-rhythm.md`](./radius-rhythm.md)                   | Size-driven border-radius scale (Swatch / Marker / Control / Card / Hero) |
| [`undo-pattern.md`](./undo-pattern.md)                     | Soft-delete + 5-секундний undo-toast для destructive-дій                  |
| [`unified-bottom-nav.md`](./unified-bottom-nav.md)         | Єдиний bottom-nav патерн для hub / modules                                |

## Tooling / process

| Документ                         | Опис                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------- |
| [`storybook.md`](./storybook.md) | Storybook 10 setup, conventions, story-coverage контракт (review-only, ADR-0081) |
| [`specs/`](./specs)              | Design specs для нетривіальних product-side фіч (раніше `agents/specs/`)         |

## Archive

Закриті аудити та реалізовані пропозиції — повний індекс і підсумки кожного у [`archive/README.md`](./archive/README.md). Файли тут лишені як **історичний контекст** для governance-посилань (HR #9, HR #13, ADR-0007), не як живий контракт.

| Документ                                                                                   | Статус      |
| ------------------------------------------------------------------------------------------ | ----------- |
| [`archive/dark-mode-audit.md`](./archive/dark-mode-audit.md)                               | Closed      |
| [`archive/brand-palette-wcag-aa-proposal.md`](./archive/brand-palette-wcag-aa-proposal.md) | Implemented |
