# API rate-limiting — cost model

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

> **Pointer.** Implementation: [`apps/server/src/http/rateLimit.ts`](../../apps/server/src/http/rateLimit.ts). Failure-mode rules: [`docs/security/rate-limit-failure-mode.md`](../security/rate-limit-failure-mode.md). Diagnostic that triggered the cost-multiplier: [`docs/audits/2026-05-03-web-deep-dive/03-backend-and-performance.md`](../audits/2026-05-03-web-deep-dive/03-backend-and-performance.md) §4.5.

## Чому є cost-multiplier

Sergeant використовує **fixed-window** rate-limiter з трьома backend-ами (Redis → Postgres → in-memory) і per-route ключем (`api:chat`, `nutrition:analyze-photo`, …). До PR #1620 кожен запит коштував рівно 1 токен — незалежно від реальної ціни. Це створювало tail-amplification:

- `GET /api/me` — ~30 ms, ~1 KB.
- `POST /api/chat` — ~30 s streaming SSE, ~50 KB tokens, плюс upstream Anthropic budget.

Один chat-стрім реально коштує ~1000× більше за один `GET /api/me`, але fixed-window bucket бачив обидва як «1 hit». Результат: користувач у межах 30-rpm budget міг сожрати ~15 хвилин upstream model time + ~1.5 MB egress за хвилину, не торкнувши limiter.

## Як cost-multiplier це лагодить

[`RateLimitOptions.cost?: (req: Request) => number`](../../apps/server/src/http/rateLimit.ts) — опціональна функція, яка повертає скільки токенів коштує цей запит. За замовчуванням `1` (всі існуючі route-и зберігають точну поведінку). AI-stream-и проставляють вищу ціну явно:

```ts
rateLimitExpress({
  key: "api:chat",
  limit: 60,
  windowMs: 60_000,
  cost: () => 10, // 60-token bucket / cost 10 = 6 chat-streams/min effective
});
```

### Контракт

| Aspect                         | Behavior                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Default                        | `cost?: undefined` → 1 token per call (back-compat).                                                                                  |
| Range                          | Clamped to `[1, 50]` and floored to int (`resolveRateLimitCost`).                                                                     |
| Non-finite (`NaN`/`±Infinity`) | Treated as 1 — defensive, ніколи не саботує bucket.                                                                                   |
| `cost(req)` throws             | Treated as 1 — middleware не може 500-нути.                                                                                           |
| Storage                        | Redis: `INCRBY cost`. Postgres: `count + cost`. In-memory: `count += cost`.                                                           |
| Block decision                 | Reject when **adding** `cost` would exceed `limit` (not just `count >= limit`). Cheap reads (`cost=1`) keep their previous semantics. |

### Currently configured costs

| Key                           | `limit`     | `windowMs`  | `cost` | Effective rpm | Rationale                                                           |
| ----------------------------- | ----------- | ----------- | ------ | ------------- | ------------------------------------------------------------------- |
| `api:chat`                    | 60          | 60 s        | 10     | 6             | Streaming SSE ~30 s + ~50 KB tokens; upstream Anthropic chargeable. |
| `nutrition:analyze-photo`     | 20          | 60 s        | 3      | ~6            | Vision API call ~5–10 s + ~10–20 KB image upload.                   |
| `nutrition:refine-photo`      | 20          | 60 s        | 3      | ~6            | Same Vision shape as analyze-photo.                                 |
| `nutrition:recommend-recipes` | 20          | 60 s        | 2      | 10            | Anthropic text gen, lighter than streaming chat.                    |
| `nutrition:week-plan`         | 10          | 60 s        | 3      | ~3            | Heaviest plan — 7 days at once.                                     |
| `nutrition:day-plan`          | 15          | 60 s        | 2      | ~7            | ~3× lighter than week-plan.                                         |
| All other keys                | (unchanged) | (unchanged) | 1      | (unchanged)   | No-op for backwards compatibility.                                  |

## Observability

Кожен прийнятий запит інкрементить **two** counters:

- `rate_limit_hits_total{key,outcome="allowed"}` — by 1, незалежно від cost. Лічить сирі call-и (для цього вже існуючий dashboard).
- `rate_limit_cost_total{key}` — by **resolved cost**. Лічить реальне споживання budget-у. Saturate будь-якого ключа = `sum(rate_limit_cost_total) ≈ limit × users` за window. Наприклад, для `api:chat` з 60-token bucket: 6 streams/min × 10 cost = 60/min на користувача.

> **Prom query** для p95 budget-burn (per key):
>
> ```promql
> histogram_quantile(0.95,
>   sum by (le, key) (rate(rate_limit_cost_total[5m]))
> )
> ```
>
> User-level dimension зберігається в bucket-ключі (`subject:u:<userId>`/`subject:ip:<ip>`); surfacing його як Prom-label = cardinality blow-up, тому розрізнюємо тільки на dashboard layer (alert на ключ → drill into logs).

## Як додати cost до нового route

1. Прикинь скільки реально коштує запит — orientовно у токенах GET-equivalent. AI-stream → 10. Vision API call → 3. Heavy DB joins → 2. Звичайні JSON read/write → 1 (default, нічого не пиши).
2. Додай у `rateLimitExpress({ ... cost: () => N })`. Можна динамічно (різна ціна для різних body-shape-ів), але **тільки якщо** зчитуєш з вже-провалідованого джерела — не з raw body, інакше attacker контролює cost.
3. Перевір effective rpm у таблиці вище — якщо твій `limit / cost` нижчий за legitimate user demand, підніми `limit` пропорційно.
4. Додай рядок у таблицю «Currently configured costs» цього файла.
5. Test: один scenario «heavy call, що saturate-ить bucket за `limit / cost` calls, наступний — 429».

## Що НЕ робити

- **Не використовуй cost для авторизаційних бекендів** (`api:auth:*`). Там потрібен fail-closed і constant-time бaviour — додаткова cost-arithmetic ускладнює аналіз security-property.
- **Не передавай user-controlled value у `cost(req)`**. `MAX_COST=50` — нижня межа захисту, не контракт. Краще тримати cost статичним per-route.
- **Не задавай `cost > 50`**. Це clamp, а не error — але якщо тобі реально треба 100, це сигнал про неправильний route-design (split на менші endpoints).

## Migration history

- 2026-05-04 — додано cost-multiplier ([PR #1620](https://github.com/Skords-01/Sergeant/pull/1620)). Foundation: `RateLimitOptions.cost`, `rate_limit_cost_total` counter, applied to chat (cost 10) + 5 nutrition AI routes.
