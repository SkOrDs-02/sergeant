# 06. Архітектура монетизації (технічний скелетон v2)

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> Pre-MVP draft. Розширення [01 — Монетизація і ціноутворення](./01-monetization-and-pricing.md) в бік реальної імплементації: розбивка на PR-и, ADR-рішення, risk register, rollout-plan.
>
> **Diff проти v1 (skeleton-attachment):** виправлені 5 red flags (idempotency, period_end semantics, cache-invalidation, grandfather policy, aiQuota×requirePlan). Розбивка PR розширена з 6 до 10. Додано: ADR-список рішень, risk register, rollout-план з feature-flag, env-template, контракт-тести.
>
> **Принципи:**
>
> - Кожен PR — один scope з AGENTS.md rule #5. Без `feat(monetization): ...`, бо такого scope немає.
> - Кожен PR — green CI + green Vercel preview без feature-flag-toggle.
> - Жоден PR не вводить регрес для існуючих користувачів. CloudSync, який **вже був безкоштовний**, не стає Pro-only одним PR-ом — це окрема migration з grandfather-rule.
> - Stripe код за `STRIPE_ENABLED` env-flag до самого PR #10. До цього — `provider: 'manual'` як єдиний тестований шлях.

---

## 0. Що змінилось проти v1 (TL;DR)

| #   | Було (v1)                                                      | Стало (v2)                                                                                                                                             | Чому                                                                                                        |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1   | `current_period_end DEFAULT NOW() + INTERVAL '100 years'`      | `current_period_end TIMESTAMPTZ NULL` (NULL = безстроково/free). `100 years` — антипатерн                                                              | NULL semantically clearer, нема risk що Postgres рахує `interval` неправильно у 2125                        |
| 2   | Webhook handler без event-id-store                             | Окрема таблиця `stripe_webhook_events(event_id PRIMARY KEY, processed_at)` для idempotency                                                             | Stripe гарантує **at-least-once**, не **exactly-once**. Без idempotency повторна доставка зламає period_end |
| 3   | `effectiveLimits()` динамічний на план, без cache-invalidation | `subscription_changed` event у Postgres NOTIFY → web invalidate `billingKeys.plan()` через RQ + clear `effectiveLimits` LRU on subscriber notification | Інакше canceled Pro лишається з безлімітом до перезапуску процесу                                           |
| 4   | CloudSync став Pro-only без розмови про migration              | Окремий PR з grandfather-rule: усі pre-2026-05-01 юзери отримують `legacy_pro_grace` flag → 90 днів trial-access до paywall                            | Інакше D-day = масовий churn існуючих користувачів                                                          |
| 5   | `requirePlan("aiChatPerDay")` дублює `requireAiQuota`          | Об'єднані: `requireAiQuota` тепер **читає план через `getUserPlan(userId)`** і повертає динамічний liмит. `requirePlan` — лише на не-AI feature gates  | DRY + єдина точка enforcement на одному ендпоінті                                                           |
| 6   | Pricing page + emails + analytics в одному "Polish" PR         | Pricing page — окремо (PR-9). Emails + analytics — у follow-up (поза monetization-MVP)                                                                 | Pricing page має SEO + a11y вимоги, потребує окремого ревʼю                                                 |
| 7   | Webhook signature verification — як rate                       | Verifying middleware — обов'язковий, з 401 при помилці + alert-rule в Prometheus `stripe_webhook_signature_failed_total`                               | Без цього webhook open для будь-кого з internet                                                             |
| 8   | Нічого про refund / proration                                  | Pro-rated refunds через `customer.subscription.updated` (Stripe сам прислідить) — задокументовано як не-implementation, лише monitoring                | Якщо юзер апгрейдиться/даунгрейдиться mid-period, Stripe прислідить, наш handler має це reflect-ити         |

---

## 1. ADR — рішення, які треба зафіксувати ПЕРЕД PR-ами

> Перший PR серії — **`docs/adr/0001-monetization-architecture.md`**. Без цього ADR не починаємо код. ADR прописує:

