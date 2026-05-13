# Web Architecture & State Roast — 2026-05-13 (Прожарка #3/10)

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11.
> **Status:** Active
> Targeted re-audit web-фронту: state management, routing, providers, code-split, RQ keys, module decomposition. Скоуп — `apps/web` лише.

## Cross-refs (попередні прожарки/аудити цієї теми)

- [`docs/audits/2026-05-03-web-deep-dive/02-architecture-and-state.md`](./2026-05-03-web-deep-dive/02-architecture-and-state.md) — джерело §1.0–2.4 working-list-у (343 рядки, 4 P0 + 6 P1 + кілька P2)
- [`docs/audits/archive/2026-04-28-sergeant-comprehensive-audit.md`](./archive/2026-04-28-sergeant-comprehensive-audit.md) — оригінальна comprehensive прожарка
- [`docs/audits/2026-04-28-implementation-roadmap.md`](./2026-04-28-implementation-roadmap.md) — sprint-roadmap по audit-items
- [`docs/initiatives/0006-frontend-routing-and-code-split.md`](../initiatives/0006-frontend-routing-and-code-split.md) — react-router migration (in progress, Phase 2 of 5)
- [`docs/initiatives/0013-module-decomposition-round-2.md`](../initiatives/0013-module-decomposition-round-2.md) — `max-lines: 600` burn-down (Sprint 1 closed, Sprint 2 pending)
- [`docs/architecture/module-ownership.md`](../architecture/module-ownership.md) — ownership / test stack / RQ keys factory per path
- [`docs/architecture/state-write-paths.md`](../architecture/state-write-paths.md) — **NEW** (closes §2.1) — двоканальна writer-доктрина (UI vs chatActions)
- [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) — live tech-debt тікет-лист

## TL;DR

