# Playbook: Onboard External API

> **Last touched:** 2026-09-19 by @claude. **Next review:** 2027-01-06.
> **Status:** Active
> **Runtime-specific:** no

**Trigger:** "Інтегрувати нову зовнішню API" / додати новий third-party сервіс / нова банківська інтеграція / новий AI-провайдер.

## Owner surface

- Primary surface: `apps/server/src/lib`, `apps/server/src/modules/<integration>`
- Coupled surface: `packages/api-client`, `.env.example`
- Governing skill: `sergeant-server-api`

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
- Coolify app env (API) + Vercel env (web) — реальні значення; див. [`env-vars.md`](../../engineering/integrations/env-vars.md)
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
- **Схема поїхала** — відповідь валідна як HTTP, але не збігається зі знімком контракту.
- **Один битий рядок посеред сторінки** — решта сторінки має доїхати (див. § 7).

### 7. Дрейф контракту: вотчер, стійка пагінація, видима поломка

Кроки 1-6 лікують **транспорт** — сервіс не відповів, відповів 429, відповів 5xx.
Але зовнішній API ламається ще одним способом: він **відповідає успішно, а форма
відповіді змінилась**. Це тихо, і саме тому дорого. Чотири речі, яких вимагає
досвід інтеграції Сільпо:

**7.1. Знімок контракту в репо.** Тримай очікуваний перелік операцій/полів як
committed-снапшот і тест, що звіряє його з живою відповіддю. Без нього дрейф
виявляється лише як `logger.warn` із zod-помилкою, яку хтось має помітити.

**7.2. Стеля — з відповіді, не з константи.** Ліміти пагінації бери з того, що
віддає сервіс; захардкоджена стеля розходиться з реальністю мовчки.

**7.3. Битий рядок не обриває пагінацію.** Один непарсабельний елемент має бути
пропущений із записом у лог, а не завалити весь прохід — інакше одна аномалія в
даних постачальника коштує цілої синхронізації.

**7.4. Поломка має бути ВИДИМОЮ, а не лише успіх.** Логувати «синк завершився» —
недостатньо: тиша тоді означає і «все добре», і «poller не стартував», і їх не
відрізнити. Зберігай останню помилку підключення в БД і показуй її **у картці
інтеграції в налаштуваннях**, а не тільки в логах.

> Це та сама хвороба, що й у [`audit-ci-gates.md`](./audit-ci-gates.md): відсутність
> сигналу трактується як «все гаразд». Інтеграція, яка звітує лише про успіх,
> структурно не вміє сказати, що вона зламана.

### 8. Health check

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

### 9. Створити PR

- Branch: `<harness>/feat-<service>-integration`
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
- [ ] Тести з MSW — green (happy path, timeout, rate-limit, 5xx, дрейф схеми, битий рядок)
- [ ] Знімок контракту закомічений, тест на дрейф зелений
- [ ] Ліміт пагінації читається з відповіді, не з константи
- [ ] Поломка синку видима користувачу (картка інтеграції), не лише в логах
- [ ] Timeout на всіх HTTP-запитах
- [ ] Circuit breaker конфігурований
- [ ] Prometheus metrics додано
- [ ] `.env.example` оновлено (без реальних secrets!)
- [ ] Типи в `packages/api-client` додані (rule #3)
- [ ] Coolify/Vercel env vars задокументовані в `env-vars.md`

## Notes

- **Ніколи** не логувати API keys / tokens (навіть частково).
- Використовувати `ExternalServiceError` для помилок зовнішніх сервісів — вони потрапляють у Sentry з правильним тегом.
- Per-origin circuit breaker — різні upstream-и ізольовані (FCM, Apple Push, Monobank тощо).
- Для банківських API — додатково `Retry-After` header respect.

## See also

- [monobank-roadmap.md](../../engineering/integrations/monobank-roadmap.md) — приклад повної Monobank-інтеграції
- [backend-tech-debt.md](../../work/specs/tech-debt/backend.md) — §Bank integrations deep-dive
- [env-vars.md](../../engineering/integrations/env-vars.md) — канонічний реєстр env vars (Coolify + Vercel)
- [ADR-0074](../../governance/adr/0074-hosting-hetzner-coolify.md) — backend hosting (Coolify)
- [AGENTS.md](../../../AGENTS.md) — rule #3 (API contract)

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                                                                   | Merged     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| [#57](https://github.com/zaebal-beep/sergeant/pull/57) | fix(root): закрити знахідки наскрізного аудиту — валідація AI-шару, метрика конфліктів синку, браузерні дефекти         | 2026-09-16 |
| [#51](https://github.com/zaebal-beep/sergeant/pull/51) | docs(agents): пʼять нових playbook-ів під повторювані поломки і ревізія наявних                                         | 2026-09-15 |
| [#508](https://github.com/SkOrDs-02/sergeant/pull/508) | fix(docs): reconcile canonical docs with current repo                                                                   | 2026-07-29 |
| [#334](https://github.com/SkOrDs-02/sergeant/pull/334) | docs(root): reconcile docs with code after 2026-07-20 audit (Railway->Coolify, CI gates, dual-write, domain invariants) | 2026-07-21 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 4 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
