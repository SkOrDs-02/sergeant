# ADR-0016: User deletion and PII handling

- **Status:** proposed
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/server/src/auth.ts`](../../apps/server/src/auth.ts#L64-L68) — `deleteUser: { enabled: true }` у Better Auth.
  - [`apps/server/src/migrations/003_baseline_schema.sql`](../../apps/server/src/migrations/003_baseline_schema.sql) — таблиці з `ON DELETE CASCADE` на `user(id)`.
  - [`apps/server/src/migrations/007_module_data_user_fk.sql`](../../apps/server/src/migrations/007_module_data_user_fk.sql) — FK на `module_data.user_id`.
  - [`apps/server/src/migrations/008_mono_integration.sql`](../../apps/server/src/migrations/008_mono_integration.sql) — Mono FK з cascade.
  - [`docs/launch/04-launch-readiness.md`](../launch/04-launch-readiness.md#14-gdpr--data-rights) — § 1.4 GDPR / Data rights.
  - [`docs/adr/0017-better-auth-choice-and-session-model.md`](./0017-better-auth-choice-and-session-model.md) — auth-stack rationale.

---

## 0. TL;DR

Юридичний ризик навіть при UA-only launch: ЗУ «Про захист персональних даних»
(ст. 8) і фактичний reach українських юзерів через GDPR (як EU-resident-и
та Stripe-обробник у EU) вимагають right to erasure (Art. 17) +
right to access (Art. 15). У нас вже є Better Auth `deleteUser: enabled: true`
і `ON DELETE CASCADE` на основних таблицях, але цього **недостатньо**:

- `ai_usage_daily` зберігає `subject_key TEXT` замість FK на `user(id)` —
  після cascade-deletion рядки лишаються (PII, бо `u:<userId>` ідентифікує
  колишнього юзера).
- Зовнішні сервіси (Stripe customer, Sentry user, PostHog person,
  Resend contact) не очищаються — вони мають свої API для cleanup.
- Soft-delete vs hard-delete trade-off неявний: 30-day grace window для
  undo чи негайне видалення?
- `chat`/`coach` логи (Loki, Sentry) можуть містити PII у `req.body` —
  ретеншн і scrubbing-policy відсутні.

| Аспект                      | Decision                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Default deletion mode       | **30-day soft-delete** + automated hard-delete cron                                                 |
| Tables with FK CASCADE      | `session`, `account`, `verification`, `module_data`, `push_subscriptions`, `push_devices`, `mono_*` |
| Tables WITHOUT FK CASCADE   | `ai_usage_daily` (subject_key string) — manual purge у deleteUser hook                              |
| External services purge     | Stripe / Sentry / PostHog / Resend — async job у `gdpr_cleanup_queue` table                         |
| GDPR endpoints              | `GET /api/v1/me/export`, `DELETE /api/v1/me`                                                        |
| Log scrubbing               | Pino-redact на `email`, `password`, `token`, `apiKey`, `Authorization`-headers; вже частково є.     |
| PII retention у Loki/Sentry | 30 days max (запит у Railway/Sentry support — TBD)                                                  |

---

## ADR-6.1 — Soft-delete (30 days) + hard-delete cron

### Status

accepted.

### Context

`auth.api.deleteUser({ userId })` Better Auth робить **hard delete**:
`DELETE FROM "user" WHERE id = $1` → CASCADE на `session`, `account`,
`module_data`, `push_*`, `mono_*`.

Проблеми з hard delete-у при першому запиті юзера:

1. **Юзер передумав.** Натиснув "Delete account" в emocional moment,
   через 2 дні хоче назад. Без soft-delete ми втратили його дані
   назавжди — навіть backup-restore поверне state на N днів тому,
   зруйнувавши дані всіх інших.
2. **Compliance audit.** GDPR Art. 17 каже "without undue delay", не "instant".
   30-day grace стандартна ([Stripe](https://stripe.com/docs/account/closing),
   [Linear](https://linear.app/docs/account-deletion), [GitHub](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-user-account-settings/deleting-your-personal-account)).
3. **Pending Stripe operations.** Якщо юзер скасував підписку щойно і ми
   очікуємо `customer.subscription.deleted`-webhook — race з
   user-delete-ом може залишити orphan-row у `subscriptions` таблиці
   (FK буде CASCADE-кинутий, але ще встигне refund-flow з Stripe Dashboard
   потрапити). 30 днів gives us slack.

### Decision

**Дефолтний flow: soft-delete + автоматизований 30-денний hard-delete cron.**

```sql
-- Phase 2 migration: 011_user_soft_delete.sql
ALTER TABLE "user"
  ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idx_user_deleted_at ON "user"(deleted_at)
  WHERE deleted_at IS NOT NULL;
