# Agents in apps/web

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-27.
> **Status:** Active

> **Single source of truth → root [`AGENTS.md`](../../AGENTS.md).** Цей файл — sub-tree quick reference для агентів, що працюють лише в `apps/web/`. Не дублюй repo policy: hard rules, ownership map, performance budgets і CI matrix живуть у корені.

## Specialist skill

[`.agents/skills/sergeant-web-ui/SKILL.md`](../../.agents/skills/sergeant-web-ui/SKILL.md) — apps/web, PWA, Tailwind, a11y, opacity scale, `-strong` fills, storage wrappers, query keys.

## Stack snapshot

React 18 + Vite 8 + Tailwind 4 + TanStack Query + Better Auth (cookie sessions) + Service Worker (`src/sw.ts`). Deploy: Vercel preview per PR + production on merge to `main`. Tests: Vitest + MSW + React Testing Library; a11y/E2E: Playwright + axe.

## Quick commands

```bash
pnpm dev:web                                   # http://localhost:5173 (proxies /api → :3000)
pnpm --filter @sergeant/db-schema build        # required before Vitest — @sergeant/db-schema/sqlite must be emitted
pnpm --filter @sergeant/web build              # production build
pnpm --filter @sergeant/web build:capacitor    # build for Capacitor shell
pnpm --filter @sergeant/web test               # Vitest
pnpm --filter @sergeant/web test:a11y          # Playwright + axe
pnpm --filter @sergeant/web test:coverage      # Vitest with coverage
pnpm --filter @sergeant/web typecheck
pnpm --filter @sergeant/web size               # size-limit (CI gate)
pnpm --filter @sergeant/web lighthouse          # Lighthouse CI (perf-budget gate)
```

## Surface-specific gotchas

