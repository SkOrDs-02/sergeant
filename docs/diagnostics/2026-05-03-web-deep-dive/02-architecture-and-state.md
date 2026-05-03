# Web deep-dive — Architecture & state

> **Last validated:** 2026-05-03 by @Skords-01.
> **Status:** Active
> **Scope:** Provider tree, routing, sync v1↔v2, `index.css`, in-process workers, React Query patterns, `localStorage` migration, CloudSync split-brain risk, `useCloudSync` shape.
> **Related:** [`00-overview.md`](./00-overview.md), `docs/tech-debt/frontend.md`, `docs/audits/2026-04-28-sergeant-comprehensive-audit.md`.

Архітектурний шар у Sergeant — найсильніший на сервері (factory `createApp`, granular guards, graceful shutdown). На фронті — нерівномірно: provider-tree без інваріантів, імперативний роутер, гігантська stylesheet. Нижче — точкова прожарка.

---

## 1.0 [Bad] `apps/web` усе ще на `tsconfig.strict: false`

**Що бачу.** Більшість пакетів на strict. `apps/web/tsconfig.json` — softer. Це проривається у формах, у `chatActions/*` і у місцях, де `unknown` ховається під «м'якою» типізацією. Існуючі strict-coverage метрики бренять, але руки до кінця не дійшли.

**Чому це дороге.** На рік 856 TS/TSX-файлів накопичили десятки місць з implicit-any, де реальний тип невідомий. Кожен новий PR — потенційний ствол у ногу.

**Recommendation / fix points.**

1. Поетапна міграція `apps/web` на strict:
   - **Етап 1 (1 тиждень):** `noImplicitAny: true` + `strictNullChecks: true` — найболючіше, але дає ~70% типобезпеки.
   - **Етап 2 (1 тиждень):** `strictFunctionTypes` + `strictBindCallApply`.
   - **Етап 3 (3 дні):** `strictPropertyInitialization` + `alwaysStrict` + повний `strict: true`.
2. Для кожного етапу — окремий PR з минимально-достатнім количеством `// @ts-expect-error TODO(strict-migration): <issue-link>` коментарів, де quick-fix неможливий за разовий PR.
3. Hard Rule: «новий `// @ts-expect-error` без TODO-issue-link → CI fail». Це убезпечить від permanent suppression.
4. Snapshot-test «`tsconfig.strict` levels per package» — щоб ніхто не міг знизити рівень без явного PR-повернення назад.

**Tracker.** Винести у `docs/tech-debt/frontend.md` як окремий milestone `strict-migration` з KPI «N flags enabled».

---

## 1.1 [Bad] App.tsx — provider tree без явної інваріанти на порядок

**Що бачу.** `apps/web/src/core/App.tsx:35-69`:

```
ShortcutRegistryProvider
└─ ToastProvider
   ├─ ToastContainer            ← sibling, а не дитина
   ├─ ShellDeepLinkBridge
   ├─ PageviewTracker
   └─ ScreenReaderAnnouncerProvider
      └─ ApiClientProvider
         └─ AuthProvider
            └─ AppInner
```

**Проблеми.**

- `<ToastContainer />` як sibling до `<ToastProvider>` працює, бо `ToastProvider` тримає state у своєму context, а контейнер просто читає його. Але це неконсистентно з тим, як зазвичай читається React-tree, і легко зламати, переставивши рядки. **Жодного тесту, який би це перевіряв, я не знайшов.**
- `<PageviewTracker />` стоїть **до** `ScreenReaderAnnouncerProvider`. Pageview не використовує announcer, тож працює. Але коментар у файлі прямо каже, що правильна позиція — «всередині BrowserRouter, поза AuthProvider». Це робить semantic залежності неявними.
- `<AuthProvider>` обгорнутий в `<ApiClientProvider>` — це правильно (auth робить fetch через apiClient), але далі в коді `AuthContext.tsx` сам створює `authClient` з Better Auth client SDK, не використовуючи `apiClient`. Тобто `ApiClientProvider` — це тільки для React Query / shared API. Це нормально, але varto зробити коментар явним.

