# Playbook: Onboard External API

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Trigger:** "Інтегрувати нову зовнішню API" / додати новий third-party сервіс / нова банківська інтеграція / новий AI-провайдер.

---

## Steps

### 1. Створити HTTP-клієнт з resilience

Використовувати патерн з `apps/server/src/lib/bankProxy.ts`:

```ts
// apps/server/src/lib/<service>Client.ts
const client = {
  timeout: 15_000, // AbortController + Promise.race
  retry: {
    attempts: 3,
    backoff: "jitter", // exponential з jitter
    retryOn: [502, 503, 504, "ECONNRESET", "ETIMEDOUT"],
    respectRetryAfter: true,
  },
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30_000, // 30 секунд
  },
};
```

**Обов'язково:**

- **Timeout** — ніяких HTTP-запитів без timeout.
- **Retry з jitter** — для 5xx та network errors.
- **Circuit breaker** — per-origin, щоб один зламаний сервіс не каскадував.

### 2. Додати env vars

Додати необхідні credentials / config:

```bash
# .env.example — документація формату (без реальних значень!)
SERVICE_API_KEY=your-api-key-here
SERVICE_BASE_URL=https://api.example.com
```

Оновити:

- `.env.example` — з placeholder-ами
- Railway Variables — реальні значення
- CI secrets — якщо потрібні для тестів

### 3. Створити module в server

```
apps/server/src/modules/<service>/
├── types.ts          # TypeScript типи для API response
├── http/
│   ├── schemas.ts    # Zod-schemas для валідації
│   └── handlers.ts   # Express route handlers
├── connection.ts     # HTTP-клієнт зі step 1
└── <service>.test.ts # Тести
```

### 4. Prometheus metrics

Додати метрики для моніторингу зовнішнього сервісу:

```ts
// Використати існуючий паттерн
external_http_requests_total{upstream="<service>", status, outcome}
external_http_duration_ms{upstream="<service>"}
```

Outcome: `ok`, `timeout`, `rate_limited`, `circuit_open`, `error`.

### 5. Оновити `packages/api-client`

Додати client-side типи та endpoint functions (AGENTS.md rule #3):

```ts
// packages/api-client/src/endpoints/<service>.ts
export async function serviceEndpoint(params: Params): Promise<Response> {
  return httpClient.get("/api/<service>/...", { params });
}
```

### 6. Тести з MSW

Мокати зовнішню API через MSW (Mock Service Worker):

```ts
import { http, HttpResponse } from "msw";
import { server } from "../test/mswServer";

server.use(
  http.get("https://api.example.com/endpoint", () => {
    return HttpResponse.json({ data: "mocked" });
  }),
);
```

Тест-кейси:

- Happy path — API відповідає нормально.
- Timeout — API не відповідає протягом timeout.
- Rate limit (429) — retry з backoff.
- Server error (5xx) — retry, потім circuit breaker.

### 7. Health check

Додати перевірку зовнішнього сервісу у `/health` або окремий health-endpoint:

```ts
// Опціонально: GET /api/<service>/health
async function healthCheck() {
  try {
    await client.ping(); // lightweight request
    return { status: "ok" };
  } catch {
    return { status: "degraded", error: "..." };
  }
}
```

### 8. Створити PR

- Branch: `devin/<unix-ts>-feat-<service>-integration`
- Commit: `feat(server): integrate <service> API`
- PR description:
  - Що робить інтеграція
  - Які env vars потрібні (без реальних значень!)
  - Resilience: timeout, retry, circuit breaker параметри
  - Які метрики додано

---

## Verification

- [ ] `pnpm lint` — green
- [ ] `pnpm typecheck` — green
- [ ] Тести з MSW — green (happy path, timeout, rate-limit, 5xx)
- [ ] Timeout на всіх HTTP-запитах
- [ ] Circuit breaker конфігурований
- [ ] Prometheus metrics додано
- [ ] `.env.example` оновлено (без реальних secrets!)
- [ ] Типи в `packages/api-client` додані (rule #3)
- [ ] Railway Variables задокументовані

## Notes

- **Ніколи** не логувати API keys / tokens (навіть частково).
- Використовувати `ExternalServiceError` для помилок зовнішніх сервісів — вони потрапляють у Sentry з правильним тегом.
- Per-origin circuit breaker — різні upstream-и ізольовані (FCM, Apple Push, Monobank тощо).
- Для банківських API — додатково `Retry-After` header respect.

## See also

- [monobank-roadmap.md](../integrations/monobank-roadmap.md) — приклад повної Monobank-інтеграції
- [backend-tech-debt.md](../tech-debt/backend.md) — §Bank integrations deep-dive
- [railway-vercel.md](../integrations/railway-vercel.md) — як додати env vars у Railway
- [AGENTS.md](../../AGENTS.md) — rule #3 (API contract)
