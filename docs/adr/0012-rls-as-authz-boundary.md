# ADR-0012: RLS як authz boundary — цільова модель, наразі app-enforced

- **Status:** proposed
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/server/src/http/requireSession.ts`](../../apps/server/src/http/requireSession.ts) — router-level middleware, `req.user`.
  - [`apps/server/src/modules/sync/sync.ts`](../../apps/server/src/modules/sync/sync.ts) — приклад `WHERE user_id = $1` layer.
  - [`apps/server/src/migrations/007_module_data_user_fk.sql`](../../apps/server/src/migrations/007_module_data_user_fk.sql) — FK до `"user"`, precondition для RLS.
  - [`docs/security/audit-exceptions.md`](../security/audit-exceptions.md) — поточні виключення.
  - ADR-0011 — local-first storage (server зберігає blob per user_id).

---

## 0. TL;DR

Sergeant поки що **не використовує** Postgres Row-Level Security (RLS).
Авторизація забезпечується на application layer: `requireSession()` middleware
витягує `user` з Better Auth, усі SQL-запити явно фільтрують
`WHERE user_id = $1`. Цей ADR фіксує:

1. **Чому RLS досі НЕ увімкнений** (trade-offs для MVP);
2. **Цільова модель** — RLS як primary authz-межа + app-layer як fallback;
3. **Міграційний шлях** і exit-criteria для переходу.

| Layer                 | Поточний стан                 | Цільовий стан                          |
| --------------------- | ----------------------------- | -------------------------------------- |
| Application (Express) | Primary authz (WHERE user_id) | Fallback + bulk/cross-user operations  |
| Database (Postgres)   | FK + UNIQUE constraints only  | RLS policies on all user-scoped tables |
| Session → DB context  | Explicit `user_id` у query    | `SET LOCAL app.current_user_id`        |

---

## ADR-12.1 — Поточний стан: app-enforced authz

### Status

accepted (operational reality, описує status quo).

### Context

Станом на 2026-04 усі user-scoped таблиці (`sync_module_data`, `mono_connection`,
`mono_account`, `mono_transaction`, `push_devices`, `ai_usage_daily`, тощо) мають
колонку `user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE`, FK увімкнений
(PR [#704](https://github.com/Skords-01/Sergeant/issues/704), міграція
`007_module_data_user_fk.sql`). **Але RLS вимкнений на всіх таблицях**:

```sql
-- НЕМАЄ таких statements у жодній міграції:
-- ALTER TABLE xxx ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY xxx ON xxx USING (user_id = current_setting('app.user_id'));
```

Авторизація виконується **виключно** на application layer:

1. Every `/api/v1/*` route (крім auth, health, webhook) проходить через
   `requireSession()` middleware
   ([`apps/server/src/http/requireSession.ts`](../../apps/server/src/http/requireSession.ts))
   → Better Auth резолвить сесію у `req.user`.
2. SQL-запити **вручну** додають `WHERE user_id = $1`, passing `req.user.id`.

### Decision

На MVP — **продовжуємо app-enforced authz** без RLS. Ризик, який приймаємо:
якщо розробник забуде `WHERE user_id = $1` у новому SQL, юзери побачать чужі
дані. Мітігація:

1. Code-review як primary захист.
2. Integration-тест `sync.test.ts` перевіряє крос-юзер isolation для sync.
3. Hard rule #1 у [`AGENTS.md`](../../AGENTS.md) підкреслює важливість user-scoped
   queries і snapshot-тестів, що лочать shape responses.

### Consequences

**Позитивні:**

- Швидкість розробки — звичний SQL без `SET LOCAL` у кожному запиті.
- Немає per-connection overhead від RLS policy evaluation (хоча у реальності
  overhead малий — див. Supabase benchmarks).
- Testcontainers тести прозорі — не треба mock-ати сесійний контекст.

**Негативні:**

- **Один забутий `WHERE`** = data leak. Реальний прецедент був у
  [#788](https://github.com/Skords-01/Sergeant/issues/788) (закритий) де один
  юзер міг move-фонди на чужий акаунт через AI-tool; root cause — `WHERE`
  пропустили в handler. Fix зайняв 2 дні + hot-patch.
- **AI tools ризиковані** — Anthropic-tool runtime дозволяє моделі генерувати
  SQL-параметри; без RLS це потенційна атака "ignore previous, select from
  everyone's data" (prompt-injection), якщо tool-handler приймає `user_id`
  як параметр замість читати з `req.user`.
- **Developer discipline-залежне** — нова людина в команді ризикує забути
  конвенцію.

### Exit criteria

Поточний стан переходить у `superseded` коли:

1. RLS увімкнений на всіх user-scoped таблицях.
2. Sessionкон`->` DB context мапінг реалізований.
3. Regression-тести на крос-юзер ізоляцію покривають усі routes (кожен
   module-test має case "user A не бачить data user-а B").

---

## ADR-12.2 — Цільова модель: RLS як primary, app як fallback

### Status

proposed.

### Context

RLS у Postgres дозволяє ввімкнути policies на рівні таблиці, які автоматично
додають `WHERE`-умови до SELECT/UPDATE/DELETE (і `WITH CHECK` для INSERT):

```sql
ALTER TABLE sync_module_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_rows_read" ON sync_module_data
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY "own_rows_write" ON sync_module_data
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', TRUE))
  WITH CHECK (user_id = current_setting('app.current_user_id', TRUE));
```

Application-код встановлює контекст у транзакції:

```ts
await pool.query("SET LOCAL app.current_user_id = $1", [req.user.id]);
// тепер навіть якщо SQL забув WHERE user_id = $1,
// RLS автоматично відфільтрує.
```

### Decision

**Цільова модель:**

1. RLS policies на всіх user-scoped таблицях — `FOR ALL USING user_id = current_setting(...)`.
2. Middleware `withUserContext(req, fn)` обгортає кожен handler у `BEGIN ... SET LOCAL ... COMMIT`
   — гарантує, що будь-який SQL у межах транзакції бачить лише рядки юзера.
3. Super-user / admin операції (cron-и, webhook-и від Stripe/Monobank) йдуть
   через окремого DB role-а (`service_role`) з `BYPASSRLS` — НЕ через
   user-context.
4. `SECURITY DEFINER` функції залишаються hookable через Postgres functions,
   не через superuser escalation у app-коді.

App-layer WHERE-філтри залишаються як **defense in depth**:

```ts
// RLS автоматично обмежить до юзера, АЛЕ ми все одно пишемо
// `WHERE user_id = $1` — читається як "intent", і працює навіть
// коли RLS тимчасово вимкнений (dev/test).
const rows = await client.query(
  "SELECT * FROM sync_module_data WHERE user_id = $1 AND module = $2",
  [req.user.id, module],
);
```

### Consequences

**Позитивні:**

- Data leak рівня "забув WHERE" — **неможливий**. Навіть `SELECT * FROM users`
  у handler-і юзера верне лише один row.
- AI tools — безпечні by default. Tool-handler може свідомо accept-ити
  `user_id` як параметр, але RLS перевірить contract-у level-у БД.
- Audit-trail простіше — policy definition у БД є source of truth про те,
  хто що може читати, замість розпорошеного app-коду.

**Негативні:**

- **Performance overhead** — на великих SELECT-ах RLS policy evaluation
  додає ~5-15% CPU (за Supabase benchmarks). Для наших масштабів — < 1ms, але
  треба міряти.
- **Connection-level state** — `SET LOCAL` працює тільки у транзакції. Якщо
  handler не відкриває tx, треба інший шлях (напр. `SET` + pool.release
  - pool.connect, але це ризикує leak state у наступний handler). Чіткий
    pattern через `withUserContext()` wrapper критичний.
- **Testcontainers** — тести повинні виставляти контекст або використовувати
  service_role для setup-у. Трохи ускладнить fixture-setup.
- **Migration-складність** — треба мігрувати **всі** user-scoped таблиці
  одночасно (послідовно вмикати ризиковано; легше feature-flag-ом
  `ENABLE_RLS=1`).

### Alternatives considered

- **Supabase-style full RLS** (вивантажити authn у Postgres + JWT claims).
  Відкинуто — у нас Better Auth + кастомна session layer; переходити на
  Supabase Auth — велика переробка, не виправдовує.
- **Row-level authz у ORM** (Prisma middleware). У нас `pg` driver raw SQL,
  ORM немає. Додавати ORM заради authz — overkill.
- **CASL / oso policy engines.** App-layer permission rules. Дають гранулярність
  (read/write/delete за полем), але **не захищають від забутого WHERE**.
  Complementary, не substitute.

### Exit criteria

Перехід до `accepted` (реалізація) — коли виконані:

1. [ ] `service_role` DB user створений з `BYPASSRLS`.
2. [ ] `withUserContext(req, fn)` wrapper написаний, покритий тестами.
3. [ ] RLS policy на першому модулі (candidate: `sync_module_data`, бо ADR-0011
       покриває більшість даних).
4. [ ] Integration-тест "user B не бачить sync data user-а A через RLS" —
       зелений з `ENABLE_RLS=1`.
5. [ ] Post-deploy моніторинг latency — немає regression > 5% p95.

---

## ADR-12.3 — Міграційна стратегія: feature-flag, module-by-module

### Status

proposed.

### Context

"Big bang" RLS migration — ризик bricked deploy (забутий `SET LOCAL` у якомусь
handler-і → 0 rows returned → продакшн-инцидент).

### Decision

**Послідовна міграція з feature-flag:**

1. **Фаза 1 — інфраструктура.** `withUserContext()` wrapper + `service_role`
   user + `ENABLE_RLS` env flag. Без реального RLS (дефолт `0`, no-op).
2. **Фаза 2 — один модуль (pilot).** Вмикаємо RLS на `sync_module_data`
   (найбільший user-scoped stream). Всі інші таблиці — без RLS. Моніторимо
   2 тижні.
3. **Фаза 3 — решта.** Міграція інших таблиць по черзі: `push_devices` →
   `mono_*` → `ai_usage_daily` → будь-що нове. Кожна міграція — окремий PR.
4. **Фаза 4 — regression-тести й remove flag.** Всі таблиці під RLS, `ENABLE_RLS=1`
   за замовчуванням, WHERE-філтри лишаються як defense in depth.

### Consequences

**Позитивні:**

- Reversible — якщо pilot провалиться, flip flag за 30s без rollback міграції.
- Кожна фаза — окремий PR, окремий review-сайкл, окремі метрики.

**Негативні:**

- Розтягнутий migration timeline (2-4 тижні мінімум).
- Складніші тести — треба покривати `ENABLE_RLS=0` і `=1` випадки паралельно,
  поки flag живий.

### Exit criteria

Фаза 4 завершена коли RLS увімкнений на всіх user-scoped таблицях та видалено
flag з коду.

---

## ADR-12.4 — Не-цілі

### Status

accepted.

### Decision

Цей ADR **не покриває**:

- **Column-level security** (mask PII у SELECT-ах). Не потрібно для нашої
  моделі — юзер бачить тільки свої дані, PII-mask в self-view не має сенсу.
- **Attribute-based access control** (family plans, shared accounts). TBD ADR
  (TBD) окремо — family-plans потребують shared state і multi-user read
  semantics, які виходять за рамки "own rows only".
- **Audit-logging DB actions.** Окремий ADR — audit-log для dispute/support
  flow (ADR-0003).
- **Schema-level isolation** (tenant-per-schema). Ми single-tenant personal app,
  не SaaS.

---

## Open questions

1. **`service_role` management.** Хто володіє цими credentials? Один-мейнтейнер
   зараз, але на scale треба vault (Railway env vars? 1Password?).
2. **Webhook routes (Stripe, Monobank).** Ці endpoint-и не мають
   `req.user` — вони пишуть у таблиці чужих юзерів. Варіанти: (a) webhook резолвить
   `user_id` з payload і одразу переходить у `withUserContext(userId, ...)`;
   (b) використовує `service_role` bypass. Treba узгодити до Фази 2.
3. **RLS policy для join-ів.** Якщо таблиця A (RLS on) join-иться з таблицею B
   (RLS off), policy A обмежить rows у result-сеті, але B може leak-ити через
   aggregate queries. Треба consistent-applying policies; якщо якась таблиця
   system-level (`ai_usage_global` для A/B тестів), окрема policy.
4. **Читання metric-аггрегатів.** Prometheus queries типу "скільки транзакцій
   у всіх юзерів за день" виконуються або через `service_role`, або через
   попередньо агреговані таблиці без user_id. Не заплутатись.

---

## Implementation tracker

| Arte-fact                                             | Статус              |
| ----------------------------------------------------- | ------------------- |
| FK `user_id → "user".id` на всіх user-scoped таблицях | live                |
| `requireSession()` middleware                         | live                |
| App-layer `WHERE user_id = $1` як конвенція           | live                |
| `withUserContext()` wrapper                           | TBD                 |
| `service_role` DB user                                | TBD                 |
| RLS policy на `sync_module_data` (pilot)              | TBD                 |
| RLS policy на решті user-scoped таблиць               | TBD                 |
| Regression-тести cross-user isolation                 | partial (sync-only) |
