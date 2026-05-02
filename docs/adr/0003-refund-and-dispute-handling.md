# ADR-0003: Refund and dispute handling

- **Status:** proposed
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/adr/0001-monetization-architecture.md`](./0001-monetization-architecture.md) — ADR-1.1 (Stripe primary), ADR-1.8 (webhook event-id retention), ADR-1.11 (cancel-at-period-end).
  - [`docs/launch/01-monetization-and-pricing.md`](../launch/01-monetization-and-pricing.md) — тіри і ціни (Pro ₴99/міс, ₴799/рік).
  - [`docs/launch/06-monetization-architecture.md`](../launch/06-monetization-architecture.md) — risk register #8 («нічого про refund / proration»).

---

## 0. TL;DR

ADR-0001 явно винісь refund / dispute flow в окремий ADR (див. ADR-1.11
"Alternatives considered"). Це launch-blocker, бо: (а) Stripe Dashboard за
замовчуванням приймає disputes на наш банк-рахунок без жодної реакції з боку
app — Pro у юзера лишається активним, навіть якщо платіж вже відкликано; (б)
без явної політики повернень ми порушуємо вимоги Stripe Standard Acceptable
Use Policy (refund policy має бути доступна юзеру **до** оплати); (в) при ціні
Pro ₴99/міс (~$2.30) комісія Stripe за один dispute (€15) повністю з'їдає
6 місяців оплати — політика чисто-grace для disputes економічно нестійка.

| Сценарій                       | Тригер                                    | Дія                                                                                                                            |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Voluntary refund (≤14 днів)    | юзер пише в support                       | Manual у Stripe Dashboard → `charge.refunded` webhook → `cancel_at_period_end=true` + `cancellation_reason='refund_requested'` |
| Voluntary refund (>14 днів)    | юзер пише в support                       | Default: відмова. Exception: на розсуд founder-а; manual partial у Stripe Dashboard.                                           |
| Pro-rata downgrade             | юзер сам у Customer Portal                | Stripe не робить proration refund; ADR-1.11 → `cancel_at_period_end=true`, без refund.                                         |
| Dispute / chargeback           | `charge.dispute.created` webhook          | Авто: `subscriptions.status='disputed'`, `plan='free'` миттєво. Stripe борониться сам, ми не беремо участь.                    |
| Dispute won                    | `charge.dispute.closed`, status=`won`     | Авто: відновлюємо `plan='pro'` до `current_period_end`.                                                                        |
| Dispute lost                   | `charge.dispute.closed`, status=`lost`    | Юзер блокується від нового sign-up на 90 днів за email + IP-fingerprint (anti-fraud, ADR-1.5 link).                            |
| Refund після upgrade/downgrade | `customer.subscription.updated` proration | Stripe сам нараховує credit; ми просто reflect.                                                                                |

---

## ADR-3.1 — Канонічний refund-flow на MVP: manual через Stripe Dashboard

### Status

accepted.

### Context

Українські юзери, які платять за SaaS вперше, очікують російсько/англомовний
"refund within 14 days" як неявний контракт (це і дефолт у Stripe Customer
Portal через Tax-помічника, і норма EU consumer law). Сергеант ціль на ринок,
де SaaS-підписки в принципі непривабливі — будь-яке тертя на refund-flow
збільшує негативний WoM сильніше за саму вартість невдалого refund-у.

Реалізаційно є три варіанти:

1. **In-app self-service refund button.** Юзер сам тисне «Refund my last
   payment», ми викликаємо Stripe API → `refunds.create({ payment_intent })`.
   Найкращий UX, але: (а) дуже легко зловживати при ціні ₴99 (юзер платить,
   використовує 13 днів безлімітних AI-запитів, refund-ить, повторює — anti-
   fraud складний); (б) без legal review ризик violation Stripe ToS, бо
   підписки з `automatic` refund flow вимагають explicit "refund policy" у
   Customer Portal.

2. **Manual у Stripe Dashboard на запит юзера в support.** Founder сам
   натискає `Refund` у Stripe Dashboard, webhook `charge.refunded`
   реактивно деактивує Pro. Жодного UI, жодного backend-коду на запис —
   лише webhook-handler на читання.

3. **Voucher/credit замість refund.** Замість грошей — кредит на наступний
   період. Stripe підтримує customer balance, але це додає окремий код у
   паттерн `requirePlan` middleware, бо balance не еквівалентний `plan='pro'`.

### Decision

**MVP: manual у Stripe Dashboard.** Юзер пише в `support@sergeant.app`, founder
протягом 24 годин або робить refund у Stripe Dashboard, або відмовляє з
посиланням на refund policy.

Webhook `charge.refunded` (з ADR-1.8 idempotency table) реактивно ставить:

```ts
await pool.query(
  `UPDATE subscriptions
     SET cancel_at_period_end = true,
         cancellation_reason = 'refund_requested'
     WHERE provider_subscription_id = $1`,
  [event.data.object.subscription],
);
```

Тобто з точки зору plan-cache (ADR-1.3) це поведінково ідентично штатному
скасуванню з ADR-1.11: Pro до кінця оплаченого періоду, потім `free`. Що
очевидно неоптимально (юзер отримав refund — мав би одразу втратити Pro),
але:

- Refund-ів очікуємо <0.5%/тиждень при ₴99 ціні; деякі Pro-фічі (Monobank
  auto-sync, експорт) не критичні до 24h grace.
- В альтернативі (миттєва деградація після refund) ми робимо складний race
  з ADR-1.11 (`cancel_at_period_end=true`): юзер може за один цикл дати
  refund, потім resume, потім скасувати — кожен webhook коригує `plan` поле,
  legacy state накопичується.
- Auto-immediate-deactivation реалізуємо у Phase 2, коли буде
  `subscription_events` audit log (ADR-1.2 — "follow-up").

### Consequences

**Позитивні:**

- Нуль coding effort на MVP. Founder = single point of approval.
- Anti-fraud за замовчуванням: founder бачить контекст (як давно юзер,
  чи юзер реально використовує продукт, чи це boilerplate-скарга з
  email +1).
- Refund policy документ один — той, що в `docs/launch/legal/refund.md`
  (TBD; писати разом з Privacy Policy).

**Негативні:**

- 24h SLA на support — хто його закриває коли founder спить? Документуємо
  у `docs/launch/05-operations-and-automation.md` як "support manual,
  best-effort 24h"; не SLA-обіцянка.
- Юзер після refund-у залишається Pro до кінця оплаченого періоду — це
  trade-off на користь simplicity.
- Якщо webhook `charge.refunded` втратиться (Stripe at-least-once, але
  edge-cases є), юзер бачить статус "Pro" без правдивої підписки до
  наступного `customer.subscription.updated`. Mitigation: ADR-1.8
  idempotency-tabel дозволяє reconcile-job у Phase 2 (порівняти Stripe
  charges за останні 30 днів з `subscriptions.cancellation_reason`).

### Alternatives considered

- **Self-service refund button (варіант 1):** відкинуто на MVP через
  fraud-ризик і брак legal review. Повертаємось коли буде > 200 платних
  юзерів і refund-rate стабільно <2%.
- **Voucher/credit (варіант 3):** відкинуто через додаткову складність у
  `requirePlan` middleware і UI потребує зміни Customer Portal (Stripe
  Customer Portal не показує balance за замовчуванням). Розглянемо коли
  буде ad-hoc upsell-флоу (Phase 4).

---

## ADR-3.2 — Dispute / chargeback: миттєва деградація + 90-day fraud block

### Status

accepted.

### Context

Stripe Dispute = юзер оспорює платіж у свого банку (chargeback). Stripe знімає
з нашого Stripe-balance суму платежу + dispute fee (€15 для EU), і ми маємо
~7 днів на evidence submission. У 80% disputes за low-cost SaaS банк юзера
виграє автоматично — evidence збирати недоцільно.

Проблема: за замовчуванням dispute не змінює статус `subscription` у Stripe
(юзер досі бачиться як `active`, бо щомісячна payment_intent пройшла).
Тобто без webhook-handler-а ми надаємо Pro юзеру, який вже забрав свої гроші
назад через банк. Цей бекдор — найдорожчий abuse-vector у low-cost SaaS.

Друга проблема: юзер, який disputed, може зареєструватися знову (інший email,
та сама картка), пройти free-trial → Pro → dispute → repeat. Stripe Radar
блокує це частково (картка маркується), але email — наша відповідальність.

### Decision

**На `charge.dispute.created` миттєво деактивуємо Pro і блокуємо юзера від
re-signup на 90 днів (за email + IP-fingerprint).**

Webhook handler:

```ts
// apps/server/src/modules/billing/webhook.ts (Phase 2)
case "charge.dispute.created": {
  const sub = event.data.object.subscription;
  await pool.query(
    `UPDATE subscriptions
       SET status = 'disputed',
           plan = 'free',
           cancel_at_period_end = true,
           cancellation_reason = 'dispute'
       WHERE provider_subscription_id = $1`,
    [sub]
  );
  await pool.query(
    `INSERT INTO fraud_blocklist (email, ip_fingerprint, reason, expires_at)
       VALUES ($1, $2, 'dispute', NOW() + INTERVAL '90 days')
       ON CONFLICT (email) DO UPDATE
         SET expires_at = GREATEST(fraud_blocklist.expires_at,
                                    EXCLUDED.expires_at)`,
    [user.email, user.lastIpFingerprint]
  );
  break;
}

