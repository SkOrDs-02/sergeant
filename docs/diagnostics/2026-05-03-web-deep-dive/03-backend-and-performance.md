# Web deep-dive — Backend, API & performance

> **Last validated:** 2026-05-03 by @Skords-01.
> **Status:** Active
> **Scope:** Express factory, request validation, route registry, error handling + `requestId`, rate limiting, graceful shutdown, OpenAPI / typed client drift, Vite chunking, lazy module FCP, Service Worker reminder loop.
> **Related:** [`00-overview.md`](./00-overview.md), `docs/architecture/`, `docs/audits/2026-04-28-implementation-roadmap.md`.

Бекенд — найсильніша частина проєкту: factory `createApp`, granular auth-guards, graceful shutdown з hard timer. Слабкі точки — у contract-шарі (web↔server) і у performance-нюансах (lazy chunks, SW dedup-prune). Ось точкова прожарка.

---

## 4.1 [Good] Body-size policy granular per-route

**Що бачу.** Express body-parser сконфігуровано з default `128kb`, плюс точкові підняття для `/analyze-photo` (фото в base64), `/backup-upload`, `/sync` (батчі op-log v2). Це **рідкість і це правильно**: глобальний `1mb` — типова дірка для DoS через repeated big-bodies; per-route — best practice.

**Recommendation (підтримати, не змінювати).**

- Тест-snapshot «всі route-и з підвищеним лімітом» → щоб додавання нового без перевірки не пройшло code review.
- Документувати у `docs/api/body-size-limits.md` з обґрунтуванням кожного.

---

## 4.2 [Bad] `validateBody` повертає sentinel, не throw

**Що бачу.** `apps/server/src/http/validate.ts:21-40`:

```ts
const parsed = validateBody(schema, req, res);
if (!parsed.ok) return;
const { foo } = parsed.data;
```

**Чому це працює.** `validateBody` сам відправляє 400-відповідь через `res`, якщо schema не проходить. Handler просто ранньо виходить.

**Чому це крихке.**

- Кожен handler має пам'ятати `if (!parsed.ok) return;`. **Забудеш — і зробиш 200 з невалідним body** (race з `res.headersSent`).
- TypeScript narrow робить це через discriminated union — OK, але **linter-у це не видно**.
- Жоден тест не ловить «handler без `if (!parsed.ok) return`» — це silent foot-gun.

**Recommendation / fix points.**

**Варіант A (cheaper, less invasive).**

Додати **ESLint custom rule** через `sergeant-design`-plugin: «`validateBody`/`validateQuery` must be followed by `if (!parsed.ok) return`». Це pattern-rule, ~30 LOC, AST-matching.

**Варіант B (cleaner, more invasive).**

Зробити `validateBody` таким, що **кидає** `BadRequestError`:

```ts
const { foo } = await validateBody(schema, req); // throws BadRequestError
```

Тоді `errorHandler` сам повертає 400 з `details`. Handler стає лаконічним. Це коротше, але потребує переписування **всіх ~244 файлів сервера**.

**План.**

1. Зараз — варіант A (1 PR, безпечний).
2. При наступному великому subset-redesign-ові (наприклад, OpenAPI generation у §4.7) — варіант B як side-effect.

---

## 4.3 [Bad] Routes registered without prefix — order-sensitive globbing

**Що бачу.** `apps/server/src/routes/index.ts:32-53` — кожен `createXxxRouter()` mounted на `app.use(router)` без `'/api/xxx'` prefix-у. Робиться це навмисно (читай файли — кожен router сам знає свій prefix). Але:

- **Шанс зіткнення в майбутньому**, якщо хтось додасть catch-all `app.get('*', ...)`.
- **Жодного теста**, який перевірив би, що registration order не впливає на behavior (наприклад, `internal` стоїть першим — це коментується, але не тестується).
- Стандартні тулчейни (Swagger / OpenAPI auto-gen) погано працюють з таким патерном — вони очікують декларативний registry.

**Recommendation / fix points.**

1. Додати **endpoint-registry test**: snapshot `app._router.stack` → порівнюємо з ожиданим. Будь-яка змінa у порядку всплине у diff.

   ```ts
   it('routes registry — order matches snapshot', async () => {
     const app = createApp();
     const stack = app._router.stack
       .filter(l => l.route)
       .map(l => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
     expect(stack).toMatchSnapshot();
   });
   ```

2. Розглянути генерацію OpenAPI specа з `zod-to-openapi` (схеми вже є) — це дасть auto-doc-у `docs/api/openapi.yaml` + типобезпечний клієнт.
3. Додати lint-rule «новий `app.use(router)` тільки через factory `registerRoute()`», який автоматично додає у registry.