| Рішення                                       | Варіант                                                                                                          | Статус   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| ADR-1.1: Provider                             | Stripe primary, LiqPay (Україна) phase 2                                                                         | accepted |
| ADR-1.2: Single-table vs subscription-history | Single-row-per-user (поточна підписка); audit trail через `subscription_events` log                              | accepted |
| ADR-1.3: Plan-cache TTL                       | RQ `staleTime: 60s`, server `effectiveLimits` LRU `ttl: 300s` + invalidation on `subscription_changed`           | accepted |
| ADR-1.4: Grandfather policy для CloudSync     | Користувачі з `created_at < 2026-05-01` → 90 днів trial-Pro free. Після цього — paywall з 14-day trial extension | accepted |
| ADR-1.5: Trial flow (нові юзери)              | 14 днів Pro trial при реєстрації, без payment method. По закінченню → free + paywall на Pro-features             | accepted |
| ADR-1.6: AI ліміт для free                    | 5 chat msg/day, 3 photo/day. Якщо юзер вибрав ліміт — banner "перейди на Pro" замість 429                        | accepted |
| ADR-1.7: Coordination with `requireAiQuota`   | `requireAiQuota` читає план, `requirePlan` — для не-AI gates тільки                                              | accepted |
| ADR-1.8: Webhook event-id store retention     | 90 днів (cron-based purge у `015_purge_webhook_events.sql` як phase 2)                                           | accepted |
| ADR-1.9: Currency                             | UAH primary, USD secondary (через Stripe Multi-currency). На MVP — UAH only                                      | accepted |
| ADR-1.10: Tax handling                        | Stripe Tax automatic + ФОП на 3 групі окремо (operations, не код)                                                | external |

**Дія:** перед PR #1 розгорнути цей ADR як живий файл у репо, апрувити з тобою.

---

## 2. Шар 1 (зміни): `packages/shared`

### 2.1 Типи плану (мінімальні правки v1)

```ts
// packages/shared/src/schemas/billing.ts

export const PlanId = z.enum(["free", "pro"]);

export const SubscriptionStatus = z.enum([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
  "legacy_grace", // ← НОВЕ: grandfather для pre-2026-05-01 юзерів
]);

export const SubscriptionSchema = z.object({
  userId: z.string(),
  plan: PlanId,
  status: SubscriptionStatus,
  provider: z.enum(["stripe", "liqpay", "manual", "grandfather"]), // ← НОВЕ
  providerSubscriptionId: z.string().nullable(),
  // ↓ було: .datetime() обов'язково. Стало: nullable для free/grandfather
  currentPeriodStart: z.string().datetime().nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  // ↓ НОВЕ: дата коли legacy_grace переходить у paywall
  graceUntil: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

### 2.2 Plan gates (правка v1)

```ts
// packages/shared/src/lib/planGates.ts

export const PLAN_GATES = {
  free: {
    aiChatPerDay: 5,
    aiBriefing: false,
    aiDaySummary: false,
    aiPhotoPerDay: 3,
    cloudSync: false,
    monoAutoSync: false,
    crossModuleReports: false,
    exportCsvPdf: false,
    pushHabitsLimit: 2,
    activeFizrukPrograms: 1,
    weekComparison: false,
  },
  pro: {
    aiChatPerDay: true,
    aiBriefing: true,
    aiDaySummary: true,
    aiPhotoPerDay: true,
    cloudSync: true,
    monoAutoSync: true,
    crossModuleReports: true,
    exportCsvPdf: true,
    pushHabitsLimit: true,
    activeFizrukPrograms: true,
    weekComparison: true,
  },
} as const satisfies Record<PlanId, Record<string, boolean | number>>;

/**
 * Effective plan з урахуванням `legacy_grace`.
 * Усі legacy_grace юзери бачать Pro-функціонал до graceUntil.
 */
