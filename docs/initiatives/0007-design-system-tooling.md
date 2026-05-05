# 0007 — Design-system tooling: Storybook + visual regression

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Done (round-10 closed Phases 2–5 — shared/ui coverage 100% non-allowlisted, module-level stories для Finyk / Fizruk / Nutrition / Routine / Insights, Storybook GitHub Pages deploy live, [ADR-0046](../adr/0046-storybook-vrt-scope.md) фіксує VRT scope, ESLint rule promoteнуто до `error`)
> **Priority:** P1 (Sprint 2)
> **Owner:** `@Skords-01`
> **ETA:** 2 weeks

> **Progress (round-7, 2026-05-04):** Каталог Storybook у `apps/web/.storybook/` (а не у новому пакеті — рішення фази 1) тепер містить **12 компонентів** (60 % від цілі ≥ 20): `Button`, `Badge`, `Card` (foundation [#1647](https://github.com/Skords-01/Sergeant/pull/1647)) → +`Banner`, `Skeleton`, `Tooltip`, `DataState`, `Modal` (8 компонентів, [#1678](https://github.com/Skords-01/Sergeant/pull/1678)) → +`Input` / `Spinner` / `Switch` / `Tabs` (12 компонентів, [#1695](https://github.com/Skords-01/Sergeant/pull/1695)).
>
> **Progress (round-8, 2026-05-04):** Каталог розширено до **21 компонента** shared/ui (мітка ≥ 20 перевершена). Між round-7 і round-8 у `main` уже додані `Avatar`, `Select`, `Stat`, `Segmented` (commit `5963a01c`) + `EmptyState`, `IconButton`, `ProgressRing`, `SkeletonCard` (отдельні commit-и); цей PR закриває останнє зі списку round-7 — `Toast`. Через те, що `<ToastContainer>` тригерить toasts через `useToast()` context, додано **глобальний decorator у `apps/web/.storybook/preview.tsx`** з `<ToastProvider>` + `<ToastContainer />`; інші stories ігнорують контекст без перформансу. ESLint правило `sergeant-design/require-stories-for-ui-components` (warn-only) merged у [#1812](https://github.com/Skords-01/Sergeant/pull/1812).
>
> **Progress (round-9, 2026-05-05):** Phase 3 (module-level stories) стартував з модуля **Finyk** — [#1836](https://github.com/Skords-01/Sergeant/pull/1836) додає `apps/web/src/modules/finyk/components/DebtCard.stories.tsx` (8 stories: Default / PaidOff / Receivable / Overdue / DueToday / HiddenBalance / WithLinkAction / WithDeleteAction — покривають payable/receivable polarity, due-date варіанти, privacy-mode, CTA wiring) + `BackfillProgressPill.stories.tsx` (5 stories для всіх чотирьох `progress.status`: idle / running / completed / failed + transient-варіант для transactions screen). Stories — render-only (без domain mocks, без app-runtime imports), `chromatic.viewports` сконфігуровано для VRT breakpoint матриці (375 / 768 / 1280). Залишок Phase 3: Fizruk / Nutrition / Routine / Insights (по 1 PR на модуль). Phase 4–5 (Chromatic vs Playwright VRT decision + deploy live) — поки `Out`.
>
> **Progress (round-10, 2026-05-05) — Done.** Одним PR-ом закриті всі відкриті фази:
>
> - **Phase 2** — shared/ui coverage піднято з 35% до **100% non-allowlisted** (37 stories на 37 компонентів-кандидатів). Додані 16 нових stories: `Icon`, `FormField`, `SectionHeading`, `ConfirmDialog`, `AnimatedNumber`, `FloatingActionButton`, `CollapsibleSection`, `Popover`, `Sheet`, `InputDialog`, `ModuleBottomNav`, `AccentColorPicker`, `AnimatedCheckbox`, `StreakFlame`, `StreakCelebration`, `AnimatedList`. Allowlist розширено до 23 файлів (5 дефолтних барелів + 11 utility/wrapper + 7 transient/gesture; per-file rationale comments в `packages/eslint-plugin-sergeant-design/index.js`).
> - **Phase 3** — module-level stories для всіх п'яти модулів: `apps/web/src/modules/fizruk/components/workouts/SupersetBadge.stories.tsx` + `WorkoutStatTile.stories.tsx`, `apps/web/src/modules/nutrition/components/meal-sheet/MacroChip.stories.tsx`, `apps/web/src/modules/routine/components/DayProgressRing.stories.tsx`, `apps/web/src/core/insights/AssistantAdviceCard.stories.tsx`. Finyk вже був закритий в round-9.
> - **Phase 4** — [ADR-0046](../adr/0046-storybook-vrt-scope.md) фіксує VRT scope: Storybook залишається playground-ом, ADR-0034 (Argos + Playwright на hub surfaces) — єдиним authoritative VRT джерелом. Storybook stories MUST NOT дзвонити `argosScreenshot()`. Обгрунтування: budget Argos free tier (5000/міс) + false-positive economy story-isolated diffs.
> - **Phase 5** — [`.github/workflows/storybook-deploy.yml`](../../.github/workflows/storybook-deploy.yml) деплоїть Storybook на GitHub Pages (`https://skords-01.github.io/Sergeant/`) при push-і в `main`; PR builds рунають той же build-step + uploadять бандл як artifact (7-денний retention). Написано [`docs/design/storybook.md`](../design/storybook.md) — contributor guide (writing stories, animations / overlays escape hatches, allowlist hygiene).
> - **ESLint promote** — `sergeant-design/require-stories-for-ui-components` піднято з `warn` до `error` в [`eslint.config.js`](../../eslint.config.js) з оновленим коментарем-rationale.
>
> **Sources:** Design Review 2026-05-03 §13 (Design system), [`docs/audits/UX-UI-AUDIT-2026.md`](../audits/UX-UI-AUDIT-2026.md)

## TL;DR

Sergeant має **топовий design-system на статичному рівні**: tokens (`packages/design-tokens/`), Tailwind preset, кастомний `eslint-plugin-sergeant-design` з 11 правил (`no-foreign-module-accent`, `no-low-contrast-text-on-fill`, `valid-tailwind-opacity`, etc). Що **відсутнє** — playground / docs / visual regression. UI-компоненти описані тільки в коді, неможливо швидко глянути «всі стани кнопки» / «accent palette finyk vs fizruk», немає catch-у на візуальні регресії при рефакторінгу. Ця ініціатива ставить **Storybook 8 у `apps/storybook/`** + **Chromatic / Playwright VRT** на CI.

## Чому зараз

- Декомпозиція великих компонентів (ініціатива 0001) ризикує візуальними регресіями. Без visual regression це робиться «око у код-ревью» → пропуски.
- Onboarding нових ютористів і дизайн-партнерів (FTUX-зараз у фазі rollout): нема каталогу UI. Кожен раз доводиться шукати компонент по `apps/web/src/shared/components/ui/`.
- 11 ESLint rules на design — це детектор отколу, але **візуальних артефактів вони не ловлять**: розриви spacing, контраст в темному фоні, mis-aligned icons.
- Існують `apps/web/src/__tests__/visual/*` (Playwright screenshot snapshots), але вони на app-page level, не на component level. Декомпозиція ламає їх — а ми не знаємо, чи це регресія, чи expected.
- design-tokens змінюються (3 ADR за 2026 цикл), але **немає dashboard-у**, який показує impact: «кнопка в темі finyk виглядає так до/після».

## Скоуп

**In:**

1. `apps/storybook/` — окремий пакет із Storybook 8 (Vite-based).
2. Stories для:
   - `shared/components/ui/*` (Button, Input, Card, Sheet, Drawer, Icon, Toast, Modal, Tabs, Tooltip)
   - Module-level (acent palettes): FinykCard, FizrukCard, NutritionCard, RoutineCard, InsightsCard
   - Layout primitives (`shared/components/layout/*`)
3. **Visual regression**: Playwright + `expect(page).toHaveScreenshot()` per story (запускається в CI на PR).
4. Chromatic як альтернатива (decision: Chromatic vs self-hosted Playwright VRT — обирається у фазі 1).
5. Інтеграція з `eslint-plugin-sergeant-design`: stories валідуються тими ж rules.
6. Storybook deploy на CI: GitHub Pages / Vercel preview.
7. Documentation page «Як писати stories» в [`docs/design-system/`](../design-system/).

**Out:**

- Mobile (RN) Storybook — окрема ініціатива (можна додати після того, як RN-app догоне feature-parity per ініціатива 0002).
- Token mutations / theme switcher як inline editor — окрема ініціатива (Storybook addon, P3).
- Migration `tailwindcss-animate` → motion variants — non-goal цього епіку.
- Дизайн-аудит (фігма ↔ код consistency) — окремий вид роботи.

## План змін

### Фаза 1 — Storybook setup + decision Chromatic vs Playwright (1 PR)

**PR `feat-storybook-setup`:**

- `pnpm dlx storybook@latest init --type react-vite` у новому пакеті `apps/storybook/`.
- Конфіг `apps/storybook/.storybook/main.ts` з:
  ```ts
  framework: '@storybook/react-vite',
  stories: ['../../web/src/**/*.stories.tsx'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-a11y', '@storybook/addon-themes'],
  ```
- Theme-switcher addon — для `data-accent="finyk|fizruk|nutrition|routine|insights"`.
- Перші 3 story файли як smoke-test:
  - `Button.stories.tsx`
  - `Card.stories.tsx`
  - `Icon.stories.tsx`
- Decision у [`docs/adr/0042+-visual-regression-tool.md`](../adr/) — Chromatic vs Playwright VRT (review-based; default = Playwright VRT через економію).

### Фаза 2 — story coverage для shared/components/ui (1 PR)

**PR `feat-storybook-shared-ui`:**

- Story файли для всіх компонентів у `apps/web/src/shared/components/ui/*`:
  - states: default, hover, focused, disabled, loading, error
  - per-accent (finyk / fizruk / nutrition / routine / insights)
  - per-size (xs/sm/md/lg)
- Кожна story має `parameters.chromatic.viewports` (mobile/tablet/desktop).
- ESLint правило `require-stories-for-ui-components` (preview, warn-only) — попереджає, якщо у `shared/components/ui/*.tsx` нема `.stories.tsx`.

### Фаза 3 — module-level stories (1 PR per major module)

**PR `feat-storybook-finyk` / `-fizruk` / `-nutrition` / `-routine` / `-insights`:**

- Per-module: stories для топ-3-5 компонентів (`*Card`, `*Header`, `*Form`).
- Tokens / accent перевіряються на хед-компоненті (`FinykCard` має `data-accent="finyk"` → візуально відрізняється від `FizrukCard`).
- Чотири окремі PR-и (≤200 LOC each).

### Фаза 4 — visual regression CI integration (1 PR)

**PR `ci-storybook-visual-regression`:**

- `.github/workflows/storybook-vrt.yml`:
  - Build storybook → `dist/storybook`.
  - Запустити Playwright з `expect(page).toHaveScreenshot()` per story.
  - Snapshots зберігаються у `apps/storybook/__snapshots__/` (gitignored .png; baseline у remote storage).
  - PR-comment із diff-summary якщо є visual regressions.
- Альтернатива (якщо обрали Chromatic): GitHub action `chromaui/action@v11`.
- `apps/storybook/playwright.config.ts` з `webServer: { command: 'pnpm storybook:preview' }`.
- Time-budget: VRT job ≤ 5 хв (treeshake stories per affected module).

### Фаза 5 — Storybook deploy + docs (1 PR)

**PR `feat-storybook-deploy`:**

- GitHub Pages workflow або Vercel preview deployment per PR.
- URL: `storybook.sergeant.app/` (або `https://Skords-01.github.io/Sergeant/`).
- README у `apps/storybook/` + sectsion в [`docs/design-system/storybook.md`](../design-system/) — як писати stories, як інтерпретувати VRT диф.

## Критерії DONE

- [x] `apps/web/.storybook/` build-ить локально (`pnpm --filter @sergeant/web storybook`) — round-7.
- [x] ≥ 80% компонентів у `shared/components/ui/*.tsx` мають `.stories.tsx` — round-10 допхав 100% non-allowlisted (37 stories / 37 компонентів).
- [x] ≥ 5 module-level stories (Finyk / Fizruk / Nutrition / Routine / Insights) — round-9 закрив Finyk; round-10 додав решту.
- [x] Visual regression CI проходить на PR — вирішено в [ADR-0046](../adr/0046-storybook-vrt-scope.md): єдиним VRT джерелом є hub-surface baseline (ADR-0034); Storybook stories навмисно не wirені в Argos.
- [x] Storybook deploy live ([`.github/workflows/storybook-deploy.yml`](../../.github/workflows/storybook-deploy.yml) → `https://skords-01.github.io/Sergeant/`).
- [x] ESLint правило `require-stories-for-ui-components` — `error` level (`eslint.config.js`).
- [x] ADR роз'яснює VRT-tool decision — [ADR-0046](../adr/0046-storybook-vrt-scope.md) cross-linkує ADR-0034.
- [x] Bundle/build гарантують, що Storybook не імпортує app-runtime overhead у production bundle — `apps/web/.storybook/main.ts` скидає vite-plugin-pwa, deploy job пінить `NODE_ENV=production`.
- [·] PR-comment з visual diff працює — N/A згідно ADR-0046 (Storybook не є VRT джерелом). Аналогічний механізм живе в Argos UI для hub-surface baseline.

## Ризики та митиґація

| Ризик                                                           | Мітигація                                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Visual regression flakes на font-rendering / timezone / OS      | Фіксована Playwright Docker image у CI (Linux-only baseline). `expect.toHaveScreenshot({ maxDiffPixels: 50 })`.            |
| Storybook повільний у dev (165 модулів)                         | Lazy-load stories (Storybook 8 default). Розбити на окремий entry per modul, якщо load > 5s.                               |
| Chromatic вартість $$ на 50 user-snapshots                      | Default — Playwright VRT (free, self-hosted). Chromatic — opt-in пізніше якщо потрібен share-link для дизайну.             |
| Розбіжність stories ↔ продакшен (story лише імпортує компонент) | Stories ≡ продакшен імпорти; theme-switcher з real `data-accent`; кожна story включає top-level `<AppShell />` за потреби. |
| Велика кількість snapshot-файлів у git                          | Snapshot-файли у LFS / S3 (decision у ADR-0042). Default — git-tracked для перших 100, потім міграція.                     |

## Метрики

| Метрика                                  | Baseline (2026-05-03) | Target (post-rollout) |
| ---------------------------------------- | --------------------- | --------------------- |
| % UI-components з stories                | 0%                    | ≥ 80%                 |
| Visual regression CI gate                | none                  | passes on every PR    |
| MTT-detect for visual regression         | days (post-merge)     | minutes (CI)          |
| Storybook published URL                  | none                  | live                  |
| Кількість «accent drift» bugs за квартал | ?                     | -50%                  |

## Власник, ревʼюери

- **Lead:** `@Skords-01`.
- **Required review:** будь-який PR із змінами у `apps/storybook/**` або `packages/design-tokens/**` потребує review від CODEOWNERS.

## Посилання

- Design Review 2026-05-03 — §13 Design system
- [`docs/audits/UX-UI-AUDIT-2026.md`](../audits/UX-UI-AUDIT-2026.md)
- [`packages/design-tokens/`](../../packages/design-tokens/)
- [`packages/eslint-plugin-sergeant-design/`](../../packages/eslint-plugin-sergeant-design/)
- [Storybook 8 docs](https://storybook.js.org/docs)
- [Playwright VRT](https://playwright.dev/docs/test-snapshots)
- [Chromatic](https://www.chromatic.com/)

## Outcome

**Closed: 2026-05-05 (round-10).** Initiative від 35% до 100% non-allowlisted shared/ui coverage за 5 round-ів (round-7 заклав 12 компонентів фундаменту; round-8 — 21 компонент + ESLint warn-canary; round-9 — Phase 3 Finyk льод; round-10 — решта Phase 2/3/4/5 + ESLint promote до `error`).

### Shipped artefacts

- **37 shared/ui stories** в `apps/web/src/shared/components/ui/` — 100% non-allowlisted coverage. Round-10 додав 16 нових: `Icon`, `FormField`, `SectionHeading`, `ConfirmDialog`, `AnimatedNumber`, `FloatingActionButton`, `CollapsibleSection`, `Popover`, `Sheet`, `InputDialog`, `ModuleBottomNav`, `AccentColorPicker`, `AnimatedCheckbox`, `StreakFlame`, `StreakCelebration`, `AnimatedList`.
- **5 module-level stories** — Finyk (`DebtCard`, `BackfillProgressPill` — round-9), Fizruk (`SupersetBadge`, `WorkoutStatTile`), Nutrition (`MacroChip`), Routine (`DayProgressRing`), Insights (`AssistantAdviceCard`). Stories — render-only, ` chromatic.viewports: [375, 768, 1280]`.
- **ESLint contract піднято** — `sergeant-design/require-stories-for-ui-components` з `warn` до `error` (`eslint.config.js`). Allowlist розширений до 23 файлів (5 default barrels + 11 utility/wrapper + 7 transient/gesture) з пер-file rationale-коментарем в `packages/eslint-plugin-sergeant-design/index.js`.
- **Storybook deploy** — [`.github/workflows/storybook-deploy.yml`](../../.github/workflows/storybook-deploy.yml). PR build (artifact, 7d retention) + `main` deploy на GitHub Pages (`https://skords-01.github.io/Sergeant/`).
- **VRT decision зафіксовано** — [ADR-0046](../adr/0046-storybook-vrt-scope.md) cross-linkує ADR-0034. Storybook = playground only; Argos hub-surface baseline залишається єдиним authoritative VRT джерелом. Обгрунтування: budget Argos free tier (5000 screenshots/міс) + false-positive economy story-isolated diffs.
- **Contributor guide** — [`docs/design/storybook.md`](../design/storybook.md). Описує де живуть stories, як писати (Meta/StoryОбj, autodocs, viewports), animation escape hatches (`immediate`, `triggerOnView=false`, `show=true`), allowlist hygiene.

### Делта до ETA

- ETA орієнтир — 2 тижні (5 PR-ів, по одному на phase). Факт — 5 раундів (round-7..10), 4 з яких зливалися протягом 48 годин (2026-05-04 → 05-05). round-10 одним PR-ом допхав Phases 2/3/4/5 разом з ADR + docs.
- Не вписалось в скоуп — mobile/RN Storybook (вже explicit `Out` в скоуп-секції). Її прибережено для окремої ініціативи після feature-parity рольової 0002.

### Follow-up для наступних round-ів

- Якщо VRT-coverage виявиться недостатньою (регресія в component-isolation, яку не ловить ні ESLint, ні hub-baseline) — ADR-0046 дозволяє опт-ін окремої component family в Argos через дедикований spec (`tests/a11y/ds-component-<name>.spec.ts`). По одному PR на family, screenshot budget review в PR-description.
- При розширенні design-tokens (фігурних або нових module-accent-ів) — додати token-level Storybook docs page (план на round-11+).