**Recommendation / fix points.**

1. Додати **інваріант-тест** `apps/web/src/core/App.test.tsx`, який перевіряє, що `useToast()` / `useAnnounce()` / `useAuth()` всі викликабельні з найглибшого дерева:

   ```tsx
   it('all required contexts are reachable from the deepest child', () => {
     const Spy = () => {
       useToast();
       useAnnounce();
       useAuth();
       return null;
     };
     // render <App><Spy /></App> via test factory
     expect(() => render(...)).not.toThrow();
   });
   ```

2. Винести boilerplate-провайдерів у `core/app/Providers.tsx`, лишивши в `App.tsx` тільки:

   ```tsx
   return (
     <Providers>
       <AppInner />
     </Providers>
   );
   ```

3. Згрупувати провайдери по «фазах»:
   - `BootstrapProviders` (Shortcut, Toast, Announcer) — pure UI infra без I/O;
   - `RouterEffects` (DeepLinkBridge, PageviewTracker) — React Router effects;
   - `DataProviders` (ApiClient, Auth) — все, що робить I/O.

   Це зменшить шум у `App.tsx` з 70 рядків JSX до ~30, і кожна фаза стає окремо тестованою.

---

## 1.2 [Bad] Routing у `AppInner` — імперативний `renderStandaloneRoute`

**Що бачу.** `apps/web/src/core/App.tsx:161-181` — `renderStandaloneRoute` повертає JSX або `null` залежно від `location.pathname`. Це фактично own-rolled router зверху над React Router.

**Аргументи за.**

- Типобезпечніше, ніж масив `<Route>`-ів.
- Дає прямий контроль над «коли SPA вирішує, що це standalone, а коли — хаб».

**Аргументи проти.**

- React Router DevTools не бачить ці маршрути.
- Code splitting на рівні маршруту реалізується вручну (через `lazy()` всередині `StandaloneRoutes.tsx`).
- Будь-яка нова сторінка вимагає правки `renderStandaloneRoute` + `appPaths.ts` + іноді `useAppEffects.ts` (для tracking) — три синхронних edit-и без явного зв'язку.

**Recommendation / fix points.**

1. Або повернутися до `<Routes>` з декларативним `<Route element={lazy(...)} />` — простіше, work з DevTools.
2. АБО винести «свій роутер» у явну абстракцію `defineStandaloneRoute({ path, lazy, ... })` з типобезпечним registry:

   ```ts
   const routes = defineStandaloneRoutes([
     { path: '/auth', component: lazy(() => import('./auth/AuthPage')) },
     { path: '/onboarding', component: lazy(() => import('./onboarding/OnboardingPage')) },
   ]);
   ```

3. У будь-якому варіанті — **single source of truth** у `appPaths.ts` (вже є `KNOWN_PATHS`), з якої генерується і список, і type-level union (`type StandalonePath = (typeof KNOWN_PATHS)[number]`).
4. Snapshot-test на `KNOWN_PATHS` ↔ `renderStandaloneRoute` exhaustiveness — щоб додавання нової сторінки в `KNOWN_PATHS` без імплементації фейлило CI.

---

## 1.3 [Good, але крихке] Per-row sync v1 ↔ v2 живуть паралельно

**Що бачу.** `apps/server/src/routes/sync.ts:17-32` — обидва контури sync-у активні. Це чесний міграційний паттерн (PR-21..52).

**Проблеми.**

- На фронті `useCloudSync.ts` в barrel re-export, а реальна реалізація в `core/cloudSync/*` — багато файлів. Я бачу окремі queue, окремі rate-limit-будgets, окремі `module=syncV2` для логів. **Я НЕ знайшов load-shed test-у або fault injection** (що буде, якщо v2 сильно повільніший за v1, або один з них падає 5xx). Якщо це є — варто посилатись на нього прямо в коментарі.
- Будь-який «Stage 2» / «Stage 7 cleanup» застрягає, якщо немає чіткого SLA на видалення v1.