export function effectivePlan(
  sub: Pick<Subscription, "plan" | "status" | "graceUntil">,
): PlanId {
  if (
    sub.status === "legacy_grace" &&
    sub.graceUntil &&
    new Date(sub.graceUntil) > new Date()
  ) {
    return "pro";
  }
  if (sub.status === "past_due" || sub.status === "canceled") {
    // active до кінця періоду; canceled flag вже стоїть
    return sub.plan;
  }
  if (sub.status === "expired") return "free";
  return sub.plan;
}
```

---

## 3. Шар 2 (зміни): `apps/server`

### 3.1 Migration 009 — subscriptions (правки v1)

```sql
-- apps/server/src/migrations/009_subscriptions.sql

CREATE TABLE IF NOT EXISTS subscriptions (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free', 'pro')),
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'trialing', 'past_due',
                                    'canceled', 'expired', 'legacy_grace')),
  provider      TEXT NOT NULL DEFAULT 'manual'
                  CHECK (provider IN ('stripe', 'liqpay', 'manual', 'grandfather')),
  provider_subscription_id TEXT,
  provider_customer_id     TEXT,
  -- ↓ NULL замість '100 years' — semantically clear
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  grace_until          TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT period_consistency CHECK (
    (current_period_start IS NULL AND current_period_end IS NULL) OR
    (current_period_start IS NOT NULL AND current_period_end IS NOT NULL
     AND current_period_end > current_period_start)
  )
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider
  ON subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- Trigger для NOTIFY на канал 'subscription_changed' для cache-invalidation.
CREATE OR REPLACE FUNCTION notify_subscription_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('subscription_changed', NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_notify
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION notify_subscription_change();
```

### 3.2 Migration 010 — webhook idempotency

```sql
-- apps/server/src/migrations/010_stripe_webhook_events.sql

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id      TEXT PRIMARY KEY,         -- Stripe event id
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome       TEXT NOT NULL CHECK (outcome IN ('ok', 'ignored', 'error')),
  error_msg     TEXT
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed
  ON stripe_webhook_events(processed_at);
```

### 3.3 Migration 011 — grandfather seed (data migration)

```sql
-- apps/server/src/migrations/011_grandfather_existing_users.sql
--
-- Додати subscription-row для всіх існуючих юзерів з `legacy_grace` status,
-- termin на 90 днів від релізу monetization-MVP.

INSERT INTO subscriptions (user_id, plan, status, provider, grace_until)
SELECT
  u.id,
  'free',
  'legacy_grace',
  'grandfather',
  '2026-08-01T00:00:00+00:00'::TIMESTAMPTZ  -- 90 днів від запуску
FROM "user" u
WHERE u.created_at < '2026-05-01T00:00:00+00:00'::TIMESTAMPTZ
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
  );
```

> **Важливо:** AGENTS.md rule #4 — це окрема `NNN_*.sql` після того як код 010 уже live (інакше старий код не знає про `legacy_grace` status). Тому **PR #4 (grandfather)** мерджимо ПІСЛЯ PR #2 (migration 009 + 010 schema) і ПІСЛЯ деплою.

### 3.4 effectiveLimits ↔ requireAiQuota (зміна v1 §2.7)

```ts
// apps/server/src/modules/chat/aiQuota.ts (правка існуючого файла)

export async function effectiveLimits(userId: string | null): Promise<Limits> {
  if (!userId) return ANONYMOUS_LIMITS;

  const sub = await getUserPlan(userId); // ← з planCache (LRU)
  const eff = effectivePlan(sub);

  if (eff === "pro") {
    return PRO_LIMITS; // null = unlimited
  }
  return {
    chatPerDay: PLAN_GATES.free.aiChatPerDay, // 5
    photoPerDay: PLAN_GATES.free.aiPhotoPerDay, // 3
    // ... інші AI-related обмеження
  };
}
```

### 3.5 Plan cache + invalidation

```ts
// apps/server/src/modules/billing/planCache.ts (новий файл)

import LRU from "lru-cache";
import { Pool } from "pg";

const planCache = new LRU<string, UserPlan>({ max: 5_000, ttl: 5 * 60_000 });

export async function getUserPlan(userId: string): Promise<UserPlan> {
  const cached = planCache.get(userId);
  if (cached) return cached;
  const row = await db.query(/* ... */);
  const plan = row ? mapToUserPlan(row) : DEFAULT_FREE_PLAN;
  planCache.set(userId, plan);
  return plan;
}