case "charge.dispute.closed": {
  if (event.data.object.status === "won") {
    // Banks rarely rule for the merchant on low-cost SaaS, але якщо так —
    // відновлюємо Pro і знімаємо fraud block.
    await reinstatePro(event.data.object.subscription);
    await unblockFraud(user.email);
  }
  // status === 'lost' | 'warning_closed' — нічого не робимо, юзер вже
  // деактивований з `dispute.created` і fraud-block на 90 днів стоїть.
  break;
}
```

`fraud_blocklist` перевіряється на signup і на повторну активацію Pro:

```ts
// apps/server/src/auth.ts — Better Auth signup hook (Phase 2)
emailAndPassword: {
  beforeSignUp: async ({ email, request }) => {
    const ipFp = ipFingerprint(request);
    const blocked = await pool.query(
      `SELECT 1 FROM fraud_blocklist
         WHERE (email = $1 OR ip_fingerprint = $2)
           AND expires_at > NOW()`,
      [email, ipFp]
    );
    if (blocked.rows.length > 0) {
      throw new BetterAuthError("Account creation temporarily unavailable");
    }
  },
},
```

### Consequences

**Позитивні:**

- Dispute не повертається у Pro мовчки. Найдорожчий abuse-vector
  закритий до запуску, не post-mortem.
- 90-day window — стандартна industry-практика (PayPal, Stripe Radar
  defaults). Достатньо, щоб шахрайські cohort-и розпались.
- `fraud_blocklist` як окрема таблиця (не флаг на `user`) дозволяє
  retention-policy: cron видаляє рядки з `expires_at < NOW()` без
  торкання основного `user`-простору. Сумісно з ADR-0016 (PII
  retention).

**Негативні:**

- False-positive: якщо юзер dispute-ить за помилку банку (а не fraud),
  90-day block для нього незаслужений. Manual override через support.
- IP-fingerprint = (`/16` IPv4 prefix + UA hash) — груба евристика;
  спільна Wi-Fi мережа теоретично може блокнути сусіда. Acceptable на
  MVP при low-volume.
- `fraud_blocklist` зберігає `email` plain-text — це PII. ADR-0016
  retention-policy має це покрити (delete-after-90-days вже є в `expires_at`).

### Alternatives considered

- **Не блокувати re-signup, лише деактивувати Pro:** відкинуто, бо
  dispute-and-resignup це найпоширеніший fraud pattern у low-cost SaaS
  (юзер платить ₴99, використовує безлімітні AI-запити на $5+, dispute-ить,
  створює новий акаунт з тих самих pixels).
- **Збирати evidence для disputed-charges:** відкинуто на MVP. ROI на
  evidence-збір для ₴99 платежу ≈ -$30 (зарплата founder-а на годину
  evidence-збору > потенційний return). У Phase 4 (>500 paid users) —
  evidence-template через Stripe Dashboard.
- **Lifetime ban після dispute:** надто агресивно для false-positive
  кейсів. 90 днів — компроміс.

---

## ADR-3.3 — Що НЕ робимо на MVP (out of scope)

### Status

accepted.

### Decision

Цей ADR явно **не** покриває:

- **Pro-rated refund при downgrade.** ADR-1.11 фіксує: `cancel_at_period_end=true`,
  без proration refund. Якщо юзер апгрейдиться mid-period, Stripe сам
  нараховує credit (через `customer.subscription.updated`) — це reflect-имо у
  `subscriptions` row, не дублюємо логіку.
- **In-app refund button.** Phase 2+. Бачимо потребу при refund-rate > 2%/місяць.
- **Refund policy document.** Окремий артефакт у `docs/launch/legal/refund.md`
  (TBD), писати разом з Privacy Policy і Terms of Service. Цей ADR описує
  технічний flow, не legal text.
- **Multi-currency refund-ів.** UAH only на MVP (ADR-1.9). USD/EUR refund-flow
  розглянемо у Phase 7.
- **Refund-метрики.** `stripe_refunds_total{reason}` і
  `stripe_disputes_total{outcome}` — додамо у PR-M.7 (Stripe webhook). Без них
  не побачимо trend і відмов-rate.

---

## Open questions

1. **Hard SLA на support refund-запити?** Зараз "best-effort 24h". Якщо
   refund-rate >1%/тиждень — SLA треба формалізувати (24h business-day,
   pause на weekend?). Reopen після першого місяця.
2. **`fraud_blocklist` migration.** Окрема міграція `011_fraud_blocklist.sql`
   у PR-M.7? Чи разом з `subscriptions`-table? Вирішуємо при PR-розбивці
   PR-M.7.
3. **Customer balance як альтернатива refund?** Stripe підтримує customer
   balance — можна замість refund-у нарахувати credit на наступний цикл.
   Менше тертя для returning-юзерів. Reopen якщо побачимо ≥30% refund-ів
   "хочу скасувати, але повернуся" (типовий churn-recovery кейс).