**Recommendation / fix points.**

1. Додати **`@deprecated_after: 2026-XX-XX`** marker у коментар над v1-кодом, який ловиться скриптом і починає кричати в CI після дати. Скрипт: `scripts/check-deprecated-after.mjs` (~30 LOC).
2. Fault-injection тест: in-memory сервер, де v2 endpoint штучно повертає 5xx або 30s latency → перевіряти, що клієнт не зависає, не дублює queue, не втрачає offline-changes.
3. Метрика `sync.duration_ms{version=v1|v2}` у Prometheus / PostHog — порівняти p95 на тих самих payload-ах.

---

## 1.4 [Bad] `apps/web/src/index.css` — 1244 рядки

**Що бачу.** `wc -l apps/web/src/index.css` → **1244**. Це антипаттерн для проєкту з `packages/design-tokens` і Tailwind preset.

**Що там зазвичай.** `@layer base/components/utilities`, CSS variables для тем, custom utilities, motion/transitions, scroll-snap-патерни.

**Recommendation / fix points.**

1. Перенести design tokens (CSS vars) у `packages/design-tokens/css/` і експортувати окремий entry. У `index.css` — тільки `@import '@sergeant/design-tokens/css/...'`.
2. Розбити по доменах:
   - `index.css` — тільки `@tailwind`-директиви + import-и інших файлів.
   - `base.css` — reset, body, headings, scrollbar.
   - `components.css` — `.btn-*`, `.card`, повторювані utility-комбінації.
   - `motion.css` — keyframes, transitions, `prefers-reduced-motion` overrides.
   - `theme.css` — light/dark CSS-vars.
3. Будь-які `@apply`-rules >5 utilities → це сигнал, що варто компонент, а не стиль.
4. ESLint rule (`sergeant-design`): «no `@apply` with >5 tailwind classes» (можна зробити через PostCSS plugin).

**Точковий план міграції.** PR_A → виносить tokens. PR_B → розбиває `index.css` на 4 файли. PR_C → переводить top-10 `@apply`-stack-ів на компоненти.

---

## 1.5 [Good] Server `createApp` — pure factory

`apps/server/src/app.ts:118-200` — factory не читає `process.env`, не викликає `listen()`, повертає налаштований Express. Тестується trivially у Vitest. **Це лишити як еталон** для майбутніх `createWorker`/`createSocketApp`.

> **Що зробити правильно зараз.** Документувати цей паттерн в `docs/architecture/server-factory.md` як «**The Sergeant server factory contract**» — щоб майбутні нові сервери (gRPC, WebSocket, worker) дотримувались.

---

## 1.6 [Bad] In-process workers vs API на одному процесі

**Що бачу.** `apps/server/src/index.ts:64-98` — Mono enrichment, auth-mail BullMQ, AI memory ingest стартують у тому ж Node-процесі, що і API. Коментар чесно зазначає це як «свідомий вибір при поточному об'ємі».

**Ризики.**

- При rolling deploy на 2+ репліках обидва процеси триматимуть Redis-connection і будуть конкурувати за чергу — `BullMQ` це витримає, але **без розділення метрик** ти не побачиш, котра репліка бере більше job-ів.
- Якщо worker почне втрачати event-loop (важкий enrichment), API-latency полізе — `requestTimeout` врятує клієнта, але SLA скаче.

**Recommendation / fix points.**

1. Додати **`SERVER_ROLE=api|worker|all`** env (вже є `SERVER_MODE`, але це не те саме). При `worker`-only процесі — не запускати `app.listen()`. Це дасть тобі готову dial при першому скейлі.
2. Додати окремі prom-метрики `worker_event_loop_lag_seconds` і алерт на p95 > 200ms.
3. Документ `docs/observability/event-loop-health.md` зі SLO «p95 event-loop lag < 200ms» і runbook'ом «що робити, якщо алерт спрацював».
4. **Не розділяти** на окремі процеси, поки SLO тримається. Це YAGNI.