// Слухач NOTIFY 'subscription_changed' стартує разом з сервером.
export function startPlanCacheInvalidator(pool: Pool) {
  const client = await pool.connect();
  client.on("notification", (msg) => {
    if (msg.channel === "subscription_changed" && msg.payload) {
      planCache.delete(msg.payload);
    }
  });
  await client.query("LISTEN subscription_changed");
}
```

> Є поточна `prom-client` метрика — додати `plan_cache_hit_total{outcome="hit|miss"}`, slo target 95%+ після warm-up.

### 3.6 Webhook handler — idempotent

```ts
// apps/server/src/routes/stripe-webhook.ts

router.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }), // Stripe вимагає raw body
  asyncHandler(async (req, res) => {
    // 1. Verify signature (КРИТИЧНО)
    const sig = req.header("stripe-signature");
    if (!sig) return res.status(401).json({ error: "missing_signature" });
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (e) {
      metrics.stripeWebhookSignatureFailed.inc();
      return res.status(401).json({ error: "invalid_signature" });
    }

    // 2. Idempotency check (event.id PK)
    const dup = await db.query(
      "INSERT INTO stripe_webhook_events (event_id, event_type, payload, outcome) VALUES ($1, $2, $3, 'ok') ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
      [event.id, event.type, event],
    );
    if (dup.rowCount === 0) {
      metrics.stripeWebhookDuplicate.inc();
      return res.status(200).json({ deduplicated: true });
    }

    // 3. Process event
    try {
      await processWebhookEvent(event);
      res.status(200).json({ ok: true });
    } catch (err) {
      // лишаємо row у webhook_events з outcome='ok' — Stripe буде retry-ити, idempotency спрацює
      // АЛЕ: помічаємо row як 'error' для observability
      await db.query(
        "UPDATE stripe_webhook_events SET outcome='error', error_msg=$1 WHERE event_id=$2",
        [(err as Error).message, event.id],
      );
      throw err; // 5xx — Stripe буде retry
    }
  }),
);
```

---

## 4. Шар 3 (зміни): `apps/web`

### 4.1 `usePlan` з NOTIFY-aware invalidation

```ts
// apps/web/src/shared/hooks/usePlan.ts

export function usePlan() {
  const q = useQuery({
    queryKey: billingKeys.plan(),
    queryFn: () => apiClient.billing.getPlan(),
    staleTime: 60_000, // ADR-1.3
    refetchOnWindowFocus: true,
  });

  // Server-Sent Events stream `/api/me/plan-stream` емітить 'updated' коли
  // pg_notify приходить → клієнт invalidate-ить query.
  // (НЕ Server-Sent Events, якщо вже є WS-канал — використовуємо його; ASCII-діаграма у §6)
  useEffect(() => {
    const es = new EventSource("/api/me/plan-stream");
    es.addEventListener("updated", () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.plan() });
    });
    return () => es.close();
  }, []);

  return {
    plan: q.data ? effectivePlan(q.data) : "free",
    isPro: effectivePlan(q.data || DEFAULT_FREE) === "pro",
    status: q.data?.status ?? null,
    periodEnd: q.data?.periodEnd ?? null,
    isLoading: q.isLoading,
  };
}
```

### 4.2 `<PaywallGate>` (зміна v1)

```tsx
// apps/web/src/shared/components/PaywallGate.tsx

interface Props {
  feature: FeatureKey;
  label: string;
  children: ReactNode;
  fallback?: ReactNode; // ← НОВЕ: для inline lock-icon-у замість full block
  mode?: "block" | "lock-icon"; // ← НОВЕ
}

export function PaywallGate({
  feature,
  label,
  children,
  fallback,
  mode = "block",
}: Props) {
  const { plan, isLoading } = usePlan();
  if (isLoading) return <Skeleton />;
  if (hasAccess(plan, feature)) return <>{children}</>;
  if (mode === "lock-icon" && fallback) return <>{fallback}</>;
  return <PaywallCard label={label} feature={feature} />;
}
```

### 4.3 RQ keys — додати

```ts
// apps/web/src/shared/lib/queryKeys.ts

