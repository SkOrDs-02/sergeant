# Email-verification soft-gate sweep plan — legacy unverified users

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Active

| Field          | Value                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initiative     | [`0011`](../initiatives/archive/_0011-foundation-adoption-and-process-discipline.md) Phase 3 PR 3.4                                                             |
| Closes         | H6 residual risk: "Legacy users with `email_verified=false` still exist in the prod DB. Switching the global flag to `true` would lock them out."               |
| Cards          | [H6](../security/hardening/H6-email-verification.md), [I8](../security/hardening/I8-periodic-external-pentest.md) (engagement preparation)                      |
| Decision shape | Decision-document — outlines three options, recommends one. Implementation lives in a successor mini-initiative gated on 0010-revenue-first-launch Stripe-MVP.  |
| Owner          | `@Skords-01`                                                                                                                                                    |
| Target window  | Pre-launch Q3 2026 (post-0010 Stripe-MVP, before public marketing-driven traffic). Latest tolerable: 14 days before flipping `REQUIRE_EMAIL_VERIFICATION=true`. |
| Risk           | Low — this PR ships **planning** only. Implementation rollout has its own risk register (§ Risks below).                                                        |

## Чому цей документ існує

[H6](../security/hardening/H6-email-verification.md) було закрито 2026-05-04 у статусі `Closed (partial)`:

- `emailVerification.sendOnSignUp: true` — нові юзери одразу отримують лист.
- `requireVerifiedEmail()` middleware на `/api/mono/connect` — **безумовний** gate, не залежить від `REQUIRE_EMAIL_VERIFICATION`. Squatter→bank-leak ланцюг закритий.
- `REQUIRE_EMAIL_VERIFICATION` env-var — глобальний sign-in gate, default `false`.