> **Tracker.** Зв'язано з §4.7 (OpenAPI). Треба робити одним milestone-ом.

---

## 4.4 [Good, але underused] `errorHandler` з `requestId` у відповіді

**Що бачу.** `apps/server/src/http/errorHandler.ts:72-88` — `requestId` повертається в JSON body, що дозволяє юзеру вставити його в support-ticket.

**Дуже добре.** Це класична observability-фіча, яку забувають у 80% проєктів. Але тут — **underused**:

- Я не бачу, де саме на фронті ми **показуємо** `requestId` юзеру при 500. Якщо немає — це fix one-liner: у toast «Помилка. ID запиту: abc-123 (можна надіслати в підтримку)».
- Sentry-event ідентифікатор НЕ корелюється з `requestId`. У Sentry dashboard зараз треба шукати «приблизно за часом» — це некомфортно.

**Recommendation / fix points.**

1. У `requestIdMiddleware`:

   ```ts
   import * as Sentry from '@sentry/node';
   Sentry.getCurrentScope().setTag('requestId', req.requestId);
   ```

   Тоді в Sentry filter `requestId:abc-123` миттєво знаходить event.

2. На фронті — у Toast при 5xx:

   ```tsx
   toast.error(
     <>
       Помилка сервера. ID запиту: <code>{requestId}</code>
       <Button onClick={() => navigator.clipboard.writeText(requestId)}>Скопіювати</Button>
     </>,
     { duration: 0 } // sticky
   );
   ```

3. У ErrorBoundary логувати `requestId` як `extra` для Sentry events на фронті.
4. Документ `docs/observability/requestId-correlation.md` з прикладом «як знайти ту саму помилку у Sentry, у server logs, і у user report».

**Cost.** ~1 година, найнижча ціна серед всіх fix points.

---

## 4.5 [Bad] Rate limiter — per-module budget, але без єдиного «cost-model»

**Що бачу.** `apps/server/src/http/rateLimit.ts` (~249 рядків) робить per-module, per-user/IP buckets. Це сильно. Але:

- AI-стрім (chat) одна відповідь може коштувати 30s + 50KB tokens. Один такий запит у 60-rpm bucket — еквівалент 60-ти «get profile»-запитів.
- Нема `cost`-multiplier (схоже на `AI_QUOTA_TOOL_COST` у env, але це інший шар — quota, не rate).

**Чому це проблема.** Юзер з повільним з'єднанням, який ретраїть chat 5 разів — фактично використовує 5×30s × 50KB. Сервер бачить «5 запитів» — у межах rate. Ресурс по факту з'їдено набагато більше.

**Recommendation / fix points.**

1. Додати у rate-limiter **optional `cost(req): number`** функцію per-module. Для chat:

   ```ts
   cost: (req) => 1 + Math.ceil(req.body.prompt?.length / 1024),
   ```

2. Алертати за метрикою `rate_limit_p95_consumed_per_user` — якщо хтось систематично з'їдає budget.
3. Документувати cost-model у `docs/api/rate-limiting.md`. Кожен новий module автоматично починає з `cost=1`, але важкі — мають explicit override.
4. Reuse той самий `cost`-multiplier для квот (AI usage caps).

---

## 4.6 [Good] Graceful shutdown з hard timeout

**Що бачу.** `shutdown(reason, exitCode)` робить все правильно:

1. `server.close()`
2. workers `close()`
3. `pool.end()`
4. `redis.disconnect()`
5. `Sentry.flush(2000)`

