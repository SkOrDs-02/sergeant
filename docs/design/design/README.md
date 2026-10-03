# Дизайн

> **Last touched:** 2026-09-16 by @claude (індекс звірено з кодом і з усіма 45 файлами папки: редизайн-v2 — історія, showcase — `/design` на 18 розділів, шедулер теми знято, mobile на паузі за ADR-0094). **Next review:** 2027-03-28.
> **Status:** Active

Брендбук, дизайн-система, спеціалізовані патерни й історія закритого
редизайну v2. Історію закритих аудитів зберігає Git.

## Як знайти потрібне

- **Портативний конфіг візуальної системи для AI-агентів** → [`DESIGN.md`](../../../DESIGN.md)
  (найсвіжіше дзеркало токенів; палітра генерується з `tokens.js`, гейт
  `pnpm design:check-md`).
- **Канонічний контракт для нового UI-коду** → [`design-system.md`](./design-system.md)
  і його пʼять тематичних частин у [`design-system/`](./design-system/).
- **Бренд (голос, імʼя, палітра)** → [`brandbook.md`](./brandbook.md).
- **Чому екран не має виглядати як згенерований** → [`anti-slop-strategy.md`](./anti-slop-strategy.md).
- **Спеціалізовані UX-патерни** → таблиця нижче.
- **Закритий v2-редизайн (травень 2026)** → [`redesign-v2/`](./redesign-v2/README.md) — увесь кластер `Reference`.
- **Product-side design specs** → [`specs/`](./specs/README.md).
- **Дизайн-контракти поверхонь поза модулями** — вісім as-built контрактів,
  кожен із `[борг]`-маркерами там, де код розходиться з каноном:
  [pricing/paywall](./specs/2026-09-16-pricing-paywall-design.md),
  [onboarding](./specs/2026-09-16-onboarding-design.md) (рішення власника
  2026-09-16), а з 2026-09-17 — [auth](./specs/2026-09-17-auth-design.md),
  [profile](./specs/2026-09-17-profile-design.md),
  [HubChat](./specs/2026-09-17-hubchat-design.md),
  [settings](./specs/2026-09-17-settings-design.md),
  [landing](./specs/2026-09-17-landing-design.md) і
  [legal](./specs/2026-09-17-legal-design.md). Попередня редакція цього
  абзацу казала, що безконтрактні поверхні «тримає нейтральний stone-бренд
  і компоненти хаба» — landing-контракт це спростував: у `apps/landing`
  власний `@theme`, модульні кольори як блоки й жодного shared `Button`.
- **Закриті аудити та реалізовані пропозиції (для governance-trace)** → [immutable Git snapshot](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/05-design/design/archive/README.md).

## Стан дизайн-шару на 2026-09-16

- **Редизайн v2 закрито 2026-05-21.** Що з нього лишилось каноном —
  Manrope, ink-типографіка, `InsightCard`, три теми; що ні — glass-поверхні
  (токени стали back-compat-аліасами з непрозорою заливкою), mesh-свічення
  (зняті 2026-09-03: фон — «стіл» у hue модуля без радіальних плям), простір
  радіусів `rounded-r-*` (видалений в аудиті 2026-07). Деталі — шапка
  [`redesign-v2/README.md`](./redesign-v2/README.md).
