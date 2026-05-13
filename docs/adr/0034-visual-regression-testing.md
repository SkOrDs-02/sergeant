# ADR-0034: Visual regression testing via Argos + Playwright

- **Status:** accepted
- **Date:** 2026-05-03
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/web/playwright.visual.config.ts`](../../apps/web/playwright.visual.config.ts) — visual config (Argos reporter when `ARGOS_TOKEN` set, HTML report otherwise).
  - [`apps/web/tests/a11y/ds-visual-qa.spec.ts`](../../apps/web/tests/a11y/ds-visual-qa.spec.ts) — design-system spec (4 viewports × 2 themes × 7 hub surfaces = 56 screenshots).
  - [`.github/workflows/visual-regression.yml`](../../.github/workflows/visual-regression.yml) — CI job.
  - [ADR-0020](./0020-testing-pyramid.md) — testing pyramid (visual regression сидить як 6-й шар поверх a11y/smoke).
  - [`docs/audits/archive/2026-04-28-sergeant-comprehensive-audit.md`](../audits/archive/2026-04-28-sergeant-comprehensive-audit.md) §P3-1 — audit row, що тригернув формалізацію.

---

## 0. TL;DR

Ми використовуємо **Argos CI + Playwright** для visual regression: один спеціалізований spec (`ds-visual-qa.spec.ts`) знімає 56 screenshots всіх hub-surfaces у 4 viewports і 2 темах; Argos обчислює diff і постить власний commit-status check. Job **non-blocking** — не gate-имо PR через CI `needs:`, бо false-positives від нестабільних анімацій / шрифтів задушать review velocity. Reviewer бачить diff в Argos UI і вирішує.

---

## 1. Context and Problem Statement

Audit `2026-04-28-sergeant-comprehensive-audit.md` (P3-1) позначив відсутність visual regression як ризик «UI drift». Симптоми, які мали бути спіймані візуально:

1. **Tailwind palette migration** ([#1230 серії](https://github.com/Skords-01/Sergeant/pulls?q=raw+palette+to+semantic)) — `bg-gray-100` → `bg-surface-muted`. ESLint правило `no-raw-dark-palette` ловить нові регресії, але **не ловить** layout/spacing drift під час самої міграції.
2. **Module-accent CSS variables** — зміна `--accent-finyk` від HEX до `oklch(...)` у [#995](https://github.com/Skords-01/Sergeant/pull/995). Тести Vitest пройшли (CSS-vars не виконуються в JSDOM); реальна regression побачилась тільки коли деплой пішов на прод.
3. **`SectionHeading` API expansion** ([#1414](https://github.com/Skords-01/Sergeant/pull/1414)) — раніше 25 disable-ів `no-eyebrow-drift` з рандомними утилітами; після уніфікації потрібен був візуальний регресійний контроль, що typography weights/sizes співпадають із попередньою візуалкою.

Без visual regression кожен такий PR мав ризик «merged green CI, broken-looking UI».

---

## 2. Considered Options

1. **Argos CI + Playwright** (вибрано) — generic visual diff service, інтегрується з Playwright reporter; free tier для open-source / personal-use OK для нашого обсягу.
2. **Chromatic + Storybook** — більш потужно (interaction tests, addon ecosystem), але вимагає підтримки Storybook, якого у нас нема, і platform-fee навіть на маленьких командах.
3. **Percy (BrowserStack)** — comparable до Argos, дорожче ($75/мо мінімум), без free tier для приватних репо.
4. **Loki + Storybook** — open-source self-hosted, але вимагає Storybook, та ще й self-hosted infrastructure для diff storage.
5. **Playwright `toHaveScreenshot()` + git LFS** — повністю in-repo, без зовнішніх сервісів. Але repo-bloat (PNG diffs у history), складна процедура approval («оновити baseline» = okремий PR з пачкою бінарників), і немає UI для side-by-side порівняння.
6. **Do nothing** — лишити audit P3-1 відкритим. Не прийнятно: ринок UI-міграцій (palette, typography, motion) тільки зростатиме.

---

## 3. Decision

**Argos + Playwright, non-blocking CI job.**

Concretely:

- `apps/web/playwright.visual.config.ts` — окремий config, ізольований від `playwright.config.ts` (a11y) і `playwright.smoke.config.ts` (smoke E2E). `webServer` запускає `npm run preview --port 4173` після `npm run build`.
- Spec `apps/web/tests/a11y/ds-visual-qa.spec.ts` — 56 screenshots: 4 viewports (mobile-S, mobile-L, tablet, desktop) × 2 themes (light, dark) × 7 hub surfaces (HubLanding, HubSearch, HubReports, HubBackup, FinykDashboard, FizrukDashboard, NutritionDashboard).
- CI job `.github/workflows/visual-regression.yml`:
  - Runs on `push: main` і `pull_request:`.
  - Постгрес `pgvector/pgvector:pg16` (потрібен для preview-build, бо `db:migrate:dev` тягне 025-міграцію з `vector` extension) — SHA-pinned.
  - `concurrency: visual-${{ github.ref }}` cancel-in-progress, щоб PR-flood не палив Argos quota.
  - Без `ARGOS_TOKEN` — screenshot-и зберігаються як CI artifact (для repos без Argos integration).
  - Без блокуючого `needs:` у downstream-jobs — гейт-чек постить Argos через `argos/sergeant` commit status, не через required CI check.
- Approval flow: автор PR відкриває Argos UI з посилання в commit-checks → side-by-side diff → "Approve" або "Reject"; merge не блокується failed-status, але reviewer-и знають що подивитися.

---

## 4. Rationale

**Чому non-blocking:**

False-positive economy. Visual diff чутливий до:

- Шрифтових subpixel-render differences між Linux CI runner-ами і local M-серії Mac.
- Анімації / motion при першому frame (навіть з `animationDuration: 0`).
- Async font loading (FOUT vs FOIT відмінності між preview-build і dev).

Якщо gate-ити merge через ці false-positive — review velocity упаде до нуля. Argos має «approve» mechanism — це достатньо для людського-loop без CI-блоку.

**Чому Argos над Chromatic:**

Sergeant не має Storybook (свідоме рішення: компоненти живуть у `apps/web/src/shared/components/ui/`, не в окремому пакеті, бо переважна більшість — domain-coupled, не reusable). Без Storybook Chromatic втрачає головну фічу (story-isolation), залишається лише diff-engine — який в Argos дешевший.

**Чому Playwright, не Cypress:**

Уже в стеку (a11y + smoke). Не вводимо другий browser-driver.

**Чому 56 screenshots, не 200+:**

- 4 viewports — покривають bento-grid breakpoints, які реально drift-ять.
- 2 themes — light/dark, бо ми мігрували dark-mode у `no-raw-dark-palette` rule.
- 7 hub surfaces — найважливіші user-facing screens. Не покриваємо deep-linked pages (наприклад, окремий transaction edit modal), бо там UI зміни рідкі і unit/component-tests із RTL ловлять регресії.

Дешевше тримати малий core stable, ніж великий flaky.

---

## 5. Consequences

### Positive

- UI drift під час palette/typography/motion міграцій ловиться до merge.
- Argos як external service знімає infra-cost (немає self-hosted diff storage).
- Job non-blocking → не загальмовує hot-fix-и через візуальні quirks.

### Negative

- Залежність від external service (Argos). Mitigation: spec running locally (`pnpm test:visual`) + screenshots-as-artifacts fallback при відсутньому `ARGOS_TOKEN`.
- 15-хвилинний CI job (build + preview-server + 56 screenshots). Mitigation: `concurrency.cancel-in-progress` + non-blocking гарантує що цей time не сидить у critical path merge-у.
- Free tier Argos: 5000 screenshots/місяць. При 56 screenshots × ~30 PR/місяць = ~1700/місяць, є запас. Якщо переростемо — або апгрейд, або скоротимо matrix.

### Neutral

- Не змінюється unit/integration testing flow (ADR-0020).
- Не вимагає Storybook (свідомий вибір Argos саме тому).

---

## 6. Compliance

- **CI:** workflow `visual-regression.yml` має runs-on `push: main` + `pull_request:`. PR без screenshot-job-у — або очікуваний (форкнули від попередніх commits), або підозрюваний (хтось вимкнув workflow). Перевірка вручну при review.
- **Spec:** `apps/web/tests/a11y/ds-visual-qa.spec.ts` — єдиний дозволений source of truth для visual baselines. Інші Playwright spec-и (a11y, smoke) **не** мають викликати `toHaveScreenshot()` — інакше Argos рахує дубль і пишемо false-positive метрики. Перевірка вручну при PR review (немає ESLint правила).
- **Argos token:** `ARGOS_TOKEN` повинен бути в repo secrets. Якщо хтось видалить — workflow продовжить працювати (HTML report fallback), але без diff-engine. Аудит-прогін щоквартально.

## 7. Links

- Audit row: [`docs/audits/archive/2026-04-28-sergeant-comprehensive-audit.md`](../audits/archive/2026-04-28-sergeant-comprehensive-audit.md) §P3-1.
- Argos docs: <https://argos-ci.com/docs>.
- Playwright visual comparisons: <https://playwright.dev/docs/test-snapshots>.