```

`DELETE /api/v1/me` хендлер:

```ts
// apps/server/src/modules/gdpr/delete.ts (Phase 2)
async function softDeleteAccount(userId: string): Promise<void> {
  // 1. Stripe: cancel_at_period_end=true (no immediate refund) — лишається
  //    активним поки Pro не закінчиться, або до hard-delete day 30.
  await stripe.subscriptions.update(subId, { cancel_at_period_end: true });

  // 2. Soft-delete: ставимо `deleted_at`, всі сесії інвалідуємо.
  await pool.query(`UPDATE "user" SET "deleted_at" = NOW() WHERE id = $1`, [
    userId,
  ]);
  await pool.query(`DELETE FROM session WHERE "userId" = $1`, [userId]);

  // 3. Анонімізуємо email одразу (для Stripe webhook idempotency,
  //    щоб юзер міг створити новий акаунт з тим самим email до 30 days):
  await pool.query(
    `UPDATE "user" SET email = $1, name = 'deleted_user' WHERE id = $2`,
    [`deleted_${userId}@deleted.sergeant.app`, userId],
  );

  // 4. Enqueue зовнішніх cleanup-ів (асинхронно, ADR-6.3).
  await enqueueExternalCleanup(userId);
}

// Cron job: apps/server/src/cron/hardDeleteExpiredUsers.ts
async function hardDeleteExpiredUsers() {
  const expired = await pool.query(
    `SELECT id FROM "user" WHERE "deleted_at" < NOW() - INTERVAL '30 days'`,
  );
  for (const row of expired.rows) {
    // ON DELETE CASCADE тригерить cleanup module_data, sessions etc.
    await auth.api.deleteUser({ userId: row.id });
    // Manual purge таблиць БЕЗ FK CASCADE (ADR-6.2).
    await pool.query(`DELETE FROM ai_usage_daily WHERE subject_key = $1`, [
      `u:${row.id}`,
    ]);
  }
}
```

`requireSession` middleware блокує запити юзерів з `deleted_at IS NOT NULL`
з 401 (як interim "ваш акаунт видалено; зайдіть до 30 днів — restore
доступний").

### Consequences

**Позитивні:**

- Юзер може restore через support впродовж 30 днів. Логування
  `account_deleted` event у Sentry показує rate "regret-deletion".
- Compliance: 30 днів — стандартний deadline у Privacy Policy
  (TBD `docs/launch/legal/privacy-policy.md`). Узгоджено з ст. 8 ЗУ
  «Про захист персональних даних» ("упродовж розумного терміну").
- Email-анонімізація на soft-delete-моменті закриває edge-case "юзер
  створив новий акаунт з тим самим email до 30 днів" — Better Auth
  unique constraint не conflict-ить.

**Негативні:**

- 30 днів зайвої БД-utilization. На MVP при <1000 юзерів — байдуже.
- Cron-job — нова operational залежність. Реалізуємо через
  `node-cron` у server-процесі (раз на добу о 03:00 UTC).
- Restore — manual через support. Self-service "restore" UI — Phase 3+.

### Alternatives considered

- **Immediate hard-delete:** відкинуто за пунктами 1+2.
- **Indefinite soft-delete (90+ days):** GDPR Art. 5(1)(e) каже "no longer
  than necessary". 30 днів — захищене reasoning; 90+ — складніше argue.
- **Hard-delete + email-only retention для billing:** Stripe розв'язує
  це сам (їх customer-record не зачіпає наш user-row). Не цей кейс.

---

## ADR-6.2 — `ai_usage_daily` PII purge (no FK cascade)

### Status

accepted.

### Context

`apps/server/src/migrations/002_ai_usage_daily.sql`:

```sql
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  subject_key TEXT NOT NULL,    -- 'u:<userId>' OR 'ip:<address>'
  usage_day DATE NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (subject_key, usage_day)
);
```

`subject_key` — string з префіксом, який дозволяє не-юзер-ам (anonymous IP)
теж відрахуватись. Тому FK на `user(id)` неможливе. Наслідок: `ON DELETE
CASCADE` не зачищає ці рядки. Якщо юзер видалить акаунт, у `ai_usage_daily`
лишається `u:<deletedUserId>` — це ідентифікаційний токен (хоч і
synthetic), що порушує erasure right.

### Decision

**Manual purge у `softDeleteAccount` хук:**

```ts
await pool.query(`DELETE FROM ai_usage_daily WHERE subject_key = $1`, [
  `u:${userId}`,
]);
```

Виконується одразу при soft-delete (не при hard-delete-у), бо: (а)
`ai_usage_daily` rows не дають value для restore — за 30 днів вони все
одно прохолодніли б при rolling-window-policy; (б) не потрібен grace
period.

**IP-bucket rows** (`subject_key LIKE 'ip:%'`) залишаються нетронутими —
там немає user-FK, але вони teoretично теж PII (IP-адреса). Окрема
retention-policy: cron видаляє `usage_day < NOW() - INTERVAL '90 days'`
будь-яких IP-rows. 90 днів — баланс між abuse-protection (anti-fraud) і
GDPR Art. 5(1)(e).

### Consequences

**Позитивні:**

- Erasure right повністю покритий для user-bucket-ів.
- IP retention обмежена 90 днів — відповідає industry-практиці
  (Cloudflare 90d, Sentry default 90d).

**Негативні:**

- Окрема code path поза стандартним FK CASCADE — забути на migration-PR
  при додаванні нової "user-tied but not FK" таблиці. Mitigation:
  audit-script `scripts/check-pii-cleanup.mjs` (TBD), що grep-ає
  `subject_key`, `user_id` без FK-constraint.
- IP-cron може втратити "повторний abuse" pattern (юзер dispute-ив, повернувся
  через 91 день з тим самим IP). Acceptable trade-off; ADR-0003
  fraud_blocklist має 90-day window — узгоджено.

### Alternatives considered

- **Migrate `ai_usage_daily` на FK з `user_id`:** змінює API — поточний
  schema дозволяє anonymous bucket, який ми використовуємо для
  IP-rate-limit-у на `/api/chat`. Зміна великого scope.
- **Hash `subject_key`-ів:** anonymization без видалення. Хеш — все одно
  PII (можна reverse-lookup при наявності user-id-set). Не рятує.

---

## ADR-6.3 — External services cleanup queue

### Status

proposed.

### Context

При delete-account треба cleanup-нути дані юзера у:

| Сервіс  | API                                                     | Auth    | Latency / SLA |
| ------- | ------------------------------------------------------- | ------- | ------------- |
| Stripe  | `customers.del(stripeCustomerId)`                       | API key | ~200ms        |
| Sentry  | `DELETE /api/0/projects/{org}/{p}/users/{userId}/`      | DSN     | ~500ms        |
| PostHog | `DELETE /api/projects/:id/persons/?distinct_id=:userId` | API key | ~1s           |
| Resend  | `DELETE /api/audiences/:id/contacts/:email`             | API key | ~200ms        |

Усі async, retry-able, тимчасові network-failure-и. Інлайнити їх у
`DELETE /api/v1/me`-handler — це: (а) latency 2-3s блокує юзерську взаємодію;
(б) any failure — або silently swallow (PII лишається), або retry-loop, який
тримає request open.

### Decision

**Queue-based async cleanup через таблицю `gdpr_cleanup_queue`:**

```sql
-- Phase 2 migration: 012_gdpr_cleanup_queue.sql
CREATE TABLE gdpr_cleanup_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,        -- збережений як string, бо user уже soft-deleted
  email TEXT NOT NULL,           -- snapshot до анонімізації
  stripe_customer_id TEXT,
  service TEXT NOT NULL CHECK (service IN ('stripe', 'sentry', 'posthog', 'resend')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_gdpr_cleanup_pending
  ON gdpr_cleanup_queue(next_attempt_at)
  WHERE completed_at IS NULL;
```

`enqueueExternalCleanup(userId)` вставляє 4 row-и (по одному per service).
Background worker (cron, раз на 5 хвилин) бере `WHERE completed_at IS NULL
AND next_attempt_at <= NOW()`, виконує API-call, при success — ставить
`completed_at = NOW()`, при failure — інкрементує `attempts`, записує
`last_error`, ставить `next_attempt_at = NOW() + 2^attempts * 1min`
(exponential backoff).

Hard-delete cron з ADR-6.1 чекає, доки `gdpr_cleanup_queue` не порожня для
конкретного `user_id` (всі 4 service-rows mark-нуті `completed_at`),
**тоді** видаляє `user`-row. Це гарантує: ми не загубимо stripe_customer_id
до того, як reached out до Stripe API.

### Consequences

**Позитивні:**

- Failure-resilient. Якщо Stripe API down — retry exponentially до 2^7 = ~2hr.
- Audit-trail: `gdpr_cleanup_queue.completed_at IS NULL AND attempts > 5`
  — алерт.
- Idempotent: re-running на завершений row no-op (Stripe `customer.del`
  на видаленого customer — 200, Sentry — 404 нормально, ловимо як
  "already cleaned").

**Негативні:**

- Окремий worker-процес (або cron-job-ом всередині API-сервера). На
  Railway 1 інстансі — у `apps/server/src/cron/`-папці.
- Дані юзера де-факто тримаються у external-service до 30 днів. Compliance
  argument: GDPR Art. 17 "without undue delay" — 30 днів acceptable за
  industry-практикою.

### Alternatives considered

- **Sync inline cleanup:** см. context — latency + failure-handling.
- **Eventbus / Kafka:** overkill для 4 endpoints на ~10 deletions/тиждень.
- **No external cleanup, only PG:** GDPR Art. 28 (data processors) вимагає
  cascade-delete у sub-processors. Не legal.

---

## ADR-6.4 — Log scrubbing (Pino redact, Sentry beforeBreadcrumb)

### Status

proposed.

### Context

Структуроване логування (Pino, через `apps/server/src/obs/logger.ts`) і
Sentry breadcrumbs можуть зловити PII в req.body / req.query. Specific
ризики:

- `email` у sign-up payload.
- `password` у sign-in (Better Auth внутрішньо хеш-ить, але якщо ми логуємо
  request-body на 4xx до auth-handler-а — попадає у Loki).
- `apiKey`, `Authorization` headers — ми вже redact-имо у Pino-config,
  Sentry — TBD.
- Mono token (32-hex) у URL path `/api/mono/webhook/:secret` — це секрет, не
  має бути у access-log.

### Decision

**Жорсткий redact у Pino + Sentry:**

```ts
// apps/server/src/obs/logger.ts (extend existing config)
export const logger = pino({
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.email", // PII; на 4xx логуємо лише event_id
      "req.body.apiKey",
      "req.body.token",
      "req.params.secret", // /api/mono/webhook/:secret
      "*.password",
      "*.token",
      "*.apiKey",
      "*.email",
    ],
    censor: "[redacted]",
  },
  // ... existing config
});
```

Sentry-beforeBreadcrumb / beforeSend hook робить те саме на даних
breadcrumb-у. Мобільні Sentry-клієнти — окремий config у
`apps/mobile/src/core/sentry.ts`.

**Retention у Loki / Sentry:**

- Loki (Railway) — 30 days default. Перевірити при production setup.
- Sentry — 30 days на free tier; 90 days на team. Налаштувати на 30 для
  GDPR-compliance.

### Consequences

**Позитивні:**

- PII-leak surface зменшено до зовнішніх sub-processor-ів (Anthropic,
  Stripe, Mono — там data goes through їхні privacy policies).
- Reading logs для debugging стає важчим (`email=[redacted]`); але можна
  reverse-lookup через `userId` у `req.user.id`, який не PII (synthetic ID).

**Негативні:**

- Performance hit на Pino-redact ~5-10% per log-line. Acceptable.
- Sentry breadcrumbs з redact — потрібно тестувати в integration-тесті,
  щоб не purchase-нути silent leak. TBD test.

### Alternatives considered

- **Hash PII в логах:** reverse-lookup можливий при наявності користувацької
  бази. Не покращує compliance.
- **Окремий PII-only лог-канал з access-control:** добре для enterprise,
  overkill для нас.

---

## ADR-6.5 — `GET /api/v1/me/export` shape

### Status

proposed.

### Context

GDPR Art. 15 (right to access) + Art. 20 (data portability) вимагають
machine-readable export. Format trade-off:

- JSON: portable, легко parse, але не human-friendly.
- ZIP-of-CSVs: human-friendly (Excel), але потребує ZIP-стрімер.
- Both: extra complexity.

### Decision

**JSON-only на MVP.** ZIP-CSV — Phase 4 при появі першого реального запиту.

Shape:

```json
{
  "exportedAt": "2026-04-27T12:00:00Z",
  "user": { "id": "...", "email": "...", "createdAt": "...", "name": "..." },
  "subscriptions": [...],          // Stripe subscriptions row (без secrets)
  "moduleData": {
    "finyk": { "data": {...}, "version": 12, "updatedAt": "..." },
    "fizruk": {...},
    "routine": {...},
    "nutrition": {...}
  },
  "monoIntegration": { "accountIds": [...], "linkedAt": "..." }, // sans tokens
  "pushSubscriptions": [...],      // sans p256dh/auth secrets
  "aiUsage": [...],                 // ai_usage_daily entries
  "auditLog": [],                   // post-MVP
  "_disclaimer": "..."
}
```

**Що НЕ включаємо:**

- Mono API token, Stripe secrets — це our credentials, не user data.
- Better Auth password hash — зворотний хеш безглуздий.
- Server-internal IDs зайвих таблиць (`account.id`, `session.id`).

Endpoint:

```ts
// apps/server/src/routes/me-export.ts (Phase 2)
r.get(
  "/api/me/export",
  requireSession(),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const data = await collectGdprExport(userId); // ~5 paralleled queries
    res.set(
      "Content-Disposition",
      `attachment; filename="sergeant-export-${userId}.json"`,
    );
    res.json(data);
  }),
);
```

### Consequences

**Позитивні:**

- Machine-readable.
- Один endpoint = один code-path для тесту.

**Негативні:**

- Юзер бачить технічний JSON (не Excel-friendly). Mitigation: документуємо
  у Privacy Policy як "JSON structure for portability".

---

## ADR-6.6 — Що НЕ робимо (out of scope)

### Status

accepted.

### Decision

Цей ADR **не** покриває:

- **Right to rectification (Art. 16).** Юзер уже може змінити email/name
  через Better Auth standard endpoints. Ми не пишемо окремий ADR.
- **Right to restriction (Art. 18).** Edge case, який реалізуємо
  ad-hoc через support при першому запиті.
- **Data Protection Impact Assessment (DPIA).** Юридичний документ,
  не technical ADR.
- **Children's data.** Sign-up gate (вік 16+) — Phase 3 (ADR TBD).
- **Bulk export для admin.** Founder admin-tools — Phase 5+.
- **Right to object (Art. 21).** Зараз Sergeant не робить automated
  decision-making з legal effect; ADR-2 tool-lifecycle вже трекає AI-tool
  outcomes для transparency.

---

## Open questions

1. **Backup-policy і "right to be forgotten" trade-off.** Railway backups
   зберігають PG-снапшоти на 30 днів. Soft-delete у `user` table вирішує
   live-state, але якщо юзер запитав erasure — у backup-folder він
   лишається. Стандартна industry-практика: "backup-restore + replay
   delete-events" — складно. Простіше: Privacy Policy явно позначає
   "data may persist in backups до 30 днів". Узгодити з ADR-6.1.
2. **Anthropic data retention.** За Anthropic ToS, prompts зберігаються
   30 днів для abuse-monitoring. Зазначаємо у Privacy Policy. Anthropic
   не дає "delete-by-userId" API — це вирішено на їхньому рівні.
3. **Audit log для deletion.** Чи зберігаємо `account_deleted` event
   indefinitely (для compliance audit)? Якщо так — синтетичний `userId`
   достатній. TBD у Phase 3.
