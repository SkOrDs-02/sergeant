# PR-02: Rate-limit fail-closed на `/api/auth/*`

> **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
> **Status:** Closed — merged [#1552](https://github.com/Skords-01/Sergeant/pull/1552)

|              |                                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| **Severity** | Critical (C2)                                                                     |
| **Owner**    | TBD                                                                               |
| **Effort**   | 1 день                                                                            |
| **Risk**     | Medium (зміна error-mode для Redis-disconnect = можливі false-positive 503-и)     |
| **Touches**  | `apps/server/src/http/rateLimit.ts`, `apps/server/src/middleware/`, observability |

## Контекст

> **Update 2026-05-06:** цей PR-план закрито через [#1552](https://github.com/Skords-01/Sergeant/pull/1552). Файл лишається historical record; подальші Redis/Testcontainers follow-up-и мають відкриватися як новий hardening PR, а не як продовження PR-02.

```ts
// apps/server/src/http/rateLimit.ts:207–219
if (redis) {
  try { rl = await checkRateLimitRedis(...); }
  catch { rl = checkRateLimit(...); } // ← per-process fallback
}
```

При відмові Redis (TLS handshake fail, restart, ZNOEXEC, network partition) middleware silently fall-back-ає на in-memory bucket. Наслідки:

- На Railway з `replicas > 1` (або під час deploy: blue+green одночасно) кожен процес тримає **власний** Map → ефективний ліміт `N×limit`.
- `AUTH_RATE_LIMIT_MAX=5 / 900s` (auth endpoint) при 3 replicas → реальний ліміт **15 / 900s**. Брутфорс прискорюється у 3×.
- Лише `logger.warn` без alert-у — degradation мовчить.

## Scope

1. **Per-route fail-mode policy:**
   - Security-критичні маршрути (`/api/auth/*`, `/api/account/recovery`) — **fail-closed**: при Redis-error повертати `503 service-unavailable` з `Retry-After`.
   - Інші маршрути — лишити fail-open (in-memory fallback) бо там вищий cost-of-blocking.
2. **Спостережуваність:**
   - Pino metric `rate_limit_redis_fallback_count` (counter) + `rate_limit_redis_fallback_duration_ms` (histogram).
   - Sentry tag `rate_limit.mode = redis | inmem | unavailable`.
   - Alert у `docs/observability/alerts.md`: «Fallback active >5 min на security-route».
3. **Документація:**
   - `docs/security/rate-limit-failure-mode.md` — як саме fail-closed себе поводить, які маршрути захищені.
   - Розглянути `@upstash/ratelimit-js` або переїзд на edge-rate-limit перед сервером (як ADR, не цей PR).

## Out of scope

- Перехід на edge rate-limit (Vercel Edge / Cloudflare Workers) — окремий ADR.
- Зміна базового `AUTH_RATE_LIMIT_MAX` — окремий security review.

## Acceptance criteria (DoD)

- [ ] `apps/server/src/http/rateLimit.ts` приймає `failMode: 'open' | 'closed'` як параметр.
- [ ] `app.use("/api/auth/*", rateLimitMiddleware({ failMode: 'closed' }))` явно у `routes/index.ts`.
- [ ] Тест: симулюємо Redis-error → 503 на `/api/auth/sign-in`, не 200/429.
- [ ] Тест: симулюємо Redis-error → fallback (200) на `/api/health` чи інших non-security routes.
- [ ] Pino-метрика `rate_limit_redis_fallback_count` пишеться у логи.
- [ ] `docs/security/rate-limit-failure-mode.md` створений з threat-моделлю.

## Тести

- **Unit:** `apps/server/src/http/rateLimit.test.ts` — describe-block `rateLimitExpress — fail-closed mode` (open/closed coverage). Реалізовано в [PR #1552](https://github.com/Skords-01/Sergeant/pull/1552).
- **Integration (follow-up):** Testcontainers-based test з реальним Redis + Postgres, kill container, assert 503 per route — TBD у наступному раунді hardening-у.
- **Manual:** локально `docker compose stop redis` → curl `/api/auth/sign-in` → 503.

## Rollout

- Single PR. Feature-flag `RATE_LIMIT_FAIL_CLOSED_AUTH=true` (default true) — щоб можна було швидко вимкнути у разі неочікуваних 503-issues у production.
- Після 7 днів стабільної роботи з фічею ON у production — видалити flag.

## Risks & mitigations

| Risk                                                                              | Mitigation                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Redis-blip-и трактуватимуться як 503 — користувачі побачать «service unavailable» | `Retry-After: 5`, кругова Redis-reconnect логіка в pre-existing client |
| Більше false-positive 503-метрик у Sentry                                         | Окремий event-name `rate_limit.unavailable` + filter у dashboard       |
| `assertStartupEnv` не валідує `REDIS_URL` для production                          | Додати у PR-01 (env-unify)                                             |

## Touchpoints (file:line)

- `apps/server/src/http/rateLimit.ts:202–249` — fallback-логіка
- `apps/server/src/routes/index.ts` — middleware mount-points
- `apps/server/src/auth.ts` — Better Auth `/api/auth/*` route mount
- `docs/security/` — нова сторінка про failure-mode
- `docs/observability/alerts.md` — додати alert

## Refs

- OWASP ASVS 2.2.1 — «Authentication failure response shall not leak rate-limit state»
- [Stripe «fail-closed» pattern](https://stripe.com/blog/idempotency)