1. **Більша частина P0 з web deep-dive 2026-05-03 закрита.** `strict: true` ввімкнено на `apps/web` (Phase 5 cleanup `a7a31703`), `index.css` декомпозовано (~34 LOC, було 1244), `localStorage`-allowlist занулено (production: 0, Stage 7/9 storage-roadmap), CloudSync v1 engine видалено (Stage 13, PR #052b/#052c/#053a), `useCloudSync` 7-tuple replaced by single-purpose `useSyncStatus`. Інтеграційні split-brain тести додані PR #1607 / #1968. Залишок P0 — мікро-довідки + інваріантні тести.
2. **Provider tree досі не мав invariant-тесту** (§1.1) — `App.tsx` jсв ladder з 70 рядків JSX, де `ToastContainer` / `ScrollRestoration` / `PageviewTracker` сиблінгували з провайдерами. Хто-небудь міг переставити рядки і `useAnnounce()` тихо ламався. **Закрито в цьому PR.**
3. **`renderStandaloneRoute` був імперативним switch-ом з 7 `if`-блоків** (§1.2). Додавання нової URL-сторінки вимагало synchronizованих edits у `appPaths.ts` + `StandaloneRoutes.tsx` + `useAppEffects.ts` без shared-type. Drift ловився тільки на ручному review. **Закрито в цьому PR** через typed `STANDALONE_ROUTES` registry + exhaustiveness snapshot test.
4. **Дві writer-доріжки (UI `useMutation` vs HubChat `chatActions` tool-call) не були документовані** (§2.1). Регресії типу «чек на 2 ₴ у чаті, 20 ₴ у Finyk-сторінці» (двократний bugfix не відбувся) тримались на review-discipline. **Закрито в цьому PR** через `docs/architecture/state-write-paths.md` з контрактами, anti-patterns, decision matrix.
5. **Initiative 0006 (frontend routing) — 4/8 модулів top-level path-based** (nutrition, finyk, fizruk, routine). `/` / `/sign-in` / `/welcome` / `/reset-password` / `/profile` / `/design` / `/pricing` / `/assistant` / `/chat` лишаються у catch-all `<App />`. Phase 3 (hash-URL compat shim — `HashRedirect` уже існує) + Phase 4 (`ScrollRestoration` уже існує) частково шиплено в нестандартних PR-ах поза initiative; формальний sign-off на Phase 3/4 не зроблений.
6. **Initiative 0013 (max-lines: 600 burn-down) — Sprint 1 closed, Sprint 2 pending.** 5 файлів лишаються в allowlist: `NutritionApp.tsx` (766), `hubChatContext.tsx` (681), `HubDashboard.tsx` (676 → 115 після PR #2607 — entry прибрано), `fizrukActions.ts` (672), `AssetsTable.tsx` (671). Тех-борг не блокує цю прожарку, але і не закривається тут (occupies own initiative).
7. **`AppInner.tsx` (`apps/web/src/core/App.tsx`) тепер 222 LOC** з 275 (після Providers extraction). Лишається 1 файл-кандидат на декомпозицію в App-shell — `useHubNavigation.ts` + `useAppEffects.ts` лишаються moderate-sized і acceptable.
8. **Server-side §1.5 (createApp factory) / §1.6 (SERVER_ROLE env + event-loop metrics)** — поза скоупом цієї прожарки (це backend-теми, `apps/web` only).

## Outstanding working-list (з попередніх джерел)

Робив scan по 6 джерел; зберіг тільки items без landing PR / без статусу "Done" / "✅" / "Closed". Pure-tally:

### P0 (раніше відкриті, зараз закриті в цьому PR)

| Item                                                                                                                                     | Прохід у попередніх раундах                                                                                                                                    | Тут        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| §1.1 Provider tree без invariant-test-у (`docs/audits/2026-05-03-web-deep-dive/02-architecture-and-state.md:42-96`)                      | `App.tsx` interleaved providers + siblings, no test catches misorder. Recommendation: extract `<Providers>` + render-test deepest child can read all contexts. | **CLOSED** |
| §2.1 chatActions як другий writer-канал без явної доктрини (`docs/audits/2026-05-03-web-deep-dive/02-architecture-and-state.md:217-256`) | Audit recommended `docs/architecture/state-write-paths.md` documenting UI mutation path + HubChat tool-call path + decision matrix. Не існувало.               | **CLOSED** |

### P1 (раніше відкриті, зараз закриті в цьому PR)

| Item                                                                                                                              | Прохід                                                                                                                                                                                    | Тут        |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| §1.2 `renderStandaloneRoute` як імперативний switch (`docs/audits/2026-05-03-web-deep-dive/02-architecture-and-state.md:100-181`) | Audit recommended typed `defineStandaloneRoute({ path, lazy })` registry + snapshot-test on `KNOWN_PATHS` ↔ `renderStandaloneRoute` exhaustiveness. Imperative switch was prone to drift. | **CLOSED** |

### P0/P1 (раніше закриті — для повноти запису)

| Item                                                     | Закрито у                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| §1.0 `strict: true` migration apps/web                   | Phase 5 cleanup `a7a31703` (2026-05-03)                                  |
| §1.4 `index.css` decomposition (1244 LOC → 34 LOC)       | #1601 + follow-up burndown (2026-05-03–06)                               |
| §2.2 `localStorage` allowlist (15 → 6 → 0)               | PR #054 final + PR #054a + Stage 7/9 storage-roadmap (PR #063/#064/#065) |
| §2.3 CloudSync split-brain integration tests             | #1607 + #1968 (2026-05-04–07)                                            |
| §2.4 `useCloudSync` 7-tuple → split into `useSyncStatus` | Stage 13 / PR #052b / PR #052c (2026-05-04–06)                           |

### P1 (виходить за межі цього PR; не закрито)

| Item                                                                                                                                                                         | Причина не-закриття у цьому PR                                                                                                                                        | Пропоновано у                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Initiative 0006 Phase 3 — `useHashRouter` removal across `apps/web/src/**` codemod                                                                                           | Cross-module scope: 30+ файлів, потребує per-module review + ESLint rule escalation (`no-hash-router-in-modules`: warn → error). Безпечно тримати у власній прожарці. | Окрема прожарка / continuation на 0006 |
| Initiative 0006 Phase 4 — route-loaders для prefetch                                                                                                                         | Потребує MSW-based tests + bundle-budget baseline numbers per route                                                                                                   | Окрема прожарка на bundle-perf         |
| Initiative 0006 Phase 5 — per-route bundle-gate в CI                                                                                                                         | Потребує LHCI runtime baselines + size-limit per-route entries (зараз все під единим entry-чанком)                                                                    | Окрема прожарка на CI gates            |
| Initiative 0013 Sprint 2 — decompose 5 files (`NutritionApp` 766, `hubChatContext` 681, `fizrukActions` 672, `AssetsTable` 671, був `HubDashboard` 676 — закрито у PR #2607) | Decomposition work кожен файл — окремий PR, 30–80 LOC test-coverage delta. Sprint 2 живе у власній initiative.                                                        | 0013 Sprint 2                          |

### P2 (нові finding-и, виявлені під час цієї прожарки)

| Item                                                                                                                                                                        | Деталі                                                                                                                                                              | Дія                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Provider-тест НЕ покриває remount-invariant on hot-reload                                                                                                                   | `App.test.tsx` перевіряє single-render path. HMR / Suspense boundary remounts не покриті — окрема regression-тема, бо потребує `@vitejs/plugin-react` test-bridge.  | Add follow-up issue (low risk).                                                                                         |
| `STANDALONE_ROUTES` registry поки що внутрішній — не `defineStandaloneRoute` функція з generic-type-validation                                                              | Audit §1.2 рекомендував повну factory-pattern (`defineStandaloneRoute({ path, lazy })`). Поточний реалізує мінімальну версію — typed array + exhaustiveness test.   | Future enhancement: factory з `lazyImport`-баррелями і per-route `paths: readonly tuple` для discriminated-union типів. |
| `state-write-paths.md` згадує `useApiClient()` як «нову» інжекцію через provider, але web-fронт здебільшого все ще імпортує singleton `apiClient` з `@shared/api`           | Singleton vs DI split-brain не закритий. Тест-кейс — mock у тестах: компоненти, що імпортують `apiClient` напряму, не можуть бути замокані без top-level `vi.mock`. | Окрема прожарка на DI-strategy (`useApiClient` migration).                                                              |
| `chatActions/<module>Actions.ts` — деякі handlers все ще пишуть у `localStorage` через wrapper, не через `apiClient` (legacy fizruk-actions, deep-rooted local-first state) | §2.1 закриває **доктрину**, але implementation-fix у конкретних handler-ах — окрема робота (audit row у `state-write-paths.md` "Anti-patterns" section).            | Окрема прожарка на chatActions migration / або follow-up PR-ів.                                                         |

## Прогрес виконання (закрито в цьому PR)

| #   | Audit § / Initiative                                           | Дія                                                                                                                                                                                                                                                                                                                       | Файли                                                                                    |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | §1.1 Provider tree invariant                                   | **Add** `apps/web/src/core/app/Providers.tsx` (extracted provider ladder, 1-3 phase docstring) + **Change** `apps/web/src/core/App.tsx` (collapse 70-line JSX ladder → `<Providers><AppInnerWithLock /></Providers>`).                                                                                                    | `apps/web/src/core/app/Providers.tsx` (new) · `apps/web/src/core/App.tsx`                |
| 2   | §1.1 Provider tree invariant test                              | **Add** `apps/web/src/core/App.test.tsx` (jsdom): рендерить deepest child, що викликає `useToast()` + `useAnnounce()` + `useAuth()`. Throw на missing-provider — fail-test. Стуби: `ShellDeepLinkBridge` / `HashRedirect` / `PageviewTracker` / `ScrollRestoration` / `useUser` / `authClient` / `posthog` / `analytics`. | `apps/web/src/core/App.test.tsx` (new)                                                   |
| 3   | §1.2 Typed standalone-route registry                           | **Change** `apps/web/src/core/app/StandaloneRoutes.tsx`: `if/if/if` switch (7 branches) → typed `STANDALONE_ROUTES: readonly StandaloneRoute[]` array з `paths` + `render`. **Export** `STANDALONE_ROUTE_PATHS: ReadonlySet<string>` для тестів.                                                                          | `apps/web/src/core/app/StandaloneRoutes.tsx`                                             |
| 4   | §1.2 Exhaustiveness test (`KNOWN_PATHS` ↔ `STANDALONE_ROUTES`) | **Add** test block у `apps/web/src/core/app/StandaloneRoutes.test.tsx`: (a) кожен path з `STANDALONE_ROUTE_PATHS` має бути у `KNOWN_PATHS`; (b) кожен `KNOWN_PATHS` entry (крім `/`) — owned by some `STANDALONE_ROUTES` entry. Регресія drift'у тепер ловиться CI, не review.                                            | `apps/web/src/core/app/StandaloneRoutes.test.tsx`                                        |
| 5   | §2.1 State write-paths doctrine                                | **Add** `docs/architecture/state-write-paths.md`: TL;DR + 2 канали (UI mutation / AI tool-call) + decision matrix + інваріанти CI / anti-patterns / migration playbook / FAQ. Cross-refs у нову roast + audit + module-ownership.                                                                                         | `docs/architecture/state-write-paths.md` (new)                                           |
| 6   | Roast itself + audits README                                   | **Add** `docs/audits/2026-05-13-web-architecture-state-roast.md` (цей файл). **Change** `docs/audits/README.md`: 1 row у status-таблицю.                                                                                                                                                                                  | `docs/audits/2026-05-13-web-architecture-state-roast.md` (new) · `docs/audits/README.md` |

## P0/P1/P2 розбивка для майбутніх прожарок (з file:line refs)

### P0 (data-loss / security risk)

P0 нових немає — попередні P0 закриті у попередніх PR-ах або у цій прожарці.

### P1 (architecture-level tech-debt)

- **P1-A.** Initiative 0006 Phase 3 — `useHashRouter` migration. Refs: `docs/initiatives/0006-frontend-routing-and-code-split.md:124-149`. Action: codemod across `apps/web/src/modules/{finyk,fizruk,routine,nutrition}/**`; escalate ESLint rule `no-hash-router-in-modules` (`packages/eslint-plugin-sergeant-design/index.js`) `warn` → `error`. Effort: ~30 files.
- **P1-B.** Initiative 0006 Phase 4 — route-loaders + prefetch. Refs: `docs/initiatives/0006-frontend-routing-and-code-split.md:151-175`. Action: implement `loader: () => prefetch(qc, [...])` in each `apps/web/src/modules/<mod>/route.tsx` (`apps/web/src/modules/finyk/route.tsx:40-42`, плюс 3 інші).
- **P1-C.** Initiative 0013 Sprint 2 — decompose 4 remaining files. Refs: `docs/initiatives/0013-module-decomposition-round-2.md:55-95`. Action: per-PR breakout for `NutritionApp.tsx` (`apps/web/src/modules/nutrition/NutritionApp.tsx`, 766 LOC), `hubChatContext.tsx` (`apps/web/src/core/hub/hubChatContext.tsx`, 681 LOC), `fizrukActions.ts` (`apps/web/src/core/lib/chatActions/fizrukActions.ts`, 672 LOC), `AssetsTable.tsx` (`apps/web/src/modules/finyk/components/AssetsTable.tsx`, 671 LOC).
- **P1-D.** Singleton `apiClient` vs `useApiClient()` DI split-brain. Refs: `apps/web/src/shared/api/index.ts:19`, `docs/architecture/state-write-paths.md` (FAQ-section). Action: migrate consumer-сайт `import { apiClient } from "@shared/api"` → `const api = useApiClient()` усередині компонент. Effort: ~30-40 imports.
- **P1-E.** chatActions handlers, що пишуть у `localStorage` напряму замість `apiClient`. Refs: `apps/web/src/core/lib/chatActions/fizrukActions/*` (deep-rooted local-first), `docs/architecture/state-write-paths.md` (Anti-patterns section). Action: per-handler audit + migration. Кожен handler — окремий PR з contract-тестом.

### P2 (DX / cleanup)

- **P2-A.** Provider invariant test не покриває HMR remount-invariant (`apps/web/src/core/App.test.tsx`). Action: add Vite-test-bridge case for hot reload `Providers` → assert deepest child still mounted.
- **P2-B.** `STANDALONE_ROUTES` зараз — internal `const`, не `defineStandaloneRoute({...})` factory. Action: винести у factory з generic-type discriminated-union поверх `paths` (rec from §1.2).
- **P2-C.** Module accent тести (`shared/components/ui/AccentScope*.test.tsx`) — coverage поки що per-component, не cross-cutting. Refs: `apps/web/AGENTS.md` (Hard Rule #12). Action: integration-test per module bound (`finyk-only`, `fizruk-only`, ...).
- **P2-D.** `useSyncStatus` polling: `getStatus()` викликається на кожен `online`/`offline` window event, але не повторюється поки користувач сидить online. Refs: `apps/web/src/core/cloudSync/hook/useSyncStatus.ts:41-66`. Action: інкрементний polling через `useQuery` з `refetchInterval: 30_000` для активного online-сесії.
- **P2-E.** `appPaths.ts:KNOWN_PATHS` тримається hand-maintained; ідея — генерувати з `STANDALONE_ROUTES`. Refs: `apps/web/src/core/app/appPaths.ts:43-53`. Action: invert dependency — `KNOWN_PATHS = new Set([..."/" , ...STANDALONE_ROUTE_PATHS])`. Поки що залишаємо як є, бо `appPaths.ts` імпортується у `useHubNavigation` ↔ `StandaloneRoutes.tsx` ↔ `App.tsx` (cycle avoidance).

## Methodology / scope notes

- **Скоуп:** `apps/web/src/{app,core,features}/**`. Backend (`apps/server`), mobile-shell (`apps/mobile`, `apps/mobile-shell`), packages — out of scope.
- **Не торкається:** SQLite migration Stage 8/9 (окрема active initiative, see `docs/planning/storage-roadmap.md`).
- **Verification:** `pnpm check` локально (format:check + lint + typecheck + test) + CI.
- **Sources-of-truth:** `docs/audits/2026-05-03-web-deep-dive/02-architecture-and-state.md` (primary), `docs/initiatives/0006-frontend-routing-and-code-split.md`, `docs/initiatives/0013-module-decomposition-round-2.md`, `docs/architecture/module-ownership.md`, `docs/tech-debt/frontend.md`. Cross-checks: `docs/audits/2026-04-28-implementation-roadmap.md`, `docs/audits/archive/2026-04-28-sergeant-comprehensive-audit.md`.

---

_Прожарка #3/10. Parent session запустив 10 паралельних audit-children; ця сесія — 3-тя. Інші 9 ведуть власні теми._