**Дрібниця.** У блоці catch для `Sentry.flush` коментар каже «не має блокувати shutdown», але немає `Promise.race` з timeout. Якщо `Sentry.flush(2000)` сам по собі зависне (бо transport drop'ed) — `process.exit` все одно відпрацює завдяки `hardTimer`. **OK, але я б цей invariant засвітив тестом.**

**Recommendation / fix points.**

1. Додати тест:

   ```ts
   it('shutdown completes even if Sentry.flush hangs forever', async () => {
     mockSentryFlush(() => new Promise(() => {})); // never resolves
     const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});
     await shutdown('test', 0);
     expect(exit).toHaveBeenCalledWithin(3000); // hardTimer = 3s
   });
   ```

2. Документувати у `docs/operations/shutdown.md` шкалу latency: «Total shutdown ≤ hardTimer (5s default), guaranteed».

---

## 4.7 [Bad] No OpenAPI / no typed client between web↔server

**Що бачу.** `packages/api-client` — **typed HTTP client** (з `STABILIZE` у audit.md), але я не побачив, щоб він автогенерувався з server-схем. Тобто схеми `zod` живуть на сервері, схеми типів — на клієнті, і вони **синхронізуються вручну**.

**Чому це дороге.** Це **легке джерело drift-у:** додав поле в zod schema, забув продивитись `apiClient.ts`, фронт парсить старий тип → undefined-and-crash на runtime.

Класичний bug-pattern, який ловиться тільки в production.

**Recommendation / fix points.**

1. **Етап 1 (1 тиждень).** Винести zod-schemas у `packages/shared/api-schemas` (частина вже там) і **імпортувати** на обох сторонах. Це SSOT для shapes, без OpenAPI-generation.
2. **Етап 2 (2 тижні).** Згенерувати `packages/api-client` з OpenAPI:
   - `zod-to-openapi` на сервері — генерує `docs/api/openapi.yaml` як build artifact.
   - `openapi-typescript` (або `openapi-fetch`) на клієнті — генерує типобезпечний клієнт.
   - CI-крок: «після build server → run openapi.yaml diff → fail if drift».
3. **Етап 3 (1 тиждень).** Contract tests web↔server — детально у `04-security-observability-testing-devx.md` §7.4.
4. **Side-effect.** Можна викинути `validateBody`-sentinel pattern (§4.2) на користь throw-based (бо тепер у нас є типобезпечний контракт).

> **Tracker.** Винести у `docs/audits/2026-04-28-implementation-roadmap.md` як новий Stage. Це найважче з усіх 18 roadmap-items, але одне з найвищих impact-ів.

---

## 5.1 [Good] Vite manual chunk splitting

**Що бачу.** Стратегія розбиття чанків продумана. Vendor + per-module chunks. Але без точкового бенчмарку складно сказати, чи `react-vendor` chunk не «розпух».

**Recommendation / fix points.**

1. Раз на квартал прогнати `vite-bundle-visualizer` і додати artifact в CI (`pnpm build && pnpm bundle-stats`).
2. Запровадити budget per-chunk через `size-limit`:

   ```json
   "size-limit": [
     { "path": "apps/web/dist/assets/react-vendor-*.js", "limit": "150 KB" },
     { "path": "apps/web/dist/assets/finyk-*.js", "limit": "80 KB" },
     { "path": "apps/web/dist/assets/index-*.js", "limit": "60 KB" }
   ]
   ```

3. Перевірити, чи `size-limit` уже покриває **per-route** chunks, а не тільки vendor.
4. Документувати baseline у `docs/performance/bundle-budget.md` з SLA «не більше +5% за квартал без явного PR».

---

## 5.2 [Bad] Великі lazy-loaded модулі = довгий FCP при first module open

**Що бачу.** `ActiveModuleView` лазить `FinykApp` / `FizrukApp` / `RoutineApp` / `NutritionApp`. Це правильно, code-splitting працює. Але:

- При першому переході в, скажімо, `FinykApp`, користувач отримує white-flash до моменту, коли chunk завантажиться + js-парс + render. На 3G це 1-2 секунди.
- Skeleton під час `Suspense fallback` — це OK, але чи робимо `<link rel="prefetch" href="/finyk-chunk.js">` при hover на «Финик» tab? **Не бачу — варто.**

**Recommendation / fix points.**

1. Module prefetch on hover у `HubHomeView`:

   ```tsx
   <Tab
     onMouseEnter={() => prefetchChunk('finyk')}
     onTouchStart={() => prefetchChunk('finyk')}
     onClick={() => navigate('/hub/finyk')}
   />
   ```

   `prefetchChunk` ставить `<link rel="prefetch">` динамічно і запам'ятовує, що вже зроблено.

2. У `useAppEffects` (idle prefetch): якщо `requestIdleCallback` поспів і `navigator.connection.effectiveType === '4g'`, prefetch chunk-и активних модулів за останні 7 днів:

   ```ts
   const recent = getRecentlyOpenedModules(7);
   requestIdleCallback(() => recent.forEach(prefetchChunk));
   ```

3. Гард на slow-connection: `if (navigator.connection?.saveData) return;` — не марнуємо bandwidth у power-saver mode.
4. Метрика: `module.first_open.duration_ms` (з/без prefetch) — порівняти, чи реально дає effect.

**Cost / impact.** ~1 день роботи, відчутний effect на first-time-open модулів — це топ-pattern для PWA з code-splitting.

---

## 5.3 [Bad] Service Worker: `notifiedKeys` Set без bounded prune під вечірні часові пояси

**Що бачу.** `apps/web/src/sw.ts:253-269` — prune за `_${currentDk}` працює (видаляє ключі з відмінним `dayKey`). Але:

- DST changes (Україна не використовує, але туристи / iOS налаштування — використовують). При зміні TZ `todayKey()` стрибає → старий dedup-ключ застряг.
- Юзер change-нув часовий пояс на телефоні → той самий ефект.
- Browser може довго не давати SW активуватися → `notifiedKeys` IDB росте без prune.

**Recommendation / fix points.**

1. Додати soft cap:

   ```ts
   if (notifiedKeys.size > 1000) {
     // зберегти timestamp у IDB як value, drop oldest
   }
   ```

2. Зберегти `key → timestamp` у IDB замість `key → 1`. Це дає TTL prune як bonus.
3. Тест на DST cross-over (ручний — тести SW часто непрактичні автоматизувати):
   - System TZ → Europe/Kyiv;
   - Створити reminder, ack;
   - System TZ → America/New_York;
   - Створити reminder з тим самим logical id;
   - Перевірити, що повторно не fire-иться.

---

## 5.4 [Bad] Reminder loop у SW — wakelock на кожну хвилину

**Що бачу.** `scheduleNextCheck` ставить timer до наступної хвилини, потім recursively scheduleNextCheck. Це нормально, але:

- При закритій вкладці SW може йти у idle. Browser убиває SW через ~30s. Наступний reminder не спрацює, поки користувач не повернеться.
- Це чесний trade-off (не Push API), але **варто документально засвітити**.
- Якщо `usePushNotifications` уже є — reminder-cycle у SW дублює функцію Web Push для тих самих модулів. Перевір, **чи нема double-fire** (юзер увімкнув і Web Push, і local reminders).

**Recommendation / fix points.**

1. Документ `docs/architecture/notifications.md`:
   > **Local reminders (SW timer):** in-foreground only, для guaranteed delivery — Web Push.
2. Перевірити dedup logic: якщо для того самого `key` push прийшов І local-fire спрацював — show тільки once.
3. Винести `createReminderHandler({ key, condition, render })` factory з повторюваною логікою (`routine`/`fizruk`/`nutrition` дубують код один одного — див. `10.1` нижче).

---

## 10.1 [Bad] `apps/web/src/sw.ts` — 644 LOC

SW теж потрапив у «великі файли». `routine` / `fizruk` / `nutrition` reminder logic схожі один на одного.

**Recommendation.** Винеси `createReminderHandler({ key, condition, render })` factory; кожен модуль регіструє свій. Цільовий розмір `sw.ts` — ~250 LOC (registration + utilities).

---

## 10.3 [Bad] `ChatRequestSchema` — «50 messages × 8KB» = 400KB context per request

**Що бачу.** Коментар у schema каже «50 × 8KB = 400KB max». Limit достатній, але кожен request — це 400KB + tools.

**Recommendation.**

- Перевірити RPS × payload = bandwidth. Якщо chat-RPS значущий, варто стискати у gzip-stream (Express compress middleware) або base64 → bytes (якщо non-text content).
- Метрика `chat.request.body_bytes_p95` — щоб не пропустити, якщо UI колись почне додавати ще більше контексту.

---

## 10.4 [Mixed] `processIdle prefetch` у `useAppEffects` — без перевірки connection

**Що бачу.** Не бачу, що prefetch-ить тільки на швидкому з'єднанні (`navigator.connection`).

**Recommendation.** Додай гард:

```ts
if (navigator.connection?.saveData) return;
if (navigator.connection?.effectiveType !== '4g') return;
```

Це частина того ж fix-у, що §5.2.

---

## Прив'язка до roadmap (00-overview)

| Item у roadmap | Section тут |
| --- | --- |
| Sentry tag `requestId` + UI shows requestId on 5xx | §4.4 |
| Routes registry test | §4.3 |
| OpenAPI generation + typed client | §4.7 |
| Rate-limiter `cost`-multiplier | §4.5 |
| Module prefetch on hover + on-idle | §5.2 |
| Per-route bundle budget (size-limit) | §5.1 |
| SW `notifiedKeys` TTL prune | §5.3 |
| `createReminderHandler` factory | §5.4 / §10.1 |

> **Tracker hook.** Перформанс-частина (§5.x) добре лягає у `docs/performance/web-budget.md`. Backend-частина — у `docs/api/`. Спостережуваність (`requestId`) пов'язана з `04-security-observability-testing-devx.md` §6.5.
