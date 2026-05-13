# C1 — Monobank webhook secret leaks via URL path

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** In progress (Phase 1 — server-side defense-in-depth — landed 2026-05-04; Phase 2 — Monobank-side path→header rollout + secret rotation — pending coordination with Monobank API)

| Field              | Value                                                                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Critical** (CVSS 9.1 — Auth-bypass via leaked secret + replay)                                                                                                                                                                               |
| **Sprint**         | [Sprint 1](./sprint-1.md)                                                                                                                                                                                                                      |
| **Owner**          | backend                                                                                                                                                                                                                                        |
| **Effort**         | 1 person-day                                                                                                                                                                                                                                   |
| **Status**         | In progress — Phase 1 closed 2026-05-04; Phase 2 pending Monobank coordination                                                                                                                                                                 |
| **Discovered**     | 2026-05-03 (security-review by Devin)                                                                                                                                                                                                          |
| **Threat model**   | Information Disclosure → Replay → Spoofing                                                                                                                                                                                                     |
| **Affected files** | `apps/server/src/modules/mono/webhook.ts`, `apps/server/src/routes/mono-webhook.ts`, `apps/server/src/obs/sensitiveUrl.ts` (new), `apps/server/src/http/errorHandler.ts`, `apps/server/src/sentry.ts`, `packages/shared/src/openapi/routes.ts` |

## Summary

Monobank надсилає webhook-нотифікації на URL `POST /api/mono/webhook/<secret>`, де `<secret>` — довгий random, що ідентифікує користувача. Цей секрет потрапляє у **access-логи** (Railway, Express, Pino-http, Sentry breadcrumbs) як частина `req.url`, що дозволяє атакеру з read-only доступом до логів **виявити валідний секрет і спуфити транзакції**.

Фікс на стороні БД (SHA-256 hash як index — `webhookSecretHash` у `mono/crypto.ts`) захищає від `WHERE`-timing-leak, але **не** захищає секрет від витоку через лог-pipeline.

## Evidence

```ts
// apps/server/src/modules/mono/webhook.ts:159–190
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const secret = req.params.secret;          // ← секрет із URL path

  if (!secret || typeof secret !== "string") {
    monoWebhookReceivedTotal.inc({ status: "invalid_secret" });
    res.status(404).json({ error: "Not found" });
    return;
  }

  const secretHash = webhookSecretHash(secret);
  const connResult = await query<{ user_id: string }>(
    "SELECT user_id FROM mono_connection WHERE webhook_secret_hash = $1 AND status = 'active'",
    [secretHash],
    { op: "mono_webhook_lookup" },
  );
  // ...
```

URL-форма `POST https://api.<host>/api/mono/webhook/<secret>` логуватиме secret у:

- Railway access-logs (≥ 30 днів retention за замовчуванням).
- Pino HTTP-серіалайзер (`req.url`, `req.originalUrl`).
- Sentry breadcrumbs та `event.request.url` (для будь-якого error-event у webhook handler-і).
- Будь-який APM / reverse-proxy / WAF, що сидить перед сервером.

Поточний `redactPaths` у `apps/server/src/obs/logger.ts:24–48` редагує `cookie`, `authorization`, `password`, `email`, `phone`, але **не** `req.url` для шляху `/api/mono/webhook/*`.

## Impact

1. **Replay attack (high impact)** — атакер з логами реплеює `StatementItem` із підробленими `amount`/`description` для будь-якого юзера. UPSERT-idempotency `(user_id, mono_tx_id)` дозволяє додавати фальшиві транзакції з контрольованим `mono_tx_id`.
2. **Account takeover (medium impact)** — підроблені транзакції впливають на бюджет-розрахунки в `apps/web` (Finyk модуль), що може ввести юзера в оману щодо балансу.
3. **Compliance impact** — фінансові дані під фактичним частим контролем (подальша GDPR / fintech-compliance).
4. **Blast radius** — кожен read-only холдер логів (Sentry, Railway, потенційний Loki) = post-hoc валідні webhook-секрети для **всіх** активних з'єднань.

## Recommendation

### Primary (preferred)

1. **Перенести секрет у HTTP header** — `X-Mono-Webhook-Secret`. Узгодити з Monobank через `setWebHook`-API або `webhookUrl`-конфіг (Monobank підтримує кастомні headers або body-base auth).
2. **Sanitize current logs** — додати middleware, що **переписує `req.url` на `/api/mono/webhook/[redacted]`** до того, як Pino-http лог-сериалайзер чи Sentry breadcrumb обріже URL.
3. **Rotate всі активні webhook-секрети** після фіксу: вважати їх скомпрометованими (вони вже у логах за весь історичний період).

### Secondary (defense-in-depth)