Residual risk, що фіксували pen-test sweep 2026-05-06 ([§ H6 — Residual risk](../security/pen-tests/2026-05-hardening-sweep.md#residual-risk-1)):

> Legacy users with `email_verified=false` still exist in the prod DB.
> Switching the global flag to `true` would lock them out.

Без плану soft-gate-у ми маємо два невдалі сценарії:

1. **Залишаємо `REQUIRE_EMAIL_VERIFICATION=false` назавжди.** Sign-in stays soft, account-squatter може зареєструвати `victim@gmail.com` і користуватись features, що **не** мають per-route `requireVerifiedEmail()` gate-у (push subscribe, hub chat, finyk/fizruk/nutrition CRUD).
2. **Flip-нути `true` без sweep-у.** Кожен існуючий legacy-user з `email_verified=false` миттєво втрачає sign-in. Підтримка отримує хвилю «не можу зайти», PostHog показує stand-still-DAU.

Цей документ розписує план, як вийти з `Closed (partial)` у `Closed` до launch-window, тобто закрити residual-ризик без UX-катастрофи.

## Поточний стан (2026-05-20)

| Сигнал                                                     | Значення                                                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `emailVerification.sendOnSignUp`                           | `true` ([`apps/server/src/auth.ts:182-191`](../../apps/server/src/auth.ts))                                                             |
| `emailAndPassword.requireEmailVerification`                | `env.REQUIRE_EMAIL_VERIFICATION` (default `false`, [`apps/server/src/env/env.ts:322-325`](../../apps/server/src/env/env.ts))            |
| `requireVerifiedEmail()` middleware                        | Wired лише на `POST /api/mono/connect` ([`apps/server/src/routes/mono-webhook.ts:70-75`](../../apps/server/src/routes/mono-webhook.ts)) |
| Legacy users (`email_verified=false` на 2026-05-04 момент) | **Не виміряно** — потребує `SELECT COUNT(*) FROM "user" WHERE "emailVerified" = false` на prod read-replica. Tracked як Phase 0 нижче.  |
| `VerifyEmailGate` UI banner                                | Не існує. Згаданий у H6 § Deferred як «коли лендить — drop `requireVerifiedEmail()` на похідні route-и».                                |
| Reminder-email cadence                                     | Не існує. Лише `sendOnSignUp` один лист. Resend → `auth-mail` BullMQ queue вже піднята, є інфраструктура для додаткових емейлів.        |
| `REQUIRE_EMAIL_VERIFICATION` в prod (Railway)              | `false` (підтверджено A1 audit 2026-05-06 — `docs/audits/archive/2026-05-04-csp-disable-retrospective.md` § Resolution log)             |

## Threat model recap

Атака, від якої захищаємось — той же scenario, що й H6 ([H6 § Impact](../security/hardening/H6-email-verification.md#impact)):

1. Squatter реєструється `victim@gmail.com`, ставить пароль.
2. Legitimate owner пізніше намагається зареєструватись → `email already exists`.
3. Squatter тримає акаунт, чекає на момент, коли legit-owner попросить password-reset (через лист на `victim@gmail.com`, який все ще під його контролем).

`/api/mono/connect` уже закритий від цього: squatter без `email_verified=true` не може під'єднати банк. Але residual surface:

- **Push subscribe** (`POST /api/push/subscribe`) — squatter може отримати notifications, що адресовані legit-owner-у після того, як той «recover»-нув акаунт через password-reset через verification-link.
- **Hub chat / coach / digest CRUD** — squatter може створити state, який successful-recovery legit-owner-а побачить як «свій» (squatter-poisoning).
- **Finyk / fizruk / nutrition CRUD** — те саме: state-poisoning перед recovery.

Сила атаки прямо корелює з тим, чи `requireEmailVerification` (sign-in gate) `true`. Якщо `true` — squatter навіть не зайде. Якщо `false` — він всередині та може писати state, доки legit-owner не recover-ить (verification email passes ownership-check, але squatter може встигнути написати state).

## Опції

### Опція 1 — Soft-gate banner з 14-денним deadline + reminder cadence (рекомендована)

Як працює:

1. **Phase A — Baseline measure.** `SELECT COUNT(*) FROM "user" WHERE "emailVerified" = false GROUP BY (created_at < '2026-05-04')` — рахуємо скільки існує legacy-без-верифікації акаунтів. Не запускаємо нічого, поки не знаємо абсолютне число.
2. **Phase B — Banner.** `<VerifyEmailGate />` у hub root layout (`apps/web/src/modules/hub/layout/`):
   - Видимий лише коли `useSessionQuery().data?.emailVerified === false`.
   - Tier 1 (day 0…7): жовтий warning-banner з кнопкою «Надіслати лист повторно» → `POST /api/auth/send-verification-email` (Better Auth endpoint).
   - Tier 2 (day 8…14): червоний banner + modal на запуску (`<VerifyEmailGate.HardModal />`) з countdown.
   - Tier 3 (day 15+): full-screen takeover «акаунт заблоковано до підтвердження email» з тим самим resend-CTA.
3. **Phase C — Email cadence.** 3 reminder-листи через існуючу `auth-mail` BullMQ-чергу:
   - Day +1: «Ваш email ще не підтверджено. Перейдіть за лінком, дійсно 7 днів».
   - Day +7: «4 дні до блокування акаунту».
   - Day +13: «Завтра ми тимчасово обмежимо вхід».
4. **Phase D — Sign-in soft-block.** Day 15+: новий per-user `forceVerifyAt: timestamp` колонка у `"user"` table. Better Auth sign-in hook читає колонку, якщо `forceVerifyAt < NOW() AND emailVerified = false` → повертаємо `403 EMAIL_VERIFICATION_REQUIRED` навіть якщо `REQUIRE_EMAIL_VERIFICATION=false`. Це **per-user**, тож global env-флаг лишається `false` доти, доки 80%+ legacy-юзерів не verify-нуться.
5. **Phase E — Global flip.** Коли verified-rate ≥ 80% (вимір через PostHog event `email_verified` count proxied на DB count via nightly cron), flip `REQUIRE_EMAIL_VERIFICATION=true` через Railway env-update + standard staging-verification per [`docs/playbooks/deploy-config-change.md`](../playbooks/deploy-config-change.md).

Pros:

- Кожен legit user отримує fair window + 3 reminders. Підтримка отримує очікувану крапку «day 15 — починаються тікети», а не випадковий вибух.
- Squatter або бойовий-deadweight (зареєстрований і покинутий) автоматично tap-аються після day 15 без manual intervention.
- Reversibility сильна: відключити banner — flip feature-flag; відключити soft-block — DROP column.
- Per-user `forceVerifyAt` — стандартний pattern для gradual-rollout, не покладається на server env-флаг.

Cons:

- Per-user state to track (`forceVerifyAt` колонка + migration + Better Auth sign-in hook patch). Нетривіальна реалізація — ~3 робочих дні.
- Email cadence потребує idempotency на BullMQ producer-side (вже є для `auth-mail`, але потрібно verify-ти на `email_verification_reminder` job-типі).
- 14 днів — інтуїтивне число, не data-driven. Якщо PostHog покаже, що 90% legacy-юзерів logging-in-яться рідше за 30 днів, треба буде розтягнути window.

### Опція 2 — Gradual flag flip через per-user deterministic hash

Як працює:

1. Нова env `EMAIL_VERIFICATION_ROLLOUT_PERCENT: 0..100` (default `0`).
2. Sign-in hook: `hash(user.id) % 100 < EMAIL_VERIFICATION_ROLLOUT_PERCENT` → застосовуємо `requireEmailVerification: true` лише до цього юзера.
3. Поступово піднімаємо percent: `10` → `25` → `50` → `100` з тижневим observability-вікном.

Pros:

- Просто інженерно (одна env, hash, hook).
- Hard cutover для покритих юзерів — або вони verify-яться, або не зайдуть.
- Не потребує DB міграції.

Cons:

- **Не дає reminder cadence-у.** Юзер з cohort-у, який раптом потрапив у `< 10%`, побачить `403` без жодного попередження. Підтримка отримає вибух, бо UX-flow «з нічого тобі заборонили».
- Hash-based cohort = неможливо контрольовано виключати конкретного юзера (наприклад, support sees ticket «не можу зайти», нема знеболюючого `forceVerifyAt = null` rollback per user).
- Якщо legit-user поза cohort-ом досі може sign-in без верифікації — той же squatter-attack-vector лишається відкритим **для цієї частини user-base**, що знецінює всю sweep-операцію.

### Опція 3 — Лише resend-CTA на login flow (status quo+)

Як працює:

1. На `<SignInForm>` додаємо «Не отримали лист? Надіслати повторно».
2. Жодного soft-block, жодного reminder cadence, жодного global flip.

Pros:

- Нульова інженерна вартість (≤ 1 day).
- Жодного UX-disruption-у.

Cons:

- **Не вирішує residual risk-у.** Squatter-attack-vector лишається. H6 ніколи не зможе вийти з `Closed (partial)` у `Closed`.
- I8 (periodic external pen-test) повторно flag-не той самий gap у наступному квартальному engagement-і.

## Рекомендація

**Опція 1 — soft-gate banner з 14-денним deadline.** Причини:

1. **Закриває H6 residual risk.** Опція 2 — лише частково; опція 3 — взагалі ні.
2. **Reversibility.** Banner — feature-flag; soft-block — `forceVerifyAt = null` per user; global flip — env-var. Кожна фаза має explicit rollback.
3. **Передбачуваний support-load.** Опція 2 даватиме випадкові «не можу зайти» з різних дат; опція 1 — гарантує, що тікети приходять у вузькому вікні (day 15 +/- 2) для кожної cohort-и legacy-юзерів. Підтримка може заздалегідь готувати канонічні відповіді.
4. **Реалістично за 1 sprint.** Phase A (baseline) — 1 day. Phase B (banner) — 2 days. Phase C (email cadence) — 1 day. Phase D (sign-in soft-block) — 2 days. Phase E (global flip) — 5 min ops-операція. Загалом ~6 робочих днів = 1 sprint. Без 0010-launch блокування.

## Implementation plan (післяласунчевий, мікро-ініціатива)

> Цей doc — не implementation plan, це decision-doc. Implementation відкриється окремою мікро-ініціативою (`0011a-email-verification-sweep.md` або incorporated у [`0010-revenue-first-launch`](../initiatives/0010-revenue-first-launch.md) Phase 4 post-launch hardening, рішення — за `@Skords-01`).

| Фаза | Скоуп                                                        | Surface(s)                                        | Effort | Gate                                                              |
| ---- | ------------------------------------------------------------ | ------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| A    | Baseline вимір legacy-users count                            | DB query на read-replica                          | 1 day  | _none_ (read-only)                                                |
| B    | `<VerifyEmailGate />` banner у hub layout                    | `apps/web/src/modules/hub/layout/`                | 2 days | A complete; PostHog event `email_verified_banner_shown` works     |
| C    | Reminder cadence (day +1, +7, +13) через `auth-mail` BullMQ  | `apps/server/src/modules/auth/email-reminders.ts` | 1 day  | B complete; staging Resend account receives test sends            |
| D    | `forceVerifyAt` колонка + Better Auth sign-in hook patch     | `apps/server/src/auth.ts`, новий migration NNN    | 2 days | C complete; integration test покриває soft-block scenario         |
| E    | Global flip `REQUIRE_EMAIL_VERIFICATION=true` у Railway prod | env-update via Railway dashboard                  | 5 min  | D complete; verified-rate ≥ 80% (≥ 14 days після Phase D rollout) |

ETA повного циклу: ~6 робочих днів implementation + 14+ днів observation-вікно = **3 тижні calendar-time** від старту до Phase E.

## Decision gates

- **Decision date:** не пізніше 2026-08-31 (за 30 днів до Q3-launch-target 2026-09-30, бо повний cycle = 3 тижні).
- **Approve who:** `@Skords-01` (founder).
- **Pre-implementation review:** transcript обговорення (async на GH-issue), де команда вибирає Опцію 1 / 2 / 3 explicitly. Якщо вибрано **не Опцію 1** — оновіть цей doc до запуску implementation.
- **Roll-back trigger після Phase D:**
  - > 5% support tickets за 7 днів з ключовою фразою «не можу зайти» / «акаунт заблоковано».
  - АБО drop у DAU > 10% з [PostHog FTUX dashboards](../03-operations/observability/posthog-ftux-dashboards.md) activation-cohort.
- **Roll-back action:** `UPDATE "user" SET "forceVerifyAt" = NULL` (бо колонка все-таки залишається у схемі — це не data-loss).

## Ризики

| Ризик                                                                                                              | Імовірність | Імпакт   | Митиґація                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy-юзер не відкриває жоден з 3 reminder-листів і вперше дізнається про блок на day 15                          | висока      | низький  | Banner у hub з day 0 дає in-app сигнал паралельно з email cadence; full-screen takeover на day 15+ робить блок очевидним                                   |
| Resend / `auth-mail` queue має тимчасовий outage в day +1 / +7 / +13 → юзер не отримує reminder                    | низька      | середній | Idempotent BullMQ producer на `email_verification_reminder` тип-job-у з `dedupKey = userId+phase`; retry policy через існуючу infrastruct                  |
| Squatter верифікує email (бо реально володіє ним як `victim@gmail.com` через інший fraud) — soft-gate не допомагає | низька      | високий  | Це поза скоупом цього sweep-у; mitigation — anti-fraud signal на sign-up (PR-плани, не у цьому документі)                                                  |
| 80% verified-rate threshold недосяжний (наприклад, 60% legacy-юзерів deadweight)                                   | середня     | середній | Тоді global flip триггериться по `time-out` rule: 60 days після Phase D rollout flip-аємо незалежно від rate-у. Сабреш ув'язана у Decision gate `time-out` |
| Per-user `forceVerifyAt` колонка вимагає DB migration; Hard Rule #4 — sequential numbering, two-phase для DROP     | середня     | середній | Стандартний flow — нова migration, no DROP needed; rollback = `UPDATE` not `ALTER`                                                                         |
| `<VerifyEmailGate />` UI banner ламає mobile-layout у hub                                                          | середня     | низький  | Phase B PR має RTL + a11y тести (per Hard Rule #14 focus-visible); manual smoke на iPhone SE / iPad / desktop                                              |

## Що **не** в скоупі цього документа

- **OAuth-only users** (Google / Apple sign-in). У них `email_verified` ставиться провайдером, тож вони автоматично у статусі `true`. Sweep торкається лише `emailAndPassword` flow.
- **Password-change endpoint gate.** H6 § Deferred згадує, що коли з'явиться `/api/auth/password` (а не Better Auth internal), drop-аємо `requireVerifiedEmail()` middleware у chain. Це окремий tracker, не залежить від sweep-у.
- **Push subscribe gate.** H6 § Deferred оцінює push як low-impact (per-device, no cross-account exposure). Якщо anti-fraud signal покаже інше — окремий PR.
- **Per-user verification-email rate-limit (1/min, 6/h, 24/24h).** H6 § Deferred — revisit коли `<VerifyEmailGate />` UI лендить (Phase B), бо саме воно exposed-ить «Resend» button назовні. Tracked окремим item-ом, не блокує sweep.
- **External pen-test engagement (I8).** Sweep — internal hardening, не engagement з зовнішнім pen-tester-ом. Engagement має власний tracker у [`docs/security/hardening/I8-periodic-external-pentest.md`](../security/hardening/I8-periodic-external-pentest.md).

## Cross-references

- H6 card: [`docs/security/hardening/H6-email-verification.md`](../security/hardening/H6-email-verification.md)
- Pen-test sweep transcript (2026-05): [`docs/security/pen-tests/2026-05-hardening-sweep.md`](../security/pen-tests/2026-05-hardening-sweep.md)
- Pen-test playbook: [`docs/playbooks/security-pen-test-checklist.md`](../playbooks/security-pen-test-checklist.md)
- Better Auth wiring: [`apps/server/src/auth.ts`](../../apps/server/src/auth.ts)
- Initiative 0011: [`docs/initiatives/archive/_0011-foundation-adoption-and-process-discipline.md`](../initiatives/archive/_0011-foundation-adoption-and-process-discipline.md)
- Initiative 0010 (revenue-first launch, sets the launch-window): [`docs/initiatives/0010-revenue-first-launch.md`](../initiatives/0010-revenue-first-launch.md)
- Deploy-config-change playbook (для Phase E env flip): [`docs/playbooks/deploy-config-change.md`](../playbooks/deploy-config-change.md)
- Launch readiness checklist (sweep — evidence для readiness gate): [`docs/launch/business/04-launch-readiness.md`](./business/04-launch-readiness.md)