---

## 2.1 [Good, але непослідовно] React Query з centralized `queryKeys.ts`

**Що бачу.** Hard Rule #2 каже «RQ keys тільки через factory». Це сильно. Але:

- У шарі `chatActions/*` (раніше 758-LOC `finykActions.ts`, зараз розрізаний) частина мутацій робить **прямі fetch-и через `apiClient`**, а потім просто інвалідує query — це нормально для AI tool-use, але dedup між «AI inserted a debt» і «UI inserted a debt» іде через SyncedKV / CloudSync, а не через RQ.

**Чому це сюрприз для нового developer.** Він спробує переробити «правильно» (всі writes через `useMutation`), що зломає двоконтурну запис-стратегію.

**Recommendation.**

- Документувати **двоконтурний запис-pattern** окремо в `docs/architecture/state-write-paths.md`:
  - Контур 1 (UI): RQ `useMutation` → `apiClient.x.create()` → invalidate.
  - Контур 2 (AI tool-call): direct `apiClient.x.create()` → CloudSync queue → invalidate via event.
- Додати ESLint custom rule (через `sergeant-design`-plugin): «JSX-Component, що містить `apiClient.<module>.<verb>` без `useMutation` обгортки → warning, з allowlist у `chatActions/`».

---

## 2.2 [Bad] `localStorage` allowlist у 17 файлах

**Що бачу.** `docs/tech-debt/frontend.md:89-100` — є TODO-список з 17 файлами, які усе ще читають `localStorage` напряму через `eslint.config.js` allowlist. Допустима тимчасова фаза, але burn-down треба **запланувати**, а не «коли руки дійдуть».

**Чому це дороге.** Кожен з цих файлів — потенційний краш у Safari Private Mode (де `localStorage.setItem` кидає `QuotaExceededError`) або у iOS WebKit з очищеним сховищем.

**Recommendation / fix points.**

1. Додати в roadmap milestone **«localStorage migration: 17 → 0»** з KPI на квартал.
2. Згенерувати automated PR codemod для тих 17 файлів. Більшість з них — однотипний патерн:

   ```ts
   // before
   const x = JSON.parse(localStorage.getItem('key') || 'null');
   localStorage.setItem('key', JSON.stringify(value));

   // after
   const x = safeReadLS('key', schema);
   safeWriteLS('key', value, schema);
   ```

3. ESLint allowlist уже сам по собі сигнал — додай у CI annotation «allowlist скоротився на N рядків з минулого major-релізу». Якщо за квартал 0 progress — automatic block.
4. Codemod-recipe: `jscodeshift` rule (~50 LOC), яка:
   - Знаходить `localStorage.getItem`/`setItem` calls;
   - Обгортає в `safeReadLS`/`safeWriteLS`;
   - Додає import з `@sergeant/safe-storage` (або де воно є);
   - Залишає TODO-comment, якщо schema unknown.

> **Tracker hook.** Винести burn-down progress у `docs/tech-debt/frontend.md` як окремий KPI «localStorage allowlist size».

---

## 2.3 [Bad] CloudSync без E2E reproduction для split-brain

**Що бачу.** LWW conflict-resolution + per-row op-log v2 — це грамотно для local-first. Але реальні баги в local-first народжуються в нетипових сценаріях:

- Юзер створив транзакцію офлайн → закрив вкладку → відкрив на іншому пристрої → створив там → синк → що бачимо?
- Юзер видалив запис на A → перейменував на B → A синкнувся пізніше → tombstone wins?
- Clock skew на мобіли проти сервера >2 хв.
- Network flapping посередині `pushAll` — частина успішна, частина — ні.
- Сервер відповідає 5xx на одну з 50 row-операцій — як re-queue?