export const billingKeys = {
  all: ["billing"] as const,
  plan: () => [...billingKeys.all, "plan"] as const,
  history: () => [...billingKeys.all, "history"] as const, // ← на phase 2
};
```

---

## 5. Уточнена розбивка PR (10 шт.)

```
┌─ Phase 0 ─────────────────────────────────────────────────────────┐
│ PR-M.0  docs(docs): ADR-0001 monetization architecture            │  ~250 LOC, low risk
│         · Фіксує всі рішення з §1 ADR-1.1..1.10                   │
│         · Без коду                                                │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ Phase 1 — types & schema (паралельно) ──────────────────────────┐
│ PR-M.1  feat(shared): billing types + planGates registry         │  ~250 LOC, low risk
│         · packages/shared/src/schemas/billing.ts                 │
│         · packages/shared/src/lib/planGates.ts (+ effectivePlan) │
│         · 100% test coverage на effectivePlan/hasAccess          │
│                                                                  │
│ PR-M.2  feat(migrations): 009_subscriptions + 010_webhook_events │  ~150 LOC, low risk
│         · 2 міграції, обидві ADD-only                            │
│         · pg_notify trigger                                      │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ Phase 2 — server core (sequential) ────────────────────────────┐
│ PR-M.3  feat(server): billing module + planCache + LISTEN-loop  │  ~400 LOC, low risk
│         · apps/server/src/modules/billing/{index,planCache}.ts  │
│         · getUserPlan, upsertSubscription                       │
│         · LISTEN subscription_changed → planCache.delete        │
│         · prom metrics                                          │
│         · НЕ змінює aiQuota ще                                  │
│         · 100% test coverage на all branches                    │
│                                                                 │
│ PR-M.4  feat(migrations): 011_grandfather_existing_users        │  ~80 LOC, medium risk
│         · DATA-migration                                        │
│         · INSERT only для users з created_at < 2026-05-01        │
│         · Безпечна (NOT EXISTS guard)                           │
│         · Окремий PR щоб мерджити ПІСЛЯ деплою #3                │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ Phase 3 — middleware + endpoints (sequential, AGENTS rule #3) ┐
│ PR-M.5  feat(server,api-client): requirePlan middleware,        │  ~350 LOC, medium risk
│         GET /api/billing/plan, getPlan client                   │
│         · apps/server/src/http/requirePlan.ts                   │
│         · apps/server/src/routes/billing.ts (тільки GET /plan)  │
│         · packages/api-client/src/endpoints/billing.ts          │
│         · server-test snapshot + api-client unit-test           │
│                                                                 │
│ PR-M.6  feat(server): refactor effectiveLimits to use plan      │  ~200 LOC, medium risk
│         · apps/server/src/modules/chat/aiQuota.ts                    │
│         · Pro → null limit (unlimited skip)                     │
│         · Free → PLAN_GATES.free.aiChatPerDay (5)               │
│         · Backward-compat snapshot tests                        │
│         · `requireAiQuota` уже навісила на /api/chat —          │
│           тут лише читаємо план, не додаємо middleware          │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ Phase 4 — Stripe (gated by env-flag) ──────────────────────────┐
│ PR-M.7  feat(server,migrations): Stripe checkout + portal +     │  ~600 LOC, **high risk**
│         webhook handler (idempotent)                            │
│         · apps/server/src/modules/billing/stripe.ts             │
│         · apps/server/src/routes/stripe-webhook.ts              │
│         · Signature-verify middleware                           │
│         · Webhook events handler (5 event-types)                │
│         · ENV: STRIPE_SECRET_KEY etc (optional поки не set)     │
│         · Якщо env не виставлені — endpoints повертають 503    │
│         · Тести з nock-mock Stripe API + webhook fixtures       │
│         · Sentry integration: 5xx у processWebhookEvent → alert │
│         · Prom metric: stripe_webhook_received_total{type,outc} │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ Phase 5 — UI building blocks (паралельно після #5) ────────────┐
│ PR-M.8  feat(web): usePlan hook + PaywallGate + UpgradeBanner   │  ~400 LOC, low risk
│         · apps/web/src/shared/hooks/usePlan.ts                  │
│         · apps/web/src/shared/components/PaywallGate.tsx        │
│         · apps/web/src/shared/components/UpgradeBanner.tsx      │
│         · apps/web/src/shared/components/PaywallCard.tsx        │
│         · billingKeys factory у queryKeys.ts                    │
│         · 95% RTL coverage на 3 компоненти                      │
│         · НЕ підключений ні до яких pages — UI library only     │
│                                                                 │
│ PR-M.9  feat(web): BillingSection in HubSettings                │  ~300 LOC, low risk
│         · apps/web/src/core/settings/BillingSection.tsx         │
│         · "Перейти на Pro" → POST /api/billing/create-checkout  │
│         · "Керувати" → POST /api/billing/create-portal          │
│         · Якщо STRIPE_ENABLED=false — кнопка disabled з tooltip │
│         · 90% RTL coverage                                      │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ Phase 6 — wire up gates (high-risk, рекомендую feature-flag) ─┐
│ PR-M.10 feat(server,web): wire requirePlan() on endpoints +     │  ~500 LOC, **high risk**
│         add PaywallGate to entry-points                         │
│         · server: requirePlan на /sync/push, /coach,            │
│           /weekly-digest, /nutrition/photo-analyze,              │
│           /banks/mono/accounts                                  │
│         · web: PaywallGate на 8 entry-points з §3.6             │
│         · Smoke-e2e: free → paywall → checkout-redirect         │
│         · Smoke-e2e: legacy_grace → bypass paywall              │
│         · ENV: PAYWALL_ENABLED=false як safety-switch (можемо   │
│           moментально вимкнути на проді)                        │
└─────────────────────────────────────────────────────────────────┘

┌─ Phase 7 (поза MVP) ────────────────────────────────────────────┐
│ Pricing page + emails + analytics + LiqPay — окремий roadmap     │
└─────────────────────────────────────────────────────────────────┘
```

**Сума: 10 PR-ів** (без Phase 7 — той окремий sub-roadmap).

---

## 6. Архітектура з cache-invalidation

```
┌─ apps/web ─────────────────────────────────────────────────────┐
│                                                                │
│  usePlan() ──► RQ cache ◄── invalidate ◄── EventSource         │
│       │            ▲              │              │             │
│       │            │              │              │             │
│       └─► GET /api/billing/plan ──┘              │             │
│       └─► GET /api/me/plan-stream (SSE) ─────────┘             │
└──────────────────────────────────────────────────┬─────────────┘
                                                   │
                                                   ▼
┌─ apps/server ──────────────────────────────────────────────────┐
│                                                                │
│  requireSession ─► requirePlan(feature) ─► getUserPlan(userId) │
│       │                    │                    │              │
│       │                    │                    ▼              │
│       │              ┌─────┴─────┐         ┌─planCache(LRU)─┐  │
│       │              │ assertFeat│ ◄────── │ user → plan    │  │
│       │              └───────────┘         └────────────────┘  │
│       │                                          ▲              │
│       │                                          │ delete(uid)  │
│       │                                          │              │
│       │                                    ┌─────┴────────┐    │
│       │                                    │ pg LISTEN    │    │
│       │                                    │ subscription │    │
│       │                                    │ _changed     │    │
│       │                                    └──────┬───────┘    │
│       │                                           │            │
│       ▼                                           ▼            │
│  POST /api/webhooks/stripe (idempotent) ─► UPSERT subscriptions│
│       │                                    └─► pg_notify       │
│       ▼                                                        │
│  stripe_webhook_events (PK=event_id, dedup)                    │
└────────────────────────────────────────────────────────────────┘
```

---

## 7. Risk register

| Ризик                                                         | Ймовірність | Імпакт   | Mitigation                                                                                               |
| ------------------------------------------------------------- | ----------- | -------- | -------------------------------------------------------------------------------------------------------- |
| Webhook signature не verify-иться → fake events               | low         | critical | PR-M.7 hard-fails при відсутності `STRIPE_WEBHOOK_SECRET`; integration test з invalid signature          |
| Webhook duplicate → double-billing period                     | high        | high     | `stripe_webhook_events.event_id PK` + ON CONFLICT DO NOTHING                                             |
| Pro юзер cancel-нув, але cache hold-ить старий план 5 хв      | high        | medium   | NOTIFY-based invalidation < 1s; fallback `staleTime` 60s; manual `Refresh plan` button                   |
| Legacy юзер не отримав grace через bug у migration 011        | low         | high     | Backfill-script `scripts/backfill-grandfather.mjs` як hotfix-tool, тестами зафіксовано на staging        |
| AI ліміт для free (5/day) занадто низький → churn             | medium      | high     | A/B-test на 3/5/10/15. Метрика: `free_to_paid_conversion_rate`. ADR-1.6 rever-able без міграцій          |
| Stripe webhook 5xx → Stripe disable-ить endpoint              | low         | critical | Sentry alert на 3 consecutive 5xx; `stripe_webhook_signature_failed_total` rate alert у Prometheus       |
| Гілка PAYWALL_ENABLED=false випадково true на prod            | medium      | critical | env-вар у `env.ts` zod-schema з обов'язковим `.default(false)` у production env; staging testbed         |
| `legacy_grace` users не побачили banner про закінчення        | high        | medium   | 30/14/3/1 days до `graceUntil` — cron надсилає email + in-app banner                                     |
| Anthropic SDK breaking change → refactor під час monetization | low         | medium   | renovate caches version; integration test із fake Anthropic upstream                                     |
| Database NOTIFY переповнення на масовому events               | low         | medium   | LRU cache TTL 5min є fallback. `pg_notify` payload size limit (8000 bytes) — використовуємо лише user_id |
| Coordinated grandfather rollout не співпадає по timezone      | low         | low      | grace_until в UTC; client рендериться у localTZ через `Intl.DateTimeFormat`                              |

---

## 8. Env-template (повний)

```bash
# Stripe (всі optional поки PAYWALL_ENABLED=false)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_PRO_MONTHLY=price_1...
STRIPE_PRICE_ID_PRO_YEARLY=price_1...
STRIPE_CUSTOMER_PORTAL_RETURN_URL=https://app.sergeant.io/settings/billing
STRIPE_CHECKOUT_SUCCESS_URL=https://app.sergeant.io/settings/billing?status=success
STRIPE_CHECKOUT_CANCEL_URL=https://app.sergeant.io/settings/billing?status=canceled

# Feature flags
PAYWALL_ENABLED=false                    # ← master kill-switch для PR-M.10
GRANDFATHER_GRACE_UNTIL=2026-08-01       # дублює migration 011 для runtime read

# Тарифи (ENV-driven щоб міняти без deploy)
PLAN_FREE_AI_CHAT_PER_DAY=5
PLAN_FREE_AI_PHOTO_PER_DAY=3
PLAN_PRO_TRIAL_DAYS=14
```

---

## 9. CI / Тести

| Тип                          | Фреймворк       | Покриває                                                                                                                                      |
| ---------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (shared)                | Vitest          | `effectivePlan`, `hasAccess`, `featureLimit` — 100% bracket coverage                                                                          |
| Unit (server)                | Vitest          | `getUserPlan` (cache hit / miss / NOTIFY invalidation), `assertFeature`                                                                       |
| Integration (server)         | Testcontainers  | Migration 009/010/011 round-trip, NOTIFY-trigger, webhook-idempotency                                                                         |
| Contract (server↔api-client) | Vitest snap     | `/api/billing/plan` JSON shape ↔ `BillingApi.getPlan()` Zod schema                                                                            |
| Integration (web)            | RTL + MSW       | `usePlan` (free, pro, legacy_grace, loading, error)                                                                                           |
| Component (web)              | RTL             | `PaywallGate` (free → renders PaywallCard, pro → renders children, legacy → children)                                                         |
| E2E (smoke)                  | Playwright      | free → click "Cloud Sync" → see paywall → click "Upgrade" → mock-Stripe redirect → done                                                       |
| Webhook (server)             | nock + fixtures | 5 event-types: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted |
| Idempotency (server)         | Vitest          | Same event.id двічі → ON CONFLICT DO NOTHING → 200 з `{deduplicated: true}`                                                                   |

CI gating per PR (як зараз: `check`, `coverage`, `a11y`, `smoke-e2e`, `Migration lint`, `Secret scan`, `Commit messages`).

---

## 10. Rollout sequence (timing)

| Тиждень | Дія                                                           | Pre-req                 |
| ------- | ------------------------------------------------------------- | ----------------------- |
| 1       | Merge PR-M.0 (ADR), PR-M.1 (shared types)                     | —                       |
| 1       | Merge PR-M.2 (migration 009/010)                              | PR-M.1                  |
| 2       | Merge PR-M.3 (billing module + LISTEN-loop)                   | PR-M.2                  |
| 2       | Deploy → migration 009/010 на проді                           | PR-M.3                  |
| 2       | Merge PR-M.4 (migration 011 grandfather)                      | deploy #3               |
| 2       | Merge PR-M.5 (requirePlan + GET /plan)                        | PR-M.3                  |
| 3       | Merge PR-M.6 (effectiveLimits ↔ plan)                         | PR-M.5                  |
| 3       | Merge PR-M.8 (UI building blocks)                             | PR-M.5                  |
| 3       | Merge PR-M.9 (BillingSection — disabled)                      | PR-M.8                  |
| 4       | Merge PR-M.7 (Stripe webhook + checkout)                      | PR-M.5; STRIPE\_\* env  |
| 4       | Smoke-test на staging з тестовою Stripe-key                   | PR-M.7 deploy           |
| 5       | Merge PR-M.10 (wire up gates)                                 | усе вище; PAYWALL=false |
| 5       | Прод-staging dark-launch (PAYWALL=true для team-only)         | PR-M.10                 |
| 6       | Прод rollout: PAYWALL_ENABLED=true для всіх                   | dark-launch ok          |
| 6+      | Phase 7 (pricing-page, emails, LiqPay) — окрема дорожня карта |

> **Загальна тривалість:** 5-6 тижнів у solo-режимі або 3-4 тижні з 2 паралельними сесіями (PR-M.1 ∥ PR-M.2; PR-M.5 ∥ PR-M.6; PR-M.8 ∥ PR-M.9).

---

## 11. Що **НЕ** входить у MVP (поза 10 PR-ів)

- LiqPay, Mono Acquiring — Phase 7.
- Email-нотифікації (welcome, payment failed, grace expiring) — Phase 7.
- Analytics events (`plan_upgraded`, `plan_canceled`) — Phase 7.
- Pricing page (landing) — Phase 7.
- Multi-currency UI — Phase 7.
- Subscription history audit log — Phase 8.
- Team / family plans — Phase 8.
- Referral / promo codes — Phase 8.
- Refund automation — Stripe Customer Portal handles на MVP.
- Tax invoicing для ФОП — operations, не код.

---

## 12. Anti-checklist (чого **не** робимо)

| Анти-патерн                                               | Чому ні                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Один великий PR з усім (а-ля v1 §3 з 6 PR-ів)             | Code review boundary — `apps/server` контракт ≠ `apps/web` UX, інакше блокується parallel work |
| `current_period_end DEFAULT NOW() + INTERVAL '100 years'` | Antiфпатерн, NULL clearer                                                                      |
| Webhook без `event.id` PK                                 | Гарантований double-spend при retry                                                            |
| `effectiveLimits()` без cache-invalidation                | Canceled Pro → unlimited 5min — користувач cancel-ить підписку і безкоштовно дертить AI        |
| Pro-only CloudSync без grandfather                        | D-day churn для існуючих юзерів                                                                |
| Stripe код у `apps/web`                                   | Secret-key leak ризик. Тільки backend-driven Checkout/Portal                                   |
| Plan-data у localStorage                                  | Source-of-truth тільки сервер. localStorage — лише як TanStack Query persisted-cache           |
| `PAYWALL_ENABLED` без default `.default(false)` в zod     | Production deploy без env → defaults to true → миттєвий incident                               |
