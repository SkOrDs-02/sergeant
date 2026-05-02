# Логування (Pino JSON + ALS + Sentry / Loki)

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

Цей документ описує **як** і **чому** бекенд Sergeant логує саме так, як
працює кореляція між Pino-логами, Sentry та Grafana Loki, і які антипатерни
слід уникати. Для метрик і алертів — див. [SLO.md](./SLO.md); для дій під час
інцидентів — [runbook.md](./runbook.md); для дашбордів — [dashboards.md](./dashboards.md).

---

## 1. Чому Pino JSON stdout

Railway, Loki і Grafana розбирають JSON-рядки з `stdout` без будь-якої
трансформації ([logger.ts:6-13](../../apps/server/src/obs/logger.ts#L6)).
Один рядок = один лог-запис, `service`, `env`, `release` додаються автоматично
у `base` ([logger.ts:54-61](../../apps/server/src/obs/logger.ts#L54)).

**Не використовуй `console.log`** у коді сервера — він не проходить через
Pino (нема redaction, нема ALS-полів, нема level). Єдиний виняток —
[`sentry.ts:62-68`](../../apps/server/src/sentry.ts#L62): `Sentry.init()`
виконується на рівні модуля ДО ініціалізації Pino (ESM depth-first evaluation),
тому лише там дозволено `console.log` з ручним `JSON.stringify`.

```jsonc
// Типовий рядок у Railway stdout
{
  "level": "info",
  "time": "2026-04-27T10:32:01.123Z",
  "service": "sergeant-api",
  "env": "production",
  "requestId": "a1b2c3d4-...",
  "userId": "usr_XYZ",
  "module": "finyk",
  "msg": "http",
  "method": "GET",
  "path": "/api/finyk/transactions",
  "status": 200,
  "ms": 42,
}
```

---

## 2. Автоматичні поля з AsyncLocalStorage

[`requestContext.ts`](../../apps/server/src/obs/requestContext.ts) зберігає
`AsyncLocalStorage<RequestContextStore>`. Pino `mixin()` зчитує контекст і
додає поля до **кожного** лог-запису, що виконується в рамках запиту
([logger.ts:70-78](../../apps/server/src/obs/logger.ts#L70)).

| Поле        | Хто встановлює                                                               | Коли                                                                 |
| ----------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `requestId` | [`requestIdMiddleware`](../../apps/server/src/http/requestId.ts) → ALS store | Перший middleware; клієнт може передати `X-Request-Id`               |
| `userId`    | [`setUserId()`](../../apps/server/src/obs/requestContext.ts#L41)             | Після auth (Better Auth session lookup)                              |
| `module`    | [`setRequestModule()`](../../apps/server/src/obs/requestContext.ts#L46)      | На початку route handler-а (`"finyk"`, `"nutrition"`, `"chat"` тощо) |

### Правильно vs Неправильно

```ts
// ✅ Правильно — module встановлюється один раз, далі будь-який logger-виклик
// у межах запиту автоматично включатиме requestId/userId/module.
import { setRequestModule } from "../obs/requestContext.js";
import { logger } from "../obs/logger.js";

router.post("/api/finyk/transactions", async (req, res) => {
  setRequestModule("finyk");
  // ... бізнес-логіка, яка викликає db-wrapper, AI тощо
  logger.info({ count: rows.length }, "transactions_fetched");
  res.json(rows);
});
```

```ts
// ❌ Неправильно — передавання req глибоко в бізнес-логіку
async function fetchTransactions(req: Request) {
  // req тягнеться крізь усі шари — coupling, тестувати складно
  logger.info({ requestId: req.requestId }, "fetching");
}
```

**Чому не треба передавати `req` у бізнес-логіку?** ALS дозволяє будь-якому
коду в межах запиту автоматично отримати контекст без явного параметра — менше
coupling, простіше тестувати.

---

## 3. Redaction-політика

Pino маскує значення на `[redacted]` для шляхів, визначених у
[`redactPaths`](../../apps/server/src/obs/logger.ts#L24) (22 елементи).
Логічне групування:

### Auth-заголовки

| Шлях                        | Чому                          |
| --------------------------- | ----------------------------- |
| `req.headers.authorization` | Bearer-токен Better Auth      |
| `req.headers.cookie`        | Session cookie                |
| `req.headers["x-api-key"]`  | API-ключ зовнішніх інтеграцій |
| `req.headers["x-token"]`    | Legacy-токен Monobank webhook |

### Secret-и / token-и

| Шлях              | Чому                                           |
| ----------------- | ---------------------------------------------- |
| `password`        | Реєстрація / зміна пароля                      |
| `newPassword`     | Форма зміни пароля                             |
| `currentPassword` | Форма зміни пароля                             |
| `token`           | Generic token (email verification, reset тощо) |
| `accessToken`     | OAuth / Better Auth access token               |
| `refreshToken`    | OAuth / Better Auth refresh token              |
| `idToken`         | OIDC id token                                  |
| `apiKey`          | Ключі інтеграцій (Mono, OpenAI тощо)           |
| `secret`          | Generic secret field                           |
| `clientSecret`    | OAuth client secret                            |

### PII (email / phone)

| Шлях         | Чому                                  |
| ------------ | ------------------------------------- |
| `email`      | Кореневий рівень                      |
| `phone`      | Кореневий рівень                      |
| `*.email`    | Wildcard — будь-який вкладений об'єкт |
| `*.phone`    | Wildcard — будь-який вкладений об'єкт |
| `user.email` | Об'єкт `user` з Better Auth           |
| `user.phone` | Об'єкт `user` з Better Auth           |
| `body.email` | Тіло запиту (реєстрація, профіль)     |
| `body.phone` | Тіло запиту (профіль, verification)   |

**Чому саме ці шляхи?** Вони покривають типову форму request/body у нашому
auth-стеку (Better Auth email+password, session cookie, Monobank webhook з
токенами) та user-об'єктах із PII.

### Як додати новий шлях

Додай рядок у масив `redactPaths` у
[`logger.ts:24-48`](../../apps/server/src/obs/logger.ts#L24). Pino використовує
[fast-redact](https://github.com/davidmarkclements/fast-redact) — підтримує
`*` (wildcard), вкладені шляхи через `.`, квадратні дужки для імен з дефісами.
Після додавання — перевір логи локально (`LOG_PRETTY=1`).

---

## 4. Серіалізація помилок

[`serializeError()`](../../apps/server/src/obs/logger.ts#L130) перетворює
`Error` у plain-об'єкт, безпечний для JSON. Головна фіча — рекурсивне
розгортання `err.cause` ланцюгів до `depth=4`.

### Приклад output-у (AppError → DbError → pg.Error)

```jsonc
{
  "name": "AppError",
  "message": "Failed to execute chat tool delete_transaction",
  "code": "EXTERNAL_SERVICE",
  "status": 502,
  "cause": {
    "name": "Error",
    "message": "Query failed: relation \"transactions\" does not exist",
    "code": "42P01",
    "cause": {
      "name": "error",
      "message": "relation \"transactions\" does not exist",
      "code": "42P01",
    },
  },
}
```

### `includeStack`

За замовчуванням `includeStack = false`. Стек додається у
[`errorHandler`](../../apps/server/src/http/errorHandler.ts#L56) для
`status >= 500` та у process-level hooks (`unhandledRejection`,
`uncaughtException`), де `level=fatal`.

---

## 5. Класифікація AppError

[`errors.ts`](../../apps/server/src/obs/errors.ts) визначає ієрархію помилок:

| Клас                   | Status | Code               | Kind          |
| ---------------------- | ------ | ------------------ | ------------- |
| `AppError`             | 500    | `INTERNAL`         | `operational` |
| `ValidationError`      | 400    | `VALIDATION`       | `operational` |
| `UnauthorizedError`    | 401    | `UNAUTHORIZED`     | `operational` |
| `ForbiddenError`       | 403    | `FORBIDDEN`        | `operational` |
| `NotFoundError`        | 404    | `NOT_FOUND`        | `operational` |
| `RateLimitError`       | 429    | `RATE_LIMIT`       | `operational` |
| `ExternalServiceError` | 502    | `EXTERNAL_SERVICE` | `operational` |
| _(все інше)_           | 500    | `INTERNAL`         | `programmer`  |

### Operational vs programmer

- **`operational`** — очікуваний сценарій (невалідний input, rate-limit,
  зовнішній сервіс недоступний). Логується на `warn`. **Не** надсилається в
  Sentry.
- **`programmer`** — неочікуваний баг (`TypeError`, `ECONNREFUSED` без
  обгортки, тощо). Логується на `error`. Відправляється в Sentry через
  `Sentry.captureException()`.

### Як кидати AppError

```ts
import {
  AppError,
  NotFoundError,
  ExternalServiceError,
} from "../obs/errors.js";
import { setRequestModule } from "../obs/requestContext.js";

// Простий 404
throw new NotFoundError("Transaction not found");

// 502 з cause (зберігає ланцюг для serializeError)
try {
  await monoApi.getTransactions(token);
} catch (err) {
  throw new ExternalServiceError("Monobank API unavailable", { cause: err });
}

// Кастомний код і статус
throw new AppError("AI quota exceeded", {
  status: 429,
  code: "AI_QUOTA",
  cause: originalErr,
});
```

### Метрика `app_errors_total`

[`errorHandler`](../../apps/server/src/http/errorHandler.ts#L38) інкрементує
лічильник з лейблами:

```
app_errors_total{kind="operational|programmer", status="4xx|5xx", code="...", module="..."}
```

Це дозволяє:

- **Алертинг**: `rate(app_errors_total{kind="programmer"}[5m]) > 0` — баги.
- **Дашборди**: розподіл `operational` помилок по модулю і коду — чи є
  аномальна хвиля `RATE_LIMIT` або `VALIDATION`.

---

## 6. Кореляція Sentry ↔ Pino ↔ Loki

Ключ кореляції — **`requestId`**. Він присутній у:

- Pino-логах (через ALS `mixin()`).
- Sentry events (через `beforeSend` у
  [`sentry.ts:36-46`](../../apps/server/src/sentry.ts#L36) як tag `requestId`).
- HTTP-відповіді (заголовок `X-Request-Id`).

### Розслідування інциденту: покроково

#### Сценарій A: починаємо з Sentry

1. Відкрий Sentry issue → скопіюй tag `requestId` (наприклад `a1b2c3d4-...`).
2. У Grafana Loki:
   ```
   {service="sergeant-api"} |= "a1b2c3d4"
   ```
   Або через Railway CLI:
   ```bash
   railway logs --filter 'requestId=a1b2c3d4'
   ```
3. У логах знайдеш повний `err.cause` ланцюг — корисно, якщо Sentry
   згрупував різні причини в одну issue.
4. Sentry також показує `module` і `userId` — для контексту, який модуль
   і юзер постраждав.

#### Сценарій B: починаємо з логів

1. У Loki знайшов `level=error` запис з `requestId=a1b2c3d4`.
2. Шукай Sentry event за тегом:
   ```
   requestId:a1b2c3d4
   ```
   У Sentry search bar (Issues → Search).
3. Sentry покаже stacktrace, breadcrumbs, release — додатковий контекст, якого
   нема в JSON-лозі.

#### Сценарій C: юзер надіслав requestId

Клієнт отримує `X-Request-Id` у відповіді. Якщо юзер повідомляє про помилку,
він може передати цей ID → шукай і в Sentry, і в Loki одночасно.

### Що потрапляє в Sentry

- `beforeSend` видаляє `request.data` (тіла — можуть містити фото / паролі) і
  `request.cookies` ([sentry.ts:33-34](../../apps/server/src/sentry.ts#L33)).
- `sendDefaultPii: false` — Sentry не збирає PII автоматично.
- ALS-контекст підмішується як tags (`requestId`, `module`) і `user.id`
  ([sentry.ts:36-46](../../apps/server/src/sentry.ts#L36)).
- Sentry-ініціалізація відбувається на рівні модуля (top-level ESM), щоб
  instrumentation express/http працювала
  ([sentry.ts:12-17](../../apps/server/src/sentry.ts#L12)).

### Діаграма потоку

```
Request → requestIdMiddleware (UUID)
       → withRequestContext (ALS store)
       → auth middleware → setUserId()
       → route handler → setRequestModule()
       → ...бізнес-логіка...
       → (помилка) → errorHandler
            ├─ logger.error({err: serializeError(err)})  → stdout → Loki
            ├─ Sentry.captureException(err)               → Sentry (з tags з ALS)
            └─ appErrorsTotal.inc({kind, status, code})   → Prometheus
```

---

## 7. Log-level-и у продакшні

| Level   | Коли                                                    | Приклади                                                         |
| ------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| `debug` | Вимкнено за замовчуванням. Тільки `LOG_LEVEL=debug` env | SQL-запити, ALS-контекст, cache hit/miss                         |
| `info`  | Нормальна робота — access log, бізнес-події             | `http` (access log), `sync_success`, `auth_success`, `push_sent` |
| `warn`  | Очікувані, але небажані сценарії                        | Rate-limit hit, payload trimmed, token expired                   |
| `error` | `AppError{kind=programmer}`, DB errors, AI parse errors | `request_failed` з `status >= 500`                               |
| `fatal` | Process-level hooks                                     | `unhandledRejection`, `uncaughtException`                        |

Рівень задається через `LOG_LEVEL` env ([logger.ts:17](../../apps/server/src/obs/logger.ts#L17)).
За замовчуванням: `info` у production, `debug` у development.

Access log генерується
[`requestLogMiddleware`](../../apps/server/src/http/requestLog.ts) — один
JSON-рядок на відповідь. Фільтрує `/health`, `/livez`, `/readyz` і `/assets/`
([requestLog.ts:26-34](../../apps/server/src/http/requestLog.ts#L26)).
Рівень лог-запису access log залежить від статусу:
`>=500` → `error`, `>=400` → `warn`, інакше `info`.

---

## 8. Dev-mode-поради

| Змінна       | Значення | Ефект                                                |
| ------------ | -------- | ---------------------------------------------------- |
| `LOG_PRETTY` | `1`      | Увімкнути `pino-pretty` — кольоровий людський формат |
| `LOG_LEVEL`  | `debug`  | Показувати debug-записи                              |

Додай у `.env.local`:

```env
LOG_PRETTY=1
LOG_LEVEL=debug
```

Pino-pretty **не** використовується в production — тільки JSON stdout
([logger.ts:79-84](../../apps/server/src/obs/logger.ts#L79)).

---

## 9. Антипатерни

### 9.1 `console.log` всередині route handler-а

```ts
// ❌ console.log не проходить через Pino — нема redaction, нема ALS-полів
console.log("Fetching transactions for", email);

// ✅ Використовуй logger
logger.info("transactions_fetch_start");
```

### 9.2 Ручне передавання `requestId`

```ts
// ❌ Дублює mixin — requestId уже автоматично додається з ALS
logger.info({ requestId: req.requestId }, "processing");

// ✅ Просто логуй — mixin додасть requestId, userId, module
logger.info("processing");
```

### 9.3 `logger.info(err)` замість `serializeError`

```ts
// ❌ Error-об'єкт не серіалізується коректно в JSON — втратиш cause chain
logger.info(err);

// ✅ Використовуй serializeError для повного cause chain
logger.error({ err: serializeError(err) }, "operation_failed");
```

### 9.4 Логування user input без redact

```ts
// ❌ Email потрапить у логи у відкритому вигляді, якщо поле не у redactPaths
logger.info({ userEmail: input.email }, "registration");

// ✅ Або додай шлях у redactPaths, або не логуй PII взагалі
logger.info("registration_started");
```

### 9.5 Логування у tight loop

```ts
// ❌ Кожна транзакція в batch — тисячі лог-рядків
for (const tx of transactions) {
  logger.info({ txId: tx.id }, "processing_tx");
  await processTx(tx);
}

// ✅ Aggregate count
const results = await Promise.all(transactions.map(processTx));
logger.info(
  { count: results.length, failed: results.filter((r) => !r.ok).length },
  "batch_processed",
);
```

---

## Дивись також

- [SLO.md](./SLO.md) — Service Level Objectives і burn-rate алерти.
- [runbook.md](./runbook.md) — дії під час інцидентів.
- [dashboards.md](./dashboards.md) — Grafana дашборди (Prometheus).