Я не знайшов **integration test** на ці сценарії. Є unit-тести на queue, є unit-тести на кодек, але end-to-end split-brain прогон — ні. **Це прихований risk #1 у проєкті.**

**Чому це найвищий ризик.** Якщо щось зламається тут — це втрата даних користувача. Найгірше з можливого. Юзери не пробачають втрачені фінансові транзакції.

**Recommendation / fix points.**

1. Створити `apps/web/tests/integration/cloudSync.split-brain.test.ts`:

   ```ts
   describe('CloudSync split-brain', () => {
     let server: TestServer;
     let clientA: TestClient;
     let clientB: TestClient;

     beforeEach(async () => {
       server = await startInMemoryServer();
       clientA = createClient(server.url, { userId: 'u1' });
       clientB = createClient(server.url, { userId: 'u1' });
     });

     it('idempotency: same op applied twice → single row', async () => { ... });
     it('ordering: A creates, B updates same id → final state preserves both fields', async () => { ... });
     it('tombstone wins: A deletes, B updates → row stays deleted', async () => { ... });
     it('no resurrection: A deletes, B creates with same id → no resurrection', async () => { ... });
     it('clock skew: client B clock 5min ahead → ordering still correct', async () => { ... });
     it('network flap: 50 ops, 10 fail with 5xx → all eventually applied', async () => { ... });
   });
   ```

2. Хай навіть 5–10 кейсів — їх відсутність сьогодні значно ризикованіша, ніж 100 unit-тестів `safeReadLS`.
3. Run on CI on every PR що змінює `apps/web/src/core/cloudSync/*` або `apps/server/src/routes/sync.ts`.
4. Додати **mutation testing** (Stryker) на цих модулях — це найкритичніше місце системи.

> **Tracker.** Завести issue з тегом `risk-data-loss` як умова для будь-якого major-релізу.

---

## 2.4 [Bad] `useCloudSync.ts` — 5-line barrel, але хук стрімить багато стану

**Що бачу.** `useCloudSync` повертає `{ migrationPending, syncing, syncErrorDetail, pushAll, pullAll, uploadLocalData, skipMigration }`. Це **7 значень** з одного хука. Сім — це багато, особливо якщо їх передавати далі prop-drill-ом у `HubHomeView` / `ActiveModuleView` / `useAppEffects`.

**Чому це проблема.**

- Кожен компонент, що читає `syncing`, ре-рендериться при зміні `pushAll` callback identity (якщо він не memoized з useCallback стабільно).
- API confused: «це read-only хук чи mutation?» — обидва.
- Тестування: важко мокати один аспект (тільки `syncing`) без всього іншого.

**Recommendation / fix points.**

1. Розбити на:
   - `useSyncStatus()` — read-only: `{ syncing, errorDetail, migrationPending }`.
   - `useSyncActions()` — write: `{ pushAll, pullAll, uploadLocalData, skipMigration }`.
2. Це дасть React Query-style separation і дозволить компонентам, які тільки відображають статус, не ре-рендеритись на кожен `pushAll`-callback identity change.
3. Контракт-тест: `useSyncStatus` НЕ викликає `useSyncActions` (через grep або static analysis).

---

## Прив'язка до roadmap (00-overview)

| Item у roadmap | Section тут |
| --- | --- |
| `tsconfig.strict: true` для `apps/web` поетапно | §1.0 |
| Provider-tree інваріант-тест | §1.1 |
| Routing — типобезпечний registry | §1.2 |
| `@deprecated_after` marker для sync v1 | §1.3 |
| `index.css` decomposition | §1.4 |
| `SERVER_ROLE=api|worker|all` + event-loop SLO | §1.6 |
| `localStorage` 17 → 0 codemod | §2.2 |
| CloudSync split-brain integration tests | §2.3 |
| `useCloudSync` split на read/write | §2.4 |

> **Tracker.** Кожен item після впровадження → `docs/tech-debt/frontend.md` (frontend-side) або `docs/tech-debt/backend.md` (server-side) з фіналізованим статусом.