- **Один API кнопки, один модуль дат, одна непрозорість фокус-кільця,
  токени розмірів іконок** — хвиля C-секції 2026-09-15/16
  ([`c-section-consistency-migration.md`](../../work/specs/c-section-consistency-migration.md),
  PR #38 / #41), закріплена храповиком `pnpm lint:ui-canon`. Легасі
  `variant="primary"` / `module=` у коді нуль — не повертай їх із доків.
- **Mobile-контур на паузі** ([ADR-0094](../../governance/adr/0094-mobile-web-first-freeze.md),
  web-first). Доки цієї папки, що адресуються до `apps/mobile`
  (`empty-states.md`, `radius-rhythm.md`, § mobile у `brandbook.md`),
  описують чинний код, але продуктового розвитку там не планують без
  рішення власника; анти-слоп-борг мобілки (F7: емодзі-як-іконка, 129 рядків)
  лишається відкритим у [аудиті 2026-09-01](../../work/specs/audits/2026-09-01-anti-slop-audit.md).
- **Відкриті системні знахідки з огляду 2026-09-13** (§ «8. Система»
  [реєстру](../../work/specs/audits/2026-09-13-product-full-review.md)):
  рукописні фокус-кільця під стелею `handRolledFocusRing` (не борг на
  міграцію), три механізми табів (PR-C5, частково), зашитий гліф «+»
  (PR-C9), desktop-кнопки менші за 44px поза `pointer: coarse` (PR-X4),
  88px мертвого простору знизу на 12 сторінках (PR-Z5). Ця папка їх не
  трекає — реєстр знахідок і `tech-debt/frontend.md` є джерелом; тут лише
  контракт, до якого їх приводять.

## Живий styleguide

Сторінка **`/design`** (`DESIGN_PATH` в `core/app/appPaths.ts`; внутрішня,
лише в dev/preview-збірках — поза `import.meta.env.DEV` маршрут віддає 404)
— [`apps/web/src/core/DesignShowcase`](../../../apps/web/src/core/DesignShowcase):

- сайдбар на **18 розділів** (`_shared/nav.ts`): Colors, Typography,
  Spacing, Elevation, Motion, Forms, Feedback, Overlays, Theming, A11y,
  A11y / States (beta), Module Accents, Menus, Tooltip & Popover,
  EmptyState і три `proposals-*` (experimental);
- тогли theme (light/dark/hc), density (comfortable/compact), напрямок
  (LTR/RTL) та reduced-motion override у шапці (`_shared/Toggles.tsx`);
- у кожному розділі — live demo + копі-паст snippet + Do / Don't таблиця.

Друге живе дзеркало — Storybook 10 ([`storybook.md`](./storybook.md), 73
stories). Додаєш примітив у `@shared/components/ui` — онови розділ
showcase, story і відповідну частину `design-system/`.

> Розділ `#theming` showcase 2026-09-16 звірено з хуком: показує `useTheme`
> з трьома явними режимами (`light` / `dark` / `hc`); колишній `useDarkMode`
> і «Schedule modes» (авто-режим і шедулер зняті на прохання власника
> 2026-08-18, `useTheme.ts` § AI-CONTEXT) із showcase прибрано.

## Maturity matrix (primitives)

Колонка «Конвенції» — дизайн-конвенції, що тримаються tokens + review
(колишні ESLint-правила retired [ADR-0081](../../governance/adr/0081-repository-simplification.md)),
плюс механічні гейти з § «Enforcement status»:

| Розділ         | Maturity         | Showcase якір  | Конвенції / гейти                                                                                     |
| -------------- | ---------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| Кольори        | **stable**       | `#colors`      | no raw hex (гейт), opacity scale, `-strong` companion, `no-opacity-on-text-token`                     |
| Типографіка    | **stable**       | `#typography`  | 8 ролей `.text-style-*`, 12px floor (гейт), no arbitrary text size                                    |
| Spacing        | **stable**       | `#spacing`     | radius rhythm (`rounded-lg` / `rounded-md` заборонені в новому коді)                                  |
| Elevation      | **stable**       | `#elevation`   | e0–e5 парою з z-tier; ніколи `z-[9999]`                                                               |
| Motion         | **stable**       | `#motion`      | animation budget, `no-raw-motion-value`                                                               |
| Форми          | **stable**       | `#forms`       | `focus-visible:` not `focus:` (гейт), `ring-focus/45` (храповик), Button `(variant, tone)` (храповик) |
| Фідбек         | **stable**       | `#feedback`    | empty-state tiers, `require-toast-error-action`                                                       |
| Overlays       | **stable**       | `#overlays`    | `focus-visible:`, стек діалогів через `useDialogFocusTrap`                                            |
| Theming        | **stable**       | `#theming`     | `useTheme` 3 режими; no raw dark pairs, no raw hex                                                    |
| A11y           | **stable**       | `#a11y`        | `focus-visible:`, `-strong` contrast, 44px touch targets (гейт під coarse)                            |
| A11y / States  | **beta**         | `#a11y-states` | semantic a11y tokens (`--c-ring`, selection, caret, dividers)                                         |
| Module accents | **stable**       | `#accents`     | module-accent containment; стіл/зона (`moduleSurfaces`)                                               |
| Menus          | **stable**       | `#menus`       | `DropdownMenu` / `CommandPalette` keyboard contract                                                   |
| Proposals ×3   | **experimental** | `#proposals-*` | пропозиції UI / UX / visual — не контракт                                                             |

`#colors` показує пʼять родин, не чотири: семантичні поверхні/текст,
brand & status, `-strong` тир і окрему пʼяту - **`categoryColors`**
(кольори категорій витрат Фініка, 18 ключів, свідомо розведені по hue з
модульними акцентами). Деталі й таблиця - [`design-system/01-tokens-colors.md`
§ 2.4](./design-system/01-tokens-colors.md#24-статуси) і
[`DESIGN.md`](../../../DESIGN.md) (AUTOGEN-блок `palette`).

## Enforcement status

Після ADR-0081 частина конвенцій знову має **механічний гейт**:

- [`scripts/check-design-conventions.mjs`](../../../scripts/check-design-conventions.mjs)
  (`pnpm lint:design-conventions`, у ланцюжку `pnpm lint` і CI `check`): no raw
  hex у className, `focus-visible:` замість `focus:`, 12px floor (`text-2xs` і
  `text-[<12px]` лише з allowlist у самому скрипті) і невідоме імʼя кольору з
  нашої родини токенів. Скоуп — `apps/web/src`, `apps/landing/src`,
  `apps/mobile-shell/src`.
  Останнє правило стоїть окремо від решти: воно не про смак, а про клас, який
  Tailwind не згенерує. Джерело істини — сам пресет (`colors`, `textColor`,
  `boxShadow`, `backgroundImage`) плюс ручні утиліти з
  `apps/web/src/styles/*.css`, тож нове імʼя стає валідним автоматично.
  Перевіряються ТІЛЬКИ наші родини, тому `text-sm`, `bg-cover` і стандартні
  палітри правило не зачіпає. Введення (2026-09-20) одразу знайшло сім місць
  із `bg-panel-hi` при токені `panelHi`: CSS-змінна зветься `--c-panel-hi`, а
  Tailwind-ключ `panelHi`, і плутанина між ними лишала елемент без фону мовчки.
  `apps/landing/src` у allowlist — у нього власний `@theme`, не цей пресет.
- [`scripts/check-ui-canon-ratchet.mjs`](../../../scripts/check-ui-canon-ratchet.mjs)
  (`pnpm lint:ui-canon`, бюджет `.tech-debt/ui-canon-budget.json`): легасі-кнопки
  0, неканонічна непрозорість `ring-focus` 0, числові розміри `<Icon>` 0,
  рукописні фокус-кільця — стеля 226 (лише проти наростання). Рецепт для
  наступних хвиль — [`unify-ui-to-canon.md`](../../start/instructions/unify-ui-to-canon.md).
- ESLint (`eslint-plugin-sergeant-design`, лише runtime/a11y-інваріанти):
  `no-opacity-on-text-token`, `no-raw-motion-value`, `no-raw-type-size`,
  `no-sentence-in-caption`, `require-toast-error-action` (у
  `eslint.cross-surface.js`, web + mobile), `no-cyrillic-jsx-literal` (warn).
- Контрастні тести токенів: `packages/design-tokens/contrast.test.js`
  (`--c-subtle` ≥ 4.5:1 на кожному «столі»), `categoryColors.contract.test.js`,
  `theme.focusRingHc.test.ts`.
- 44×44 touch-target floor — блокуючий job
  `Mobile UI audit (44px touch targets)` у [`ci.yml`](../../../.github/workflows/ci.yml)
  (`apps/web/tests/mobile/*.spec.ts` під `pointer: coarse`). **Під fine
  pointer floor не міряється** — саме тому знахідка PR-X4 (desktop-кнопки
  ~30×14) жива.

**Review-only** лишаються AST-рівневі конвенції: opacity scale, `-strong`
companions, module-accent containment — свідомо не покриті grep-скриптом.

`apps/mobile/src` під гейт 12px **не** заведений: NativeWind-поверхня має
156 порушень і нуль `.text-style-*`, а розвиток контуру на паузі
([ADR-0094](../../governance/adr/0094-mobile-web-first-freeze.md)); борг —
[`tech-debt/mobile.md`](../../work/specs/tech-debt/mobile.md).

## Пріоритет документів

1. [`design-system.md`](./design-system.md) + [`design-system/`](./design-system/)
   — канонічний контракт для нового UI-коду. Якщо патерн / спеціалізована
   дока конфліктує з дизайн-системою — перемагає дизайн-система; якщо
   дока конфліктує з `packages/design-tokens` — перемагають токени.
2. Спеціалізовані патерни (`anti-slop-strategy.md`, `cross-module-prompts.md`,
   `density-hierarchy-spec.md`, `empty-states.md`, `module-accent.md`,
   `radius-rhythm.md`, `undo-pattern.md`, `unified-bottom-nav.md`) —
   уточнюють конкретні UX-рішення.
3. Крос-cutting UI-політики поведінки — [`../ui/`](../ui/README.md)
   (шорткати, тости) і [`../i18n/`](../i18n/README.md).
4. `redesign-v2/`, `mockups-backlog.md`, `design-consistency-audit-2026-07.md`,
   Git history — історичний контекст для governance-посилань, не живий
   контракт.

## Identity / brand

| Документ                         | Опис                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| [`brandbook.md`](./brandbook.md) | Бренд-голос, імʼя, палітра (stone-хаб + 4 модулі), hero-градієнти, marketing-references |

## Canonical contract

| Документ                                                                                           | Опис                                                                 |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`design-system.md`](./design-system.md)                                                           | Індекс контракту + якорі                                             |
| [`design-system/01-tokens-colors.md`](./design-system/01-tokens-colors.md)                         | Принципи, кольорові токени, стіл/зона, WCAG AA                       |
| [`design-system/02-typography.md`](./design-system/02-typography.md)                               | 8 ролей `.text-style-*`                                              |
| [`design-system/03-spacing-elevation-theming.md`](./design-system/03-spacing-elevation-theming.md) | Spacing, радіуси, elevation × z-tier, три теми                       |
| [`design-system/04-components.md`](./design-system/04-components.md)                               | Примітиви (Button `(variant, tone)`, Card, EmptyState …), focus/a11y |
| [`design-system/05-motion-offline-error.md`](./design-system/05-motion-offline-error.md)           | Motion tokens, хореографія, offline / empty / error                  |

## Спеціалізовані патерни

| Документ                                                   | Опис                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`anti-slop-strategy.md`](./anti-slop-strategy.md)         | Диференціація від «генерованого» вигляду: аудит, 5 принципів, slop-тест   |
| [`cross-module-prompts.md`](./cross-module-prompts.md)     | Cross-module nudges із anti-nag-механікою                                 |
| [`density-hierarchy-spec.md`](./density-hierarchy-spec.md) | Правила 1–2 типографіки по геро-блоках модулів + межа застосовності П2    |
| [`empty-states.md`](./empty-states.md)                     | Правила empty / error / zero-data станів (3 tier-и)                       |
| [`module-accent.md`](./module-accent.md)                   | Module-accent CSS variables, containment-конвенція, Tailwind utilities    |
| [`radius-rhythm.md`](./radius-rhythm.md)                   | Size-driven border-radius scale (Swatch / Marker / Control / Card / Hero) |
| [`undo-pattern.md`](./undo-pattern.md)                     | Soft-delete + 5-секундний undo-toast для destructive-дій                  |
| [`unified-bottom-nav.md`](./unified-bottom-nav.md)         | Єдиний bottom-nav патерн для hub / modules                                |

## Tooling / process

| Документ                         | Опис                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| [`storybook.md`](./storybook.md) | Storybook 10 setup, conventions, story-coverage контракт (review-only, ADR-0081)     |
| [`specs/`](./specs/README.md)    | Design specs для нетривіальних product-side фіч (статуси звірено з кодом 2026-09-16) |

## Історія (Reference)

| Документ                                                                                                                                                     | Що це                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`redesign-v2/`](./redesign-v2/README.md)                                                                                                                    | Кластер закритого редизайну (governance, migration, plan, status, backlog, retrospective, phase-7) |
| [`mockups-backlog.md`](./mockups-backlog.md)                                                                                                                 | Знімок HTML-бібліотеки мокапів на 2026-08-16; дерева `mockups/` у цьому репозиторії немає          |
| [`design-consistency-audit-2026-07.md`](./design-consistency-audit-2026-07.md)                                                                               | Аудит консистентності 2026-07, усі знахідки закриті (Resolved)                                     |
| [immutable snapshot `archive/`](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/05-design/design/archive/README.md) | dark-mode audit (Closed), brand-palette WCAG-AA proposal (Implemented)                             |