- **RQ keys (Hard Rule #2):** only via `apps/web/src/shared/lib/api/queryKeys.ts` factories (`finykKeys`, `nutritionKeys`, `hubKeys`, `coachKeys`, `chatKeys`, `digestKeys`, `pushKeys`, `syncKeys`, `strategicKeys`, `billingKeys`, `aiMemoryKeys`). No inline `queryKey: [...]`.
- **Tailwind colour-opacity (дизайн-конвенція — tokens + review, ex-Hard Rules #8/#9, retired [ADR-0081](../../docs/04-governance/adr/0081-repository-simplification.md)):** opacity steps must be on the registered scale; saturated brand fills behind `text-white` need the `-strong` companion. Конвенція чинна, але без ESLint-enforcement — тримається design tokens + design-review.
- **No arbitrary hex / focus-visible (дизайн-конвенція — tokens + review, ex-Rules #11/#14, retired ADR-0081):** no arbitrary hex in `className`; use `focus-visible:` not `focus:`.
- **Module accents (дизайн-конвенція — tokens + review, ex-Rule #12, retired ADR-0081):** module-accent containment — no foreign accents inside a module subtree.
- **Кольори категорій Фініка ≠ бренд-палітра.** 16 категорій витрат мають власну родину `categoryColors` (`@sergeant/design-tokens`), свідомо розведену з модульними акцентами — не фарбуй категорію бренд-тиром. Hue гейтить `packages/design-tokens/categoryColors.contract.test.js`, правки — через `categoryColors.gen.js`. У JSX — `catChipVars()` + класи `.cat-chip` / `.cat-dot`; інлайн-hex не потрібен.
- **Module size (Hard Rule #18):** `max-lines: 600` for web TS/TSX. Permanent lint-enforced convention — split before crossing.
- **Storage:** wrapper from `@shared/storage`; allowlist enforced by `pnpm lint:localstorage-allowlist`.
- **Touch targets:** `Button` auto-applies `min-h-[44px] min-w-[44px]` **лише під `@media (pointer: coarse)`** for `xs`/`sm`/`iconOnly` (на fine-pointer/desktop-миші floor навмисно не діє — `Button.tsx` `pointer-coarse:` варіант); opt out with `data-compact` only for intentionally small cells (heatmaps).
- **Vitest prerequisite:** run `pnpm --filter @sergeant/db-schema build` before `pnpm --filter @sergeant/web test`. Without it, Vitest cannot resolve `@sergeant/db-schema/sqlite` and hundreds of suites fail at import time with `(0 test)`.
- **`position: fixed` оверлеї × софт-клавіатура iOS.** `useBodyScrollLock` пінить `body` у `position: fixed`, тож документу нікуди скролитись — і WebKit, підіймаючи сфокусоване поле над клавіатурою, **панує visual viewport** (`visualViewport.offsetTop > 0`) замість скролу. `fixed` прив'язаний до layout viewport, тож оверлей цілком їде вгору: `Sheet` зависає ВИЩЕ клавіатури, а шапка ховається під статус-бар (звіт тестера 2026-08-16). Лікується не інсетом (`useVisualKeyboardInset` навмисно ігнорує `offsetTop` — § H1 джитер), а компенсуючим `transform` повз React-стан — [`useKeyboardAwareOverlay`](./src/shared/hooks/useKeyboardAwareOverlay.ts). Той самий хук синхронно підтягує щойно сфокусоване поле, коли клавіатура вже відкрита (H2-фолбек інсету ловить лише перехід «не було → з'явилась»). **Компенсація і keyboard-геометрія ходять парою.** До компенсації видимим поле під клавіатурою робив саме пан iOS — погасивши пан без власної геометрії, поле ховаєш назавжди. `Sheet` геометрію має свою (`marginBottom` + `maxHeight` на панелі); решта fixed-оверлеїв бере її з [`keyboardOverlayStyles`](./src/shared/lib/ui/keyboardOverlay.ts) (`paddingBottom` на `inset-0` контейнері + `maxHeight` на панелі). Підключені: `Sheet`, `Modal` (центрована гілка), `InputDialog`, `DeleteAccountDialog`, `CommandPaletteUI`. Що таке «клавіатура на екрані» — один предикат на всіх, [`softKeyboard.ts`](./src/shared/lib/platform/softKeyboard.ts); не дублюй поріг 56 px по місцях. Пишеш новий fullscreen-оверлей із полями вводу — став його на `Sheet` або підключай обидві половини.

  **`scrollIntoView` не гарантує видимості — гарантує лише спробу.** Він уміє рівно стільки, скільки дозволяє `scrollHeight` контейнера: під полем у КІНЦІ списку контенту майже нема, скрол упирається в межу, і центрування, яке рятує середину, для останніх рядків недосяжне — поле лишається під клавіатурою (бета-фідбек №5, 2026-08-18: «верхні та посередині норм, внизу не видно»). Тому Sheet резервує у скрол-контейнері запас на висоту клавіатури, поки вона відкрита (без запасу нікуди доскролювати), а `useKeyboardAwareOverlay.revealField` після скролу звіряє ФАКТ по `visualViewport` (`rect.bottom` проти `offsetTop + height`) і дотягує рівно на дефіцит. Правиш цю логіку — тримай обидві половини: сама перевірка без запасу нічого не виправить, сам запас без перевірки не спрацює там, де геометрія панелі розійшлась із реальністю.

- **Оверлей поверх `Sheet` мусить бути зареєстрованим діалогом, інакше він мертвий.** `Sheet`/`Modal` вмикають `inertBackground` і портуються в `<body>`, а background-inert manager у [`useDialogFocusTrap`](./src/shared/hooks/useDialogFocusTrap.ts) ставить `inert` + `aria-hidden` на все, що не веде до відкритого діалогу — тобто на весь `#root`. Оверлей, який рендериться на місці (без порталу) і покладається лише на `z-index`, потрапляє в це піддерево РАЗОМ із ним: він малюється зверху, але не отримує жодної події, а тапи «провалюються» на елементи аркуша під ним. Так `BarcodeScanner` не закривався і клікав кнопки позаду (звіт власника 2026-08-23; діагноз — `document.elementsFromPoint` на прев'ю-білді, бо DevTools-стек і z-index виглядали правильними). Лікування — не підняття `z-index` і не `pointer-events`, а `useDialogFocusTrap(open, panelRef, { inertBackground: true })`: менеджер сам знімає `inert` з гілки до нового діалогу й переносить його на аркуш (випадок «ConfirmDialog поверх Sheet», описаний у самому хуку). **Діагностична порада:** якщо елемент видно, але він не клікається, перевіряй `inert` на предках, а не z-index — computed `z-index` у такому разі показує саме те, що ти й задумав. Клавіші при цьому належать **верхньому** діалогу стосу: слухачі висять на спільному `document`, тож без цього Escape закривав усі відкриті діалоги разом, а Tab у верхньому смикав фокус у нижній (нижня пастка бачила фокус «поза своєю панеллю» — нормальний стан, коли зверху інший діалог). Порядок стосу — це порядок ВІДКРИТТЯ, не вкладеність DOM: оверлей у `#root` і аркуш у порталі `<body>` не є предками одне одного, тож визначити верхній по дереву неможливо.

- **`AuthContext` × `@sergeant/shared` — білий екран на бутi.** Новий runtime-import `@sergeant/shared` у [`src/core/auth/AuthContext.tsx`](./src/core/auth/AuthContext.tsx) перекроює eager-чанки так, що analytics стартує з ще не ініціалізованими константами: `Cannot read properties of undefined (reading 'SIGNUP_COMPLETED')`, застосунок не рендериться взагалі. Ламає однаково і статичний import, і `await import(...)`; `import type` безпечний. Тому `SYNC_ORIGIN_DEVICE_ID_KEY` там продубльовано літералом під pin-тестом `AuthContext.originDeviceKey.test.ts`. **Typecheck і юніти цього не бачать** — перевіряй буту в браузері на prod-білді (`VERCEL=1 build` + статика з COOP/COEP). Знайдено browser-QA 2026-08-06.

## Bundle budget

CI gate via `size-limit`. Canonical numbers: root [`AGENTS.md § Performance budgets`](../../AGENTS.md#performance-budgets) and `apps/web/package.json` → `"size-limit"` (`../server/dist/assets/*` after Vite output is copied for unified-mode serving).

**Lazy-by-default policy:** dynamic-import (через `lazyImport` / `lazyDefault`) для всіх great-effort surface-ів — onboarding splash (`WelcomeScreen` + `OnboardingWizard` + `seedDemoData/*`), кожен route-shell-модуль (`finyk`, `fizruk`, `routine`, `nutrition`), settings-page-и, marketing (`PricingPage`), barcode scanner (`vendor-zxing`). Тонкі еagerly-доступні гейти (як `shouldShowOnboarding()` у `App.tsx`/`HubHomeView.tsx`) імпортуємо з legkih helper-файлів (`onboarding/onboardingGate.ts`), а не з важких component-модулів — інакше Rollup тягне весь стек у entry chunk.

**Як читати `pnpm --filter @sergeant/web size`:** виводить дві лінії — `JS (усього)` (брутто-сума всіх `assets/*.js`, включно з lazy chunk-ами) і `CSS`. Real-world initial paint вимірюється `eager-only` під-сумою (chunks з `<link rel="modulepreload">` у `apps/server/dist/index.html`) — після T4 (PR `perf(web): T4`) це було ~365 kB, на 2026-08-02 — 430 kB, і з того дня воно **гейтиться окремо** (`pnpm --filter @sergeant/web size:eager`); ліміт двічі ратчетнуто вниз 2026-08-07 — 470 → 430 → **280 kB** — після того, як із критичного шляху виїхали спершу `posthog-js`, а потім `vendor-sqlite`: факт упав 472.3 → 411.7 → **264.6 kB** (обґрунтування — root [`AGENTS.md § Performance budgets`](../../AGENTS.md#performance-budgets)). Lighthouse LCP/FCP gate-и (див. секцію нижче) перевіряють user-felt impact, `size-limit` ловить total-regression.

**Якщо потрібно підняти ліміт:** у тому ж PR, що додає dep / feature; explicit обґрунтування у PR-description. Bypass: label `audit-exception` (як для всіх optional CI checks).

## Lighthouse CI (perf-budget gate)

T5 gate from [`docs/90-work/planning/sprint-roadmap-q2q3-2026.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/sprint-roadmap-q2q3-2026.md) § 1.1 Тех-борг — shipped: workflow [`.github/workflows/lighthouse-ci.yml`](../../.github/workflows/lighthouse-ci.yml) (status check `Lighthouse CI`) рунається на `pull_request` до `main` та `workflow_dispatch`. Локальний прогон: `pnpm --filter @sergeant/web lighthouse` (`lhci autorun`). Config: [`apps/web/lighthouserc.json`](./lighthouserc.json).

**Routes audited (3 runs each, median):** `/`, `/finyk`, `/fizruk`, `/nutrition/menu`. `/nutrition` redirects to `/nutrition/menu`, so LHCI audits the canonical path directly. `/routine` is temporarily excluded from LHCI after repeated CI-only `NO_FCP` runtime failures; keep Playwright smoke coverage for the route until the Lighthouse/Chrome trace failure is fixed. `/` is the Hub root — there is no separate `/hub` path (see [`apps/web/src/core/app/router.tsx`](./src/core/app/router.tsx)).

**Budgets (median run):**

| Метрика                          | Поріг   | Рівень (first pass) |
| -------------------------------- | ------- | ------------------- |
| `largest-contentful-paint` (LCP) | 3000 ms | `error` (fail-stop) |
| `first-contentful-paint` (FCP)   | 1500 ms | `warn`              |
| `total-blocking-time` (TBT)      | 200 ms  | `warn`              |

**Як читати reports:**

1. Відкрий job `Lighthouse CI (perf budgets)` у CI таб PR-а.
2. В кінці кроку `Run Lighthouse CI` LHCI друкує `Open the report at <url>` — клік → HTML-репорт на `storage.googleapis.com/lighthouse-infrastructure...`. Один URL на route.
3. Альтернативно: завантаж workflow-artifact `lighthouse-reports` (retention 14 днів) — містить `.lighthouseci/lhr-*.html` + `manifest.json` з тривалостями кожного run-у.
4. Зелений job без warn-ів означає, що **median LCP / FCP / TBT всіх 4 LHCI routes** під порогами.
5. `⚠ warning` біля метрики — поріг перевищено, але job не падає (FCP/TBT — `warn`).
6. `NO_FCP` / server-start runtime flake після retry — job soft-pass-ить із GitHub warning; дивись `lhci-attempt.log` у job output.
7. `✗ error` — fail-stop (LCP > 3000 ms); PR не мерджиться без зеленої метрики або temp-override.

**Temp-overrides (regression patch / urgent merge):**

Жорсткого override-механізму немає (на відміну від `size-limit` `audit-exception` label-а). Якщо потрібен hotfix-bypass:

1. **Preferred:** виправ regression перед merge — переглянь LHCI report → шукай `unused-javascript`, `largest-contentful-paint-element`, `render-blocking-resources`.
2. **Якщо incident-bypass необхідний:** додай у PR-description `[skip-lighthouse-ci]` + причину; в follow-up PR (≤24h) — fix regression АБО bump поріг у [`apps/web/lighthouserc.json`](./lighthouserc.json) з justification у commit message (e.g. «major dep upgrade adds 50 KB → tier-2 chunk → LCP +200 ms; budget bump узгоджено з owner»).
3. LCP уже `error`-gated (3000 ms); FCP/TBT — `warn`-only. Перевід `lighthouse` job у `required` через GitHub branch-protection rules — manual flip у settings.

**Локальний прогон:**

```bash
pnpm --filter @sergeant/web build   # без VERCEL=1: build кладеться у ../server/dist
VERCEL=1 pnpm --filter @sergeant/web build   # for `vite preview` to find dist
pnpm --filter @sergeant/web lighthouse       # boots vite preview + runs LHCI
```

Reports drop у `apps/web/.lighthouseci/` (gitignored).

## E2E smoke (Playwright)

Critical-flow E2E lane runs per-PR via `.github/workflows/ci.yml` job `critical-flow` (line ~539): `playwright test -c playwright.smoke.config.ts --grep @critical`. Boot sequence — `docker compose up -d postgres` → `pnpm db:migrate:dev` → `@sergeant/server dev` (:3000) → `@sergeant/web build` → `vite preview` (:4173). Driver: `apps/web/tests/smoke/start-smoke-webserver.mjs`. Tests under `apps/web/tests/smoke/`.

```bash
pnpm --filter @sergeant/web e2e                  # → playwright --grep @critical
pnpm --filter @sergeant/web e2e:auth             # → playwright --grep @auth (login lane)
pnpm --filter @sergeant/web exec playwright \    # focus one spec locally
  test -c playwright.smoke.config.ts             # (needs Postgres + server already running
  tests/smoke/onboarding-happy-path.spec.ts      #  — easiest: `pnpm dev:server &` then this)
```

**Як додати новий critical-flow тест:**

1. Файл у `apps/web/tests/smoke/<name>.spec.ts`. Імпортуй `{ test, expect }` з `@playwright/test`. Title має починатися з `@critical` (e.g. `test("@critical onboarding: …", …)`); це регекс-фільтр для `--grep @critical`.
2. Reuse smoke-stack — НЕ запускай свій web-server. `playwright.smoke.config.ts` піднімає stack для всіх тестів у `tests/smoke/`; `start-smoke-webserver.mjs` орхестрова сервер у foreground-режимі.
3. Не sub-автентифікуй юзера через `fetch("/api/auth/sign-up")` у тесті — реальний sign-up через UI ловить regression-и у `RegisterForm` + `AuthContext`. Якщо потрібен seeded стан — використовуй `page.addInitScript` для `localStorage` (як у `onboarding-happy-path.spec.ts` для `sergeant.whatsNew.lastSeenId.v1`).
4. Analytics-події читай з `window.__hubAnalytics` ring-buffer (`apps/web/src/core/observability/analytics.ts`) — PostHog network transport gated на `VITE_POSTHOG_KEY` (unset у smoke), buffer — deterministic.
5. Trace / screenshot on failure уже сконфігуровано (`trace: "retain-on-failure"`, `screenshot: "only-on-failure"`). HTML report публікується як artifact `playwright-critical-flow-report` (14d retention).
6. **Smoke-environment gotcha (пом'якшено 2026-08-04):** історично `vite preview` НЕ emit-ив COOP/COEP response-headers → `SharedArrayBuffer` недоступний → `sqlite-wasm` падав на memory-only VFS, і SQLite-backed стан осцилював проти оптимістичного (root cause постійних detach-фейлів routine/nutrition ніг `deep-module-crud`). Тепер `vite.config.js` → `preview.headers` шле ті самі COOP/COEP, що й прод (`vercel.json`), тож smoke-середовище працює на OPFS VFS як продакшн. Порада лишається чинною як defensive-практика: analytics ring-buffer — deterministic signal-of-truth, а UI-assertions навколо SQLite-backed gate документуй inline (див. § 4a у `onboarding-happy-path.spec.ts`).

7. **`page.reload()` в E2E — це гонка з сервіс-воркером, доки її явно не зняти.** `precacheAndRoute` кладе весь прекеш (400 записів, 6.6 МБ) у `event.waitUntil` події `install`, тож воркер стає `activated` лише після його завершення — на цьому репо приблизно через 4 с після завантаження сторінки. Тест, який доходить до рестарту раніше або рівно на тій межі, щоразу потрапляє в один із ТРЬОХ станів: воркер ще `installing` (навігація йде повз нього), уже `activated` (йде через `NavigationRoute`), або перехід стається ПОСЕРЕД навігації — і тоді вона абортиться (`net::ERR_ABORTED; maybe frame was detached?`) чи зависає. Заміри 2026-09-02 на одному й тому самому тесті: без барʼєра стан перед рестартом стрибав між `{installing:true, active:null}` і `{active:"activated"}` без жодної зміни коду — різниця лише в швидкості машини, тому локально це виглядає стабільним, а в CI ні. Саме на цьому `pantry-storage-places` правили тричі поспіль, щоразу підкручуванням таймінгу. Перед `page.reload()` став [`waitForServiceWorkerActivated`](./tests/utils/serviceWorker.ts) — він прибирає третій варіант, а не «чекає трохи». Ціна барʼєра ~2 с, тож тесту з рестартом потрібен власний `test.setTimeout`.

## Deeper docs

- App README: [`apps/web/README.md`](./README.md)
- Routing catalog: [`docs/00-start/agents/agent-skills-catalog.md`](../../docs/00-start/agents/agent-skills-catalog.md)
- Module ownership: [`docs/02-engineering/architecture/module-ownership.md`](../../docs/02-engineering/architecture/module-ownership.md)
- Domain invariants (Kyiv time, kopiykas as `number`): [`docs/02-engineering/architecture/domain-invariants.md`](../../docs/02-engineering/architecture/domain-invariants.md)
