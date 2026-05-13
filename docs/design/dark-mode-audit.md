# Dark-mode audit

> **Last validated:** 2026-05-13 by @Codex. **Next review:** N/A (closed audit).
> **Status:** Closed (Wave 2c shipped, lint-guardrail на `error`)
> **Аудиторія:** усі, хто чіпає Tailwind-класи в `apps/web`.
> **Ціль:** скаталогізувати всі місця, де dark-mode виражений як явний `dark:` override над сирим palette-кольором, щоб мігрувати їх у single-token-семантичні утиліти (`bg-success-soft`, `bg-finyk-surface`, `border-brand-strong`, …) і дати preset-у володіти light/dark-парою в **одному** місці.

## TL;DR

> **Code-sync 2026-05-02.** Це історичний аудит закритої міграції `apps/web`.
> Поточна норма описана в [`design-system.md`](./design-system.md): новий код
> використовує semantic tokens (`bg-*-soft`, `text-*-strong`,
> `border-*-soft-border`) і не додає raw palette light/dark пари. Таблиці
> нижче залишені як audit trail того, що було мігровано.

- **306** `dark:` overrides у `apps/web/src/**/*.{ts,tsx}` (без тестів).
- **28** з них були анти-патерном, на який націлений цей аудит: фон з _сирої палітри_ у світлій темі, спарений із hand-tuned-_сирим palette_ (або ad-hoc `-soft`/`/15`) dark-варіантом — `bg-teal-100 dark:bg-teal-900/30`, `bg-amber-50 … dark:bg-amber-500/15`, `bg-teal-800/10 dark:bg-white/10` тощо.
- **Wave 1b** мігрувала **21 / 28** з них у preset-owned-родину `{brand,module,status}-soft` (`bg-brand-soft`, `bg-finyk-soft`, `bg-warning-soft`, `border-*-soft-border`, `hover:bg-*-soft-hover`). CSS-variable-и `--c-{brand,module,status}-soft*` у `apps/web/src/index.css` тепер несуть light/dark-swap, тож call-site-и не потребують жодного `dark:` override-а.
- **Wave 2a + 2b** мігрували решту **7 / 28** через два рефактори: 4-рядковий патерн у `WorkoutFinishSheets.tsx` згорнули в примітив `<WorkoutStatTile>`, що працює на новому токені `--c-fizruk-tile{,-border}` (light = teal-800-wash, dark = white-wash), а coral-heatmap-рядки у `chartTheme.ts` переїхали в CSS-класи `bg-routine-heat-l{1,2,3}`, у яких `.dark .X` override володіє per-theme-кольором. **Audit-count = 0.**
- **Wave 2c** додає lint-guardrail: нове ESLint-правило `sergeant-design/no-raw-dark-palette` (Hard-rule #13 у `AGENTS.md`) фаяться на будь-якому className, що парує сирий palette-light-утиліту (`bg-amber-50`, `text-coral-100`, `border-teal-200/50`, …) з `dark:`-сирим palette-override-ом. Поки мігрувалися 28 інвентарних сайтів, правило знайшло ще **40** додаткових паруваних call-site-ів поза оригінальним інвентарем (icon-контейнери, module-strong tinted text, hero-card-бордери); усі 40 мігровано до канонічної форми Wave 1b (`text-{family}-strong dark:text-{family}`, `border-{module}-soft-border/{N}`, `bg-{module}-soft`, …), тож правило підняли до `error` при нулі violation-ів. Guardrail закриває цей анти-патерн у CI на всі майбутні зміни.
- Кожен решта-анти-патерн — це один `dark:` override від тихого fallthrough-у на наступній palette-міграції — саме клас бага, виправленого в [#814](https://github.com/Skords-01/Sergeant/pull/814).

## Анти-патерн, конкретно

```tsx
// ❌ Два значення палітри захардкодж у call-site, по одному на тему.
<div className="bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" />

// ✅ Один семантичний токен; preset володіє light/dark-парою.
<div className="bg-warning-soft text-warning" />
```

Фікс завжди той самий: або токен уже існує (`bg-warning-soft`, `bg-brand-soft`, `bg-finyk-surface`, …) і call-site його використовує, або токена ще нема — і ми розширюємо `packages/design-tokens/tailwind-preset.js`.

## Повний інвентар міграції (28 сайтів, historical)

Групуємо за target-токеном — тобто семантичною утилітою, до якої рядок був
мігрований під час Wave 1b/2a/2b.

### → `bg-{module}-surface` (module-tinted hero / list surface-и)

**Target-токени:** Wave 1b перевела ці call-site-и на module/status/brand
semantic surfaces, щоб light/dark пара жила в preset/CSS-variable шарі, а не
в кожному компоненті. Рядки нижче показують історичний стан до міграції та
цільовий токен, на який вони були переведені.

| File                                                   | Line | Current                                                                                                 | Target                                         |
| ------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `apps/web/src/core/insights/WeeklyDigestCard.tsx`      | 25   | `bg-brand-100 dark:bg-brand-900/30`                                                                     | `bg-finyk-surface`                             |
| `apps/web/src/core/insights/WeeklyDigestCard.tsx`      | 32   | `bg-teal-100 dark:bg-teal-900/30`                                                                       | `bg-fizruk-surface`                            |
| `apps/web/src/core/insights/WeeklyDigestCard.tsx`      | 39   | `bg-lime-100 dark:bg-lime-900/30`                                                                       | `bg-nutrition-surface`                         |
| `apps/web/src/core/insights/WeeklyDigestCard.tsx`      | 46   | `bg-coral-100 dark:bg-coral-900/30`                                                                     | `bg-routine-surface`                           |
| `apps/web/src/modules/routine/lib/routineConstants.ts` | 21   | `border-coral-100/60 dark:border-routine-border-dark/25 bg-coral-50/50 dark:bg-routine-surface-dark/8`  | `border-routine-border bg-routine-surface`     |
| `apps/web/src/modules/routine/lib/routineConstants.ts` | 30   | `border-l-routine bg-coral-50/50 dark:bg-routine-surface-dark/10`                                       | `border-l-routine bg-routine-surface`          |
| `apps/web/src/shared/components/ui/Card.tsx`           | 83   | `border border-brand-100 bg-brand-50/50 backdrop-blur-sm dark:border-brand-500/20 dark:bg-brand-500/10` | `border-finyk-border bg-finyk-surface`         |
| `apps/web/src/shared/components/ui/Card.tsx`           | 85   | `border border-teal-100 bg-teal-50/50 backdrop-blur-sm dark:border-teal-500/20 dark:bg-teal-500/10`     | `border-fizruk-border bg-fizruk-surface`       |
| `apps/web/src/shared/components/ui/Card.tsx`           | 87   | `border border-coral-100 bg-coral-50/50 backdrop-blur-sm dark:border-coral-500/20 dark:bg-coral-500/10` | `border-routine-border bg-routine-surface`     |
| `apps/web/src/shared/components/ui/Card.tsx`           | 89   | `border border-lime-100 bg-lime-50/50 backdrop-blur-sm dark:border-lime-500/20 dark:bg-lime-500/10`     | `border-nutrition-border bg-nutrition-surface` |

### → `bg-brand-soft` (фон brand-акценту)

**Target-токен:** `bg-brand-soft` плюс companion-токени
`border-brand-soft-border`, `hover:bg-brand-soft-hover`, `text-brand-strong`.
Wave 1b додала їх у token layer, щоб `Segmented`, `Tabs`, `Button`, `Badge`
використовували один semantic API замість raw palette пар.

| File                                                 | Line | Current                                                                                                                                        | Target                                                                               |
| ---------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/web/src/core/insights/AssistantAdviceCard.tsx` | 66   | `bg-brand-50 dark:bg-brand-500/15`                                                                                                             | `bg-brand-soft`                                                                      |
| `apps/web/src/shared/components/ui/Badge.tsx`        | 54   | `bg-brand-50 text-brand-700 border-brand-200/60 dark:bg-brand/15 dark:text-brand dark:border-brand/30`                                         | `bg-brand-soft text-brand-strong border-brand-soft-border`                           |
| `apps/web/src/shared/components/ui/Badge.tsx`        | 56   | (same as :54, duplicate success variant)                                                                                                       | `bg-brand-soft text-brand-strong border-brand-soft-border`                           |
| `apps/web/src/shared/components/ui/Segmented.tsx`    | 71   | `border-brand-200 bg-brand-50 text-brand-700 shadow-sm dark:border-brand/40 dark:bg-brand/15 dark:text-brand`                                  | `border-brand-soft-border bg-brand-soft text-brand-strong`                           |
| `apps/web/src/shared/components/ui/Tabs.tsx`         | 98   | `bg-brand-50 text-brand-700 dark:bg-brand/15 dark:text-brand`                                                                                  | `bg-brand-soft text-brand-strong`                                                    |
| `apps/web/src/shared/components/ui/Button.tsx`       | 57   | `bg-brand-50 text-brand-700 border border-brand-200/50 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-500/30 …` | `bg-brand-soft text-brand-strong border-brand-soft-border hover:bg-brand-soft-hover` |

### → `bg-{status}-soft` (status / notice-поверхні)

Наявні токени: `bg-success-soft`, `bg-warning-soft`, `bg-danger-soft`, `bg-info-soft` уже адаптуються per-theme — задокументовано в `docs/design/design-system.md` § 2.4.

| File                                           | Line | Current                                                                                                                        | Target                                                           |
| ---------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `apps/web/src/shared/components/ui/Badge.tsx`  | 58   | `bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30`             | `bg-warning-soft text-warning-strong border-warning-soft-border` |
| `apps/web/src/shared/components/ui/Badge.tsx`  | 61   | `bg-blue-50 text-blue-700 border-blue-200/70 dark:bg-info/15 dark:text-blue-300 dark:border-info/30`                           | `bg-info-soft text-info-strong border-info-soft-border`          |
| `apps/web/src/shared/components/ui/Banner.tsx` | 16   | `border-emerald-200/70 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100` | `bg-success-soft text-success-strong border-success-soft-border` |
| `apps/web/src/shared/components/ui/Banner.tsx` | 18   | `border-amber-200/70 bg-amber-50 text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100`             | `bg-warning-soft text-warning-strong border-warning-soft-border` |
| `apps/web/src/shared/components/ui/Banner.tsx` | 20   | `border-red-200/70 bg-red-50 text-red-800 dark:border-danger/30 dark:bg-danger/10 dark:text-red-100`                           | `bg-danger-soft text-danger-strong border-danger-soft-border`    |

### → новий примітив `WorkoutStatTile` (WorkoutFinishSheets)

Ці чотири рядки — повторюваний патерн «Fizruk workout-complete stat-tile» — той самий className-soup з `bg-teal-800/10 dark:bg-white/10 …`. Виправляти `dark:`-swap-ом неправильно — їх треба винести в перевикористовуваний примітив `<WorkoutStatTile>` у `apps/web/src/modules/fizruk/components/workouts/`. Примітив отримає один семантичний токен (новий `bg-fizruk-tile` або re-use `bg-fizruk-surface`), а чотири call-site-и схлопнуться у `<WorkoutStatTile … />`.

| File                                                                      | Line | Current                                                                                                      |
| ------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/modules/fizruk/components/workouts/WorkoutFinishSheets.tsx` | 174  | `bg-teal-800/10 dark:bg-white/10 text-teal-700 dark:text-white/70 hover:text-teal-900 dark:hover:text-white` |
| `apps/web/src/modules/fizruk/components/workouts/WorkoutFinishSheets.tsx` | 182  | `bg-teal-800/10 dark:bg-white/10 border border-teal-800/15 dark:border-white/15`                             |
| `apps/web/src/modules/fizruk/components/workouts/WorkoutFinishSheets.tsx` | 193  | (same)                                                                                                       |
| `apps/web/src/modules/fizruk/components/workouts/WorkoutFinishSheets.tsx` | 203  | (same)                                                                                                       |

### → рефактор chart-палітри (chartTheme)

Кольори чарт-серій — спецвипадок: палітра _навмисне_ виражена як серія (light, dark)-пар, щоб Recharts міг рендеритись під обидві теми. Виправлення — не token-swap, а перенесення пар у `chartGradients` (CSS-variable-и per-theme), щоб JS-шар припинив ними володіти.

| File                                       | Line | Current                                |
| ------------------------------------------ | ---- | -------------------------------------- |
| `apps/web/src/shared/charts/chartTheme.ts` | 110  | `bg-coral-200/80 dark:bg-coral-900/55` |
| `apps/web/src/shared/charts/chartTheme.ts` | 111  | `bg-coral-400/75 dark:bg-coral-600/70` |
| `apps/web/src/shared/charts/chartTheme.ts` | 112  | `bg-coral-500/90 dark:bg-coral-500/80` |

## Що далі

1. **Wave 1b — DONE.** Preset тепер вивозить трійку `-soft` / `-soft-border` / `-soft-hover` для `brand` і всіх чотирьох модулів (`finyk`, `fizruk`, `routine`, `nutrition`) — backed CSS-variable-ями `--c-{family}-soft*` у `apps/web/src/index.css`, які автоматично фліпаються між світлою і темною темами. Мігровано 21 / 28 call-site-ів; кожен скидає ≥ 1 `dark:`-override, нетто-зменшення ≈ 40 `dark:`-occurrence-ів.
2. **Wave 2a — DONE.** Чотири рядки у `WorkoutFinishSheets.tsx` тепер резолвляться через примітив `<WorkoutStatTile>` (`apps/web/src/modules/fizruk/components/workouts/WorkoutStatTile.tsx`), backed новими CSS-variable-ями `--c-fizruk-tile{,-border}` (light = teal-800-wash, dark = white-wash). Close-кнопка summary-sheet-у перевикористовує той самий токен (`bg-fizruk-tile/10`), тож її raw-palette-override `dark:bg-white/10` теж пропав.
3. **Wave 2b — DONE.** Три heatmap-рядки в `chartTheme.ts` тепер резолвляться через CSS-класи `bg-routine-heat-l{1,2,3}`, визначені в `apps/web/src/styles/module-surfaces.css`. `.dark .X`-override володіє per-theme-парою RGB+opacity; JS-модуль референс-ить один класнейм на рівень. Audit-count = 0.
4. **Wave 2c — DONE.** Нове ESLint-правило `sergeant-design/no-raw-dark-palette` вивезено на рівні **`error`** (Hard-rule #13 у `AGENTS.md`). Скоуп: pair-only — правило фаяться на className, що парує сиру palette-light-утиліту (`<utility>-<palette>-<step>`, `<utility>` ∈ {`bg`, `text`, `border`}, `<palette>` ∈ 24-name-list вище) **і** `dark:`-сирий-palette-override на тому самому className. Dark-side-only-«патчі» (light уже семантичний, dark патчить відсутній `-strong`-step) лишаються навмисно; те саме — для `dark:bg-white/N`-glass-wash-ів. Правило тестоване у `packages/eslint-plugin-sergeant-design/__tests__/no-raw-dark-palette.test.mjs` (20 кейсів) і виключене на власних файлах плагіна (`packages/eslint-plugin-sergeant-design/**/*.{js,mjs}`), щоб in-source-приклади в документації правил не флагали самі себе. **Скоуп: `apps/web/**/_.{ts,tsx,js,jsx}` тільки.** Семантичні заміни (`bg-{family}-soft`, `border-{module}-soft-border`, `text-{family}-strong`) резолвляться через CSS-variable-и `--c-{family}-soft_`/`--c-{family}-strong*`, визначені в `apps/web/src/index.css`. NativeWind (`apps/mobile`) компілює className-и у React Native inline-стилі й не споживає ці CSS-variable-и — запускати правило там підштовхувало б авторів до токенів, що на мобілці резолвляться у `rgb(undefined)`, тож правило зареєстроване зі скоупом `apps/web/\*\*/*.{ts,tsx,js,jsx}` тільки.

## Легітимні `dark:`-використання, які ЛИШАЮТЬСЯ

Не всі `dark:` — анти-патерн. Ці патерни ОК, і правило `sergeant-design/no-raw-dark-palette` їх НЕ флагає:

- `dark:bg-surface`, `dark:bg-surface-muted`, `dark:text-fg`, `dark:border-border` — це семантичні токени, які несуть `dark:`-префікс через специфічний override (наприклад, стек-модальні поверхні).
- `dark:bg-white/5`, `dark:bg-white/10`, `dark:border-white/15` — патерн «barely-there glass-wash на dark-поверхні», задокументований у `docs/design/design-system.md` § 2.1; семантично «підвищити контраст на dark» — це коректно.
- Variant-override-и на інтерактивних state-ах: `hover:bg-surface-muted dark:hover:bg-surface-muted` — інколи пишуть явно, щоб опт-аутнутись з `hover:`-fallthrough-у.

Поставлене правило (`sergeant-design/no-raw-dark-palette`) націлене на конкретну raw-palette light/dark **пару** (обидві половини на тому самому className): `<utility>-<PALETTE_COLOR>-<SHADE>`, спарене з `dark:<utility>-<PALETTE_COLOR>-<SHADE>`, де `<utility> ∈ { bg, text, border }` і `<PALETTE_COLOR> ∈ {gray, slate, zinc, neutral, stone, red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose, brand, coral}` — **не** семантичні токени (`brand-soft`, `brand-strong`, `routine-soft-border`, …) і **не** bare-color-wash-і (`dark:bg-white/10`, `dark:bg-black/40`).
