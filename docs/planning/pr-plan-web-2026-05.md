# PR-план web 2026-05 — Architecture, state & frontend ergonomics

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

Консолідований PR-план за результатами двох прожарок `apps/web` від 2026-05-13:
архітектура + state-management (прожарка #3/10) і frontend ergonomics
(прожарка #2/10). Документ збирає всі відкриті / partial items в одне місце,
групує їх у 14 атомарних PR-карток і фіксує sequencing між
архітектурними рефакторами і ergonomics-роботою.

Скоуп — лише `apps/web/**` (+ суміжні `packages/eslint-plugin-sergeant-design/**`
для design-rule-ів). Backend, mobile, ops — не в цьому плані.

## Cross-refs

- [`docs/audits/2026-05-13-web-architecture-state-roast.md`](../audits/2026-05-13-web-architecture-state-roast.md) — прожарка #3/10 (architecture + state).
- [`docs/audits/2026-05-13-web-frontend-ergonomics-roast.md`](../audits/2026-05-13-web-frontend-ergonomics-roast.md) — прожарка #2/10 (frontend ergonomics).
- [`docs/architecture/repo-map.md`](../architecture/repo-map.md) — per-app stack matrix, `apps/web` runtime: Vite 8 + React 18 + TanStack Query + Tailwind 4 + size-limit gate.
- [`docs/governance/rules/18-module-size-discipline-600.md`](../governance/rules/18-module-size-discipline-600.md) — Hard Rule #18 (`max-lines: 600` для `apps/web/src/**`); декомпозиція 0013 Sprint 2 (A4 нижче) — це burndown цього правила.
- [`docs/initiatives/0006-frontend-routing-and-code-split.md`](../initiatives/0006-frontend-routing-and-code-split.md) — react-router migration, Phase 3-5 закриваються картами A1–A3.
- [`docs/initiatives/0013-module-decomposition-round-2.md`](../initiatives/0013-module-decomposition-round-2.md) — `max-lines: 600` Sprint 2 (4 файли на decomposition), карта A4.
- [`docs/architecture/state-write-paths.md`](../architecture/state-write-paths.md) — doctrine для UI vs chatActions writer-каналів (закрита у прожарці #3); карти A5/A6 — implementation burndown.
- [`docs/ui/toast-policy.md`](../ui/toast-policy.md) — toast tone-table + anti-pattern matrix (закрита у прожарці #2); карти E1–E2 — Modal a11y контракт у тому ж стилі.
- [`docs/ui/shortcuts.md`](../ui/shortcuts.md) — keyboard registry + browser-conflict matrix (закрита у прожарці #2); карта E7 — wire-up або removal TBD-handler-ів.

## Як читати картку

- **Title** — Conventional Commits header у форматі `<type>(<scope>): <subject>` (готовий до `git commit -m`).
- **Surface** — `file:line` / module path / package, з якими стикається PR.
- **Acceptance** — концентрований чек-ліст; PR не закривається без зеленого по всіх пунктах.
- **Size** — S (≤ 0.5 дня), M (0.5–2 дні), L (2–5 днів). Усе більше за L — розбивати додатково.
- **Priority** — P1 (architecture-level tech-debt) / P2 (DX / cleanup). P0 у цьому плані немає — попередні P0 закриті у прожарках.
- **Depends on** — інші картки з цього плану, що мають змерджитися першими. `—` = можна паралельно з усім.
- **Owner** — placeholder `TBD (frontend-engineer)`. Web — `@Skords-01` як primary, secondary поки `TBD`; коли delegation закінчиться — апдейтити inline.

---

## Architecture / state (cards A1–A7)

Закривають outstanding-items з [`2026-05-13-web-architecture-state-roast.md § P1`](../audits/2026-05-13-web-architecture-state-roast.md) + P2-A/P2-B/P2-D/P2-E.

### A1 — `feat(web): finish initiative 0006 phase 3 — useHashRouter codemod`

- **Surface:** `apps/web/src/modules/{finyk,fizruk,routine,nutrition}/**` (≈ 30 файлів з `useHashRouter` / `window.location.hash`); `packages/eslint-plugin-sergeant-design/index.js` (ESLint rule `no-hash-router-in-modules`).
- **Acceptance:**
  - codemod заміняє виклики `useHashRouter()` / `window.location.hash` на `useNavigate()` / `useLocation()` з react-router у всіх module-subtrees.
  - ESLint rule `sergeant-design/no-hash-router-in-modules` escalated `warn` → `error` у `eslint.config.js`.
  - `apps/web/src/core/app/HashRedirect` лишається тільки для legacy URL-compat shim-у (`/#/...` → `/...`).
  - `pnpm --filter @sergeant/web test` зелений; `pnpm lint` `0 errors`.
  - Initiative 0006 Phase 3 status → `Closed` з посиланням на PR.
- **Size:** L
- **Priority:** P1
- **Depends on:** —
- **Owner:** `TBD (frontend-engineer)`

### A2 — `feat(web): finish initiative 0006 phase 4 — route-loaders + prefetch`

- **Surface:** `apps/web/src/modules/finyk/route.tsx:40-42`, `apps/web/src/modules/fizruk/route.tsx`, `apps/web/src/modules/routine/route.tsx`, `apps/web/src/modules/nutrition/route.tsx`; `apps/web/src/shared/lib/api/queryKeys.ts` (factories вже на місці — Hard Rule #2).
- **Acceptance:**
  - кожен `route.tsx` під 4 модулі експортує `loader: () => prefetch(queryClient, [<rqKeys.list>, …])`.
  - MSW-based тести у `apps/web/src/modules/<mod>/route.test.tsx` перевіряють: (a) loader prefetch-ить ключі, (b) navigation чекає `defer` де треба.
  - `pnpm --filter @sergeant/web test:a11y` без regression-ів — навігація стабільна.
  - Initiative 0006 Phase 4 status → `Closed`.
- **Size:** M
- **Priority:** P1
- **Depends on:** A1 (без hash → loader-и не зависають у hash-redirect-петлі).
- **Owner:** `TBD (frontend-engineer)`

### A3 — `ci(web): per-route bundle-gate (initiative 0006 phase 5)`

- **Surface:** `apps/web/package.json` (`size-limit` section), `.github/workflows/ci.yml` (job `Bundle size guard`), `apps/web/lighthouserc.json` (Lighthouse baselines per route).
- **Acceptance:**
  - `size-limit` entries розбиті по top-level route chunks (`/`, `/finyk`, `/fizruk`, `/routine`, `/nutrition`) замість єдиного `assets/*` сумарного.
  - кожен route має explicit ліміт (виведений з поточного eager-only ~365 kB / lazy chunks).
  - LHCI baselines (LCP / FCP / TBT) для 5 routes зафіксовані як `assertions.error` (tightening з `warn` → `error`) — як заплановано у [`apps/web/AGENTS.md § Lighthouse CI`](../../apps/web/AGENTS.md#lighthouse-ci-perf-budget-gate).
  - Initiative 0006 Phase 5 status → `Closed`; T5 з тех-боргу в [`sprint-roadmap-q2q3-2026.md`](./sprint-roadmap-q2q3-2026.md) → done.
- **Size:** M
- **Priority:** P1
- **Depends on:** A2 (per-route loader-и розділяють chunks → нумерувати тоді є по чому).
- **Owner:** `TBD (frontend-engineer)`

### A4 — `refactor(web): finish initiative 0013 sprint 2 — decompose 4 remaining 600+ LOC files`

- **Surface:**
  - `apps/web/src/modules/nutrition/NutritionApp.tsx` (766 LOC).
  - `apps/web/src/core/hub/hubChatContext.tsx` (681 LOC).
  - `apps/web/src/core/lib/chatActions/fizrukActions.ts` (672 LOC).
  - `apps/web/src/modules/finyk/components/AssetsTable.tsx` (671 LOC).
- **Acceptance:**
  - кожен з 4 файлів — окремий sub-PR (4 sub-PR-и під одним tracking-card-ом, не mega-PR).
  - стратегія декомпозиції — по ролі (state hook / effects hook / presentational subs), не по алфавіту. Cookbook — Hard Rule #18 «Як декомпонувати».
  - після кожного sub-PR файл < 600 LOC; `eslint.config.js` allowlist entry для відповідного файлу видаляється.
  - test-coverage delta ≥ 0 (preserved або покращено) — Vitest + RTL + MSW.
  - Initiative 0013 Sprint 2 status → `Closed`; Hard Rule #18 allowlist скорочується до ≤ 2 файлів.
- **Size:** L (4 × M sub-PR-и)
- **Priority:** P1
- **Depends on:** —
- **Owner:** `TBD (frontend-engineer)`

### A5 — `refactor(web): migrate singleton apiClient → useApiClient() DI`

- **Surface:** `apps/web/src/shared/api/index.ts:19` (singleton export); ~30–40 import-sites під `apps/web/src/{core,features,modules}/**`.
- **Acceptance:**
  - компоненти / hooks використовують `const api = useApiClient()` замість `import { apiClient } from "@shared/api"`.
  - non-React call-sites (e.g. `chatActions/*`) — окремий handler-injection pattern (через DI у HubChatProvider).
  - тести більше не потребують top-level `vi.mock("@shared/api", ...)` — mock через `<ApiClientProvider value={mockApi}>` у RTL render-helper-ах.
  - оновити `docs/architecture/state-write-paths.md` FAQ-section (зняти singleton vs DI split-brain).
- **Size:** L
- **Priority:** P1
- **Depends on:** —
- **Owner:** `TBD (frontend-engineer)`

### A6 — `refactor(web): chatActions handlers — drop direct localStorage writes`

- **Surface:** `apps/web/src/core/lib/chatActions/fizrukActions/*` (deep-rooted local-first state); решта `chatActions/*Actions.ts` handler-ів з прямими `@shared/storage` writes; `docs/architecture/state-write-paths.md § Anti-patterns`.
- **Acceptance:**
  - кожен handler пише через `apiClient` (або, переходно, через явний `apiClient`-mediated SQLite path), не напряму у localStorage.
  - per-handler contract-тест: assert що handler виставляє очікувані RQ-invalidations + повертає `OperationResult` shape.
  - якщо handler legitimно local-only (e.g. UI preference) — задокументувати explicit виняток у `state-write-paths.md`.
  - localStorage allowlist (`pnpm lint:localstorage-allowlist`) лишається 0 у production-коді.
- **Size:** L (розбити на per-handler sub-PR-и якщо handlers ≥ 4)
- **Priority:** P1
- **Depends on:** A5 (зручніше після DI — singleton-патерн заміняти важче, коли він уже зник).
- **Owner:** `TBD (frontend-engineer)`

### A7 — `chore(web): standalone-route factory + KNOWN_PATHS auto-gen + DX polish`

- **Surface:**
  - `apps/web/src/core/app/StandaloneRoutes.tsx` (поточний `STANDALONE_ROUTES: readonly StandaloneRoute[]`).
  - `apps/web/src/core/app/appPaths.ts:43-53` (`KNOWN_PATHS` hand-maintained).
  - `apps/web/src/core/cloudSync/hook/useSyncStatus.ts:41-66` (polling).
  - `apps/web/src/core/App.test.tsx` (provider invariant test).
- **Acceptance:**
  - `defineStandaloneRoute({ path, lazy })` factory з generic discriminated-union; `STANDALONE_ROUTES` будується через factory.
  - `KNOWN_PATHS = new Set(["/", ...STANDALONE_ROUTE_PATHS])` — джерело-правди одне. Cycle uвимкнено через barrel file (`apps/web/src/core/app/routes.ts`).
  - `useSyncStatus` додає `useQuery` з `refetchInterval: 30_000` для активної online-сесії (поверх існуючих `online`/`offline` listener-ів).
  - Provider HMR remount-invariant test (Vite-test-bridge) — приєднати у `App.test.tsx`; assert deepest child лишається mounted після провайдер remount-у.
- **Size:** M
- **Priority:** P2
- **Depends on:** —
- **Owner:** `TBD (frontend-engineer)`

---

## Frontend ergonomics (cards E1–E7)

Закривають outstanding-items з [`2026-05-13-web-frontend-ergonomics-roast.md`](../audits/2026-05-13-web-frontend-ergonomics-roast.md) — F2, F4, F5, F6, F7 + handler wire-up з F3.

### E1 — `feat(eslint): sergeant-design/no-bare-fixed-inset-modal rule`

- **Surface:**
  - `packages/eslint-plugin-sergeant-design/index.js` (+1 rule + 1 test file у `__tests__/`).
  - `apps/web/eslint.bare-fixed-inset-modal-allowlist.json` (новий — inventory ~5 легітимних use-cases типу `<Modal>` / `<Sheet>` / `<ConfirmDialog>`).
  - `eslint.config.js` (wire rule як `warn` для `apps/web/**/*.{ts,tsx}`).
- **Acceptance:**
  - rule детектить `className` з `"fixed inset-0"` без supporting `role="dialog" | "presentation"` attribute на тому ж JSX node-і (або allowlist entry).
  - axe prop-test snippet — порт з `Modal.test.tsx` у shared test-utility-helper `expectDialogA11y(element)`.
  - 14+ нових unit-тестів плагіна; `pnpm --filter eslint-plugin-sergeant-design test` зелений.
  - burndown allowlist стартує з ~17 файлів inventory (включно з легітимними).
- **Size:** M
- **Priority:** P1
- **Depends on:** —
- **Owner:** `TBD (frontend-engineer)`

### E2 — `fix(web): modal a11y — add role/focus-trap/scroll-lock на 4 ad-hoc діалогах`

- **Surface:**
  - `apps/web/src/shared/components/ui/QuickActionsMenu.tsx:143` — `fixed inset-0 z-50` без `role="dialog"` / focus trap.
  - `apps/web/src/shared/components/ui/StreakCelebration.tsx:138` — без `aria-modal`.
  - `apps/web/src/shared/components/layout/ModuleSettingsDrawer.tsx:60` — drawer без focus-trap.
  - `apps/web/src/shared/components/ui/FloatingActionButton.tsx:234` — backdrop без `role="presentation"`.
  - `apps/web/src/shared/components/ui/FeatureSpotlight.tsx:323` — `pointer-events-none` overlay → `role="presentation"` явно.
- **Acceptance:**
  - кожен з 5 callsite-ів отримує `role="dialog"` / `role="presentation"` (де доречно), focus-trap (через існуючий util з `Modal`), scroll-lock.
  - playwright axe lane (`pnpm --filter @sergeant/web test:a11y`) — 0 нових violations.
  - відповідні файли вилучені з `bare-fixed-inset-modal-allowlist.json`.
- **Size:** M
- **Priority:** P1
- **Depends on:** E1 (rule + axe helper повинні існувати до того, як ми чистимо порушення).
- **Owner:** `TBD (frontend-engineer)`

### E3 — `fix(web): defer PWA update-prompt while Hub streaming or mutations in-flight`

- **Surface:**
  - `apps/web/src/shared/hooks/useSWUpdate.ts` (показ prompt-у).
  - `apps/web/src/sw.ts` (SW lifecycle).
  - `apps/web/src/core/hub/streamingStore.ts` (streaming state) + `queryClient.getMutationCache()`.
- **Acceptance:**
  - prompt «Доступне нове оновлення» з'являється тільки коли streaming `idle` AND no in-flight mutations.
  - regression-test `useSWUpdate.test.ts`: мокає `MutationCache` + `streamingStore`, перевіряє defer-логіку (timer-based).
  - manual smoke: під час активного Hub stream — prompt НЕ зриває `streamingResponse`.
  - update-prompt усе ще шипиться у розумний час (наприклад, через ≤ 5 секунд після `idle`).
- **Size:** M
- **Priority:** P1
- **Depends on:** —
- **Owner:** `TBD (frontend-engineer)`

### E4 — `feat(web): mapApiErrorToUserCopy + rollout in core/profile/*`

- **Surface:**
  - `apps/web/src/shared/lib/api/mapApiErrorToUserCopy.ts` (новий — мапа `error.code` → UA-copy).
  - `apps/web/src/core/profile/PersonalInfoSection.tsx:50,72,94,...` (10 callsite-ів).
  - `apps/web/src/core/profile/DangerZoneSection.tsx:36`.
  - `apps/web/src/core/profile/SessionsSection.tsx:75`.
- **Acceptance:**
  - функція покриває min. 8 канонічних `error.code` з `@sergeant/api-client` (`validation_error`, `unauthenticated`, `forbidden`, `rate_limited`, `network_error`, `conflict`, `not_found`, `server_error`) + fallback на ascii-cleaned generic copy.
  - усі callsite-и під `apps/web/src/core/profile/**` використовують `mapApiErrorToUserCopy(res.error)` замість прямого `.message`.
  - unit-тести покривають кожну гілку маппінгу.
  - tone — згідно [`docs/ui/toast-policy.md`](../ui/toast-policy.md).
- **Size:** M
- **Priority:** P2
- **Depends on:** —
- **Owner:** `TBD (frontend-engineer)`

### E5 — `fix(web): pull-to-refresh disabled while cloud pull pending`

- **Surface:**
  - `apps/web/src/shared/components/ui/PullToRefresh.tsx` (`disabled` prop уже існує).
  - `apps/web/src/core/cloudSync/hook/useCloudPullPending.ts` (новий hook).
  - Callsite-и: `apps/web/src/modules/{routine,nutrition,finyk}/**` — wire `disabled={cloudPullPending}`.
- **Acceptance:**
  - повторний swipe-down під час pending pull не тригерить `onRefresh()` другий раз.
  - regression-test `PullToRefresh.test.tsx` — assert `disabled` блокує trigger.
  - manual smoke: 2 поспіль PTR-trigger-и → один network-call, один success-toast, нуль race-error-ів.
- **Size:** S
- **Priority:** P2
- **Depends on:** —
- **Owner:** `TBD (frontend-engineer)`

### E6 — `refactor(web): useApiForm rollout — PersonalInfo + MemoryBank + FinykLogin + Waitlist`

- **Surface:**
  - `apps/web/src/core/profile/PersonalInfoSection.tsx` (4 inputs у manual state).
  - `apps/web/src/core/profile/MemoryBankSection.tsx` (textarea + JSON parsing).
  - `apps/web/src/modules/finyk/components/FinykLoginScreen.tsx` (API key input).
  - `apps/web/src/core/pricing/WaitlistForm.tsx` (email input).
- **Acceptance:**
  - кожна з 4 форм — окремий sub-PR (per-form invariant-и: debounced submit, optimistic UI, validation messages).
  - кожна форма використовує `useApiForm` foundation (zod resolver, RHF, `mode: onTouched`).
  - tests: Vitest + RTL — submit happy-path + validation-error-path.
  - error-копірайт іде через `mapApiErrorToUserCopy` (з E4) де доцільно.
- **Size:** M (4 × S sub-PR-и)
- **Priority:** P2
- **Depends on:** E4 (для error-copy mapping consistency — soft dep; перші форми можна мерджити паралельно з тимчасовим inline-mapping-ом).
- **Owner:** `TBD (frontend-engineer)`

### E7 — `feat(web): wire-up missing keyboard shortcuts (Cmd+/, Cmd+S, G H..N chord)`

- **Surface:**
  - `apps/web/src/core/hooks/useHubKeyboardShortcuts.ts` (поточно registers тільки `?` + `Cmd/Ctrl+K`).
  - `apps/web/src/shared/components/ui/KeyboardShortcutsModal.tsx:101-143` (DEFAULT_SHORTCUTS).
  - `docs/ui/shortcuts.md` (matrix — оновити статуси).
- **Acceptance:**
  - `Cmd+/` — open AI асистент drawer / focus chat input.
  - `Cmd+S` — context-aware save (e.g. у профілі form-submit; на сторінках без form-context — no-op + захист від browser-default Save Page через `e.preventDefault()`).
  - `G H..N` chord pattern — navigation jumps (G→H = Hub, G→F = Finyk, G→Z = Fizruk, G→R = Routine, G→N = Nutrition).
  - browser-conflict matrix у `docs/ui/shortcuts.md` оновлено: усі handler-и `Registered`; немає більше `TBD`.
  - Playwright smoke-test (`apps/web/tests/smoke/keyboard-shortcuts.spec.ts`, `@critical`) — assert Cmd+K, Cmd+/, G+H працюють.
  - Альтернативний path: якщо wire-up неможливий для будь-якого ярлика — видалити його з `DEFAULT_SHORTCUTS` + оновити doc.
- **Size:** M
- **Priority:** P2
- **Depends on:** —
- **Owner:** `TBD (frontend-engineer)`

---

## Sequencing

Архітектурний рефактор треба завести перший раз для двох речей: (a) per-route
loader / bundle-gate працює без hash-redirect-петель → A1 → A2 → A3 — лінійний
ланцюг; (b) DI-міграція `apiClient` змінює patterns, на яких потім сидить
ergonomics-робота — A5 виставляється раніше за E4 / E6.

Ergonomics ESLint-правило (E1) має зайти перед чисткою callsite-ів (E2),
інакше allowlist стає документацією поточного стану замість burndown-плану.

```
Phase 1 (week 1–2, parallel streams):
  Stream A (routing):   A1 → A2 → A3
  Stream B (DI):        A5 → A6
  Stream C (a11y):      E1 → E2
  Stream D (PWA):       E3                (standalone)
  Stream E (decompo):   A4 (4 sub-PRs)    (standalone, паралельно з усіма)

Phase 2 (week 3–4):
  E4 (mapApiErrorToUserCopy)              (після того, як A5 змерджений)
  E5 (PTR disabled)                       (standalone)
  E7 (keyboard wire-up)                   (standalone)
  A7 (DX polish + factory)                (low-priority, у фон)

Phase 3 (week 5–6):
  E6 (useApiForm rollout — 4 sub-PRs)     (після E4 для error-mapping consistency)
```

Темп ≈ 2 PR/тиждень при двох інженерах, ≈ 1 PR/тиждень при одному. Phase 1 —
найважча: 6 PR-карток, з них 4 — P1. Phase 2 — стандартна. Phase 3 — burndown.

---

## Risks

- **R1. `useHashRouter` codemod у 30 файлах (A1) — найбільш ризикований PR.** Risk: codemod ламає deep-link navigation / shell-bridge handoff (mobile Capacitor uses `HashRedirect` для cold-start deep-links). Mitigation: (1) Playwright smoke `@critical onboarding deep-link` лишити зеленим; (2) staged rollout — модуль за модулем, не all-at-once codemod; (3) Capacitor smoke у mobile-shell перед merge.
- **R2. DI-міграція `apiClient` (A5) — ~30 import-sites + test-mock pattern зміна.** Risk: тести, що mock-ають через `vi.mock("@shared/api")` глобально, перестають працювати; flaky-test risk висока. Mitigation: (1) міграція по directory-tree (`core/` → `features/` → `modules/`); (2) RTL render-helper з `<ApiClientProvider>` як shared util; (3) ESLint rule `no-singleton-api-client-import` як warn-only на час міграції, escalate в error в кінці.
- **R3. Decomposition (A4) — кожен з 4 файлів — самостійний ризик.** Risk: розбити `hubChatContext.tsx` (681 LOC) неакуратно → split-brain між streaming-state і tool-call-state. Mitigation: cookbook з Hard Rule #18 «Як декомпонувати» — по ролі, не по алфавіту; precedent — `apps/server/src/modules/chat/` decomposition; кожен sub-PR має бути ≥ -50 LOC test-coverage delta.
- **R4. Modal a11y fixes (E2) — focus-trap може ламати existing flows.** Risk: focus-trap у `<QuickActionsMenu>` блокує користувача коли menu має лінк-таб. Mitigation: Playwright + axe lane на кожному з 5 файлів; manual keyboard-only smoke перед merge.
- **R5. SW-update defer (E3) — таймер-based logic може bricknути prompt назавжди.** Risk: streaming-state stuck on некоректній flag → prompt ніколи не показується → користувач не отримує оновлень. Mitigation: hard timeout 10 хв ⇒ force-show prompt; manual smoke з артифіційно повільним streaming.
- **R6. Keyboard shortcuts (E7) — Cmd+S override-ить browser-default Save Page.** Risk: користувач очікує browser-default. Mitigation: context-aware — `Cmd+S` тільки коли form-context активний (focus всередині `<form>`); інакше не preventDefault.
- **R7. Per-route bundle-gate (A3) — false-positive failures на feature-branch-ах.** Risk: розробник додає 5 kB → CI fail → frustration. Mitigation: `audit-exception` label (як для існуючого `Bundle size guard`) для swift override; LHCI tightening — first-pass `warn`, error через 2 тижні після stable-baseline-ів.

---

## Свідомо excluded

- **`useApiForm` foundation API changes** — рекомендації прожарок виходять із поточного API; будь-яка зміна (`useFieldArray`, async-validators) — окрема прожарка / RFC.
- **AccentScope cross-cutting tests (P2-C з architecture roast)** — потрібен інвентар per-module, окрема прожарка.
- **State-management migration зі співіснування Zustand + Context + RQ** — поза скоупом цих двох прожарок; чекає окремий audit на state-management strategy.
- **Backend/server-side touches** — `apps/server/**` і `packages/api-client/**` зміни — поза скоупом (тут лише consumer-side апдейти).

---

_Build-up з прожарок `2026-05-13-web-architecture-state-roast.md` (#3/10) +
`2026-05-13-web-frontend-ergonomics-roast.md` (#2/10). Parent-session
запустив 10 паралельних audit-child-ів; цей PR-план злив у одне місце web-frontend
slice (карти 2 + 3 з 10)._