- Додати `req.url`, `req.originalUrl`, `req.headers['x-mono-webhook-secret']` у `redactPaths` Pino.
- Sentry `beforeSend(event)` — sanitize `event.request.url` для всіх `/mono/webhook/*` endpoints.
- Додати **alarm** на `mono_webhook_received_total{status="invalid_secret"}` > 10/min — раннє виявлення сканування секретів.

## Correction points

| File / line                                               | Action                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/modules/mono/webhook.ts:159–190`         | `req.params.secret` → `req.headers['x-mono-webhook-secret']` (з backward-compat на `req.params` на час migration window).       |
| `apps/server/src/modules/mono/router.ts` (mount-point)    | Маршрут `/api/mono/webhook/:secret` → `/api/mono/webhook` (path без secret).                                                    |
| `apps/server/src/obs/logger.ts:24`                        | Розширити `redactPaths`: `"req.url"`, `"req.originalUrl"`, `"req.headers['x-mono-webhook-secret']"`.                            |
| `apps/server/src/app.ts` Sentry init                      | `beforeSend`: `event.request.url = event.request.url?.replace(/\/api\/mono\/webhook\/[^/?]+/, '/api/mono/webhook/[redacted]')`. |
| `apps/server/src/modules/mono/rotateSecret.ts` (new file) | CLI / admin-route для масової ротації + UI «cycle webhook secret» для юзерів.                                                   |
| `apps/server/scripts/rotate-mono-secrets.ts` (new)        | One-off script для **усіх** active connections — генерує новий secret, оновлює `mono_connection`, переєструє webhook у Mono.    |

## Verification

1. **Unit test** — `apps/server/src/modules/mono/__tests__/webhook.test.ts`: webhook відповідає 401, якщо `X-Mono-Webhook-Secret` відсутній або не співпадає.
2. **Integration test** — Pino-output у тесті НЕ містить значення секрету ні в `req.url`, ні в `breadcrumb.data.url`.
3. **Production smoke** — після deploy + rotation: `grep "webhook/[^[]" railway-logs.gz` за останні 24h → empty.
4. **Sentry sanity-check** — викликати тестовий error на webhook-handler-і → перевірити, що в Sentry-issue `request.url` редагований.

## Cross-references

- [docs/security/hardening/sprint-1.md](./sprint-1.md) — sprint context.
- [docs/security/vulnerability-sla.md](../vulnerability-sla.md) — Critical = 24h acknowledge / 14d fix.
- [docs/playbooks/rotate-secrets.md](../../playbooks/rotate-secrets.md) — порядок ротації production-секретів.
- [docs/integrations/](../../integrations/) — Monobank integration spec (uplift `setWebHook` payload).

## Resolution log

### Phase 1 — server-side defense-in-depth (2026-05-04)

> Closes secondary recommendations + opens header-based transport without breaking Monobank's current path-based delivery.

**Shipped (PR pending merge):**

- `apps/server/src/modules/mono/webhook.ts` — handler приймає секрет з `X-Mono-Webhook-Secret` header (preferred); fallback на `req.params.secret`. Header перемагає при колізії, тож rollout flips через Monobank-конфіг без server-change.
- `apps/server/src/routes/mono-webhook.ts` — `POST /api/mono/webhook` (без path-secret) додано як preferred-маршрут; `POST /api/mono/webhook/:secret` лишається як deprecated до завершення Phase 2.
- `apps/server/src/obs/sensitiveUrl.ts` — новий хелпер `redactSensitiveUrl(url)` з whitelist відомих secret-bearing prefix-ів (`/api/mono/webhook/`, `/api/v1/mono/webhook/`).
- `apps/server/src/http/errorHandler.ts` — `path: req.route?.path || redactSensitiveUrl(req.originalUrl)` — fallback вже не може витекти секрет у Pino `request_failed` лог.
- `apps/server/src/sentry.ts` — `applyBeforeSend` редагує `event.request.url`; `applyBeforeBreadcrumb` редагує `data.url` для outbound HTTP breadcrumbs. Обидва хуки extracted у named-функції для unit-тестування.
- `packages/shared/src/openapi/routes.ts` + `docs/api/openapi.json` — header-маршрут опубліковано в OpenAPI; legacy path-маршрут позначено deprecated.

**Tests:** `sensitiveUrl.test.ts` (new, 8 cases), `sentry.test.ts` (+9 cases для applyBeforeSend/Breadcrumb), `errorHandler.test.ts` (+2 cases для path-redaction), `webhook.test.ts` (+4 cases для header-transport).

### Phase 2 — Monobank-side rollout (pending)

> Coordinate with Monobank `setWebhook`-API to flip delivery from path-secret до `X-Mono-Webhook-Secret` header. After рознабив-rollout прокручивает усі активні secret-и (вони лишаються в існуючих read-only-логах за історичний період). Лишити legacy path-маршрут до моменту, коли metric `mono_webhook_secret_transport{transport="legacy_path"}` стабільно нульова на 7+ днів.
