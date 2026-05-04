# 0007 — Design-system tooling: Storybook + visual regression

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Proposed
> **Priority:** P1 (Sprint 2)
> **Owner:** `@Skords-01`
> **ETA:** 2 weeks
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

- [ ] `apps/storybook/` build-ить локально (`pnpm storybook:dev`).
- [ ] ≥ 80% компонентів у `shared/components/ui/*.tsx` мають `.stories.tsx`.
- [ ] ≥ 5 module-level stories (Finyk / Fizruk / Nutrition / Routine / Insights).
- [ ] Visual regression CI проходить на PR (test on main, fail on PR if diff > 0.1%).
- [ ] Storybook deploy live (URL у README).
- [ ] PR-comment з visual diff працює.
- [ ] ESLint правило `require-stories-for-ui-components` — error level після фази 5.
- [ ] ADR `0042+-visual-regression-tool.md` змерджено.
- [ ] Bundle/build гарантують, що Storybook не імпортує app-runtime overhead у production bundle.

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

_Заповнюється після завершення._
