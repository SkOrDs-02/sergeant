# Sergeant — Launch phases plan-guide

> **Last validated:** 2026-05-13 by Devin (parent synthesis of 4 paralel child-sessions).
> **Next review:** 2026-08-11.
> **Status:** Active — draft master plan-guide for sequencing launch with real users.

> Цей файл — **master synthesis** трьох послідовних фаз запуску Sergeant з реальними юзерами:
> Web (Phase 1) → Capacitor (Phase 2) → Native Expo (Phase 3).
>
> Кожна фаза має окремий детальний документ у цьому піддереві. Тут — TLDR, тижневий
> критичний шлях через усі фази, лендінг-рішення, консолідовані блокери та open questions.
>
> **Це не нова стратегія**, а зшивання вже існуючих документів (`business/`, `product-os/`,
> ADRs, initiatives, playbooks) у послідовний execution-план для solo-founder + Devin-агентів.

---

## Зміст

1. [TL;DR](#1-tldr)
2. [Як читати цей файл](#2-як-читати-цей-файл)
3. [Де ми зараз (snapshot)](#3-де-ми-зараз-snapshot)
4. [Три фази на одному екрані](#4-три-фази-на-одному-екрані)
5. [Рішення про лендінг](#5-рішення-про-лендінг)
6. [Критичний шлях (week-by-week, W-4 .. W+24)](#6-критичний-шлях-week-by-week)
7. [Top-10 блокерів](#7-top-10-блокерів)
8. [Open questions для founder-а](#8-open-questions-для-founder-а)
9. [Top ризики + mitigation](#9-top-ризики--mitigation)
10. [Що робити в найближчі 7 днів](#10-що-робити-в-найближчі-7-днів)
11. [Cross-refs](#11-cross-refs)

---

## 1. TL;DR

Sergeant фактично **технічно деплоїться у прод**: `apps/web` живе на Vercel, `apps/server` —
на Railway, Capacitor-shell (`apps/mobile-shell`) має повний AAB+APK release-pipeline для
Android і scaffold для iOS, native Expo (`apps/mobile`) — internal dev-client. **Public launch
заблокований не кодом, а legal-/billing-/landing-/store-шарами**: немає опублікованих
Privacy Policy + ToS, Stripe-білінг в роботі (initiative 0010 phase 2–4), Apple/Google
SSO не залитий, Apple Developer Program не куплений, окремого лендінгу не існує.

**Рекомендована послідовність:**

1. **Phase 1 — Web (W-4 .. W+12).** Closed beta 10–30 інвайт-only тестерів зараз
   ([Path C](./01-web-launch-with-users.md): запуск як 100% free, paywall defer
   до Phase 2). Soft public 500–2000 юзерів через 4–6 тижнів. Лендінг — **гібридна
   опція C**: швидкий single-page Astro на `sergeant.com.ua` поруч з
   `app.sergeant.com.ua` (PWA), повноцінний marketing-сайт лишаємо на post-launch.
2. **Phase 2 — Capacitor (W+8 .. W+16).** TestFlight + Play Internal на 5–10 internal
   тестерів через 2 тижні після public web, Closed Beta 50–150 testers ще через 2 тижні,
   staged production rollout ще через 2 тижні. Apple Developer enrollment треба стартувати
   **на тижні W+2** через D-U-N-S delay.
3. **Phase 3 — Native (Expo) — за поточним станом НЕ запускати окремо у цьому циклі.**
   ADR-0052 фіксує Capacitor як primary; native parity-gap ≈ 7–10 тижнів для однієї
   людини, 0 paying users → dual-track економічно нежиттєздатний. Через 2–3 спринти
   після Capacitor production rollout — **decision gate**: Сценарій A (sunset
   `apps/mobile`) або Сценарій C (Native як next-gen replace Capacitor).

**Native не блокує launch.** Capacitor закриває mobile-need для перших 1–2K юзерів.

---

## 2. Як читати цей файл

| Питання                                                             | Документ                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Що готово, а що блокує запуск (з фактичних cross-refs у код)?       | [00 — Readiness audit](./00-readiness-audit.md)                                                        |
| Як саме запустити web з реальними юзерами (W-4 .. W+12)?            | [01 — Web launch with users](./01-web-launch-with-users.md)                                            |
| Як підключати реальних бета-тестерів через TestFlight / Play?       | [02 — Capacitor launch](./02-capacitor-launch.md)                                                      |
| Чи варто взагалі запускати окремо `apps/mobile` (Native Expo)?      | [03 — Native Expo launch](./03-native-expo-launch.md)                                                  |
| Чи треба окремий лендінг (sergeant.com.ua) чи можна без нього?      | [§ 5 нижче](#5-рішення-про-лендінг) + [01 — Web § 2](./01-web-launch-with-users.md#2-лендінг-decision) |
| Які фази launch-у і що робити на кожній (high-level GTM, без коду)? | [02 — GTM](../business/02-go-to-market.md)                                                             |
| Що треба юридично / по readiness checklist?                         | [04 — Launch readiness](../business/04-launch-readiness.md)                                            |
| Який стан FTUX-онбордингу (PR registry, відкриті проблеми)?         | [FTUX master tracker](../product-os/ftux-master-tracker.md)                                            |
| Архітектурний контекст: web ↔ shell ↔ RN feature parity?            | [architecture/platforms.md](../../architecture/platforms.md)                                           |

> **Конвенція цього піддерева:** `00-..03-` — це **fixed sequence** (audit → web → Capacitor → native).
> Інакше ніж у `business/01-..06-`, де milestones, тут — **execution phases** з вхідними/вихідними
> критеріями і явним cross-phase handoff.

---

## 3. Де ми зараз (snapshot)

**Source of truth:** [00 — Readiness audit](./00-readiness-audit.md). Тут — короткий зріз.

| Поверхня                        | Deploy?                                                         | Auth?                               | Observability?                       | Release playbook?                                                                                              | Real-user tested?          | Найбільший блокер                                                                         |
| ------------------------------- | --------------------------------------------------------------- | ----------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/web`                      | ✅ prod Vercel                                                  | ✅ email+password (no Apple/Google) | ✅ Sentry+PostHog+CSP-RO             | ✅ [release.md](../../playbooks/release.md) + [release-web-and-api.md](../../playbooks/release-web-and-api.md) | 🟡 internal+demo only      | Legal pages (Privacy/ToS); Apple/Google SSO; Stripe                                       |
| `apps/server`                   | ✅ prod Railway (Dockerfile.api)                                | ✅ Better Auth bearer/cookie        | ✅ Pino+Prom+Sentry+alert-bot        | ✅ [release-web-and-api.md](../../playbooks/release-web-and-api.md)                                            | 🟡 internal only           | Stripe billing tables (subscriptions, stripe_webhook_events)                              |
| `apps/mobile-shell` (Capacitor) | 🟡 Android AAB/APK CI ready, iOS CI scaffold (no Apple secrets) | ✅ bearer reuses web                | ✅ Sentry WebView                    | ✅ [release-mobile-shell.md](../../playbooks/release-mobile-shell.md)                                          | ❌ no external testers yet | Apple Developer enrollment ($99 + D-U-N-S); store metadata + assets                       |
| `apps/mobile` (Expo)            | ❌ internal dev-client only                                     | ✅ bearer                           | 🟡 Sentry+PostHog wired, no prod DSN | ✅ [release-expo-mobile.md](../../playbooks/release-expo-mobile.md)                                            | ❌ no external testers     | EAS prod profile lock; Apple/Google accounts; Nutrition Phase 7 (recipes AI, photo-AI) 🟥 |
| Landing site                    | ❌ немає окремого                                               | n/a                                 | n/a                                  | n/a                                                                                                            | n/a                        | Рішення: окремий сайт vs `/welcome`-only (див. § 5)                                       |

**Ключові ADRs / initiatives:**

- [ADR-0052](../../adr/0052-mobile-strategy-capacitor-primary.md) — Capacitor PRIMARY до Expo parity (Accepted 2026-05-06)
- [ADR-0051](../../adr/0051-pricing-v3-single-tier.md) — Free + Pro $7/міс / $49/рік, UAH UA-only на старті
- [Initiative 0010](../../initiatives/0010-revenue-first-launch.md) — revenue-first sprint (Stripe billing у Phase 2-4)
- [Initiative 0002](../../initiatives/0002-mobile-platform-decision.md) — оригінальна mobile dual-track decision

---

## 4. Три фази на одному екрані

```
W-4 ─────── W0 ─────── W+4 ─────── W+8 ─────── W+12 ─────── W+16 ─────── W+20 ─────── W+24
│           │           │           │            │            │            │            │
│  Pre-     │ Web       │ Web       │ Web        │ Capacitor  │ Capacitor  │ Capacitor  │ Decision
│  launch   │ Closed    │ Soft      │ Stable     │ Internal   │ Closed     │ Production │ gate:
│           │ Beta      │ Public    │ (paywall   │ alpha      │ beta       │ rollout    │ Native?
│           │ 10-30     │ 500-2000  │ live)      │ 5-10 ppl   │ 50-150     │            │
│           │           │           │            │            │            │            │
├───────── PHASE 1 — Web (16 weeks total) ──────────────────┤            │            │
                                                            ├──── PHASE 2 — Capacitor (8 weeks) ───┤
                                                                                                   │
                                                                                                   PHASE 3 — Native?
                                                                                                   (only if criteria met)
```

**Параллелізм:**

- Apple Developer enrollment стартує у W+2 (через D-U-N-S delay ~2 тижні).
- Stripe billing infrastructure (initiative 0010 phase 2-4) йде паралельно з Web Closed Beta
  і landing live до W+4.
- Native Expo `apps/mobile` Phases 7–10 (Nutrition AI parity, HubChat streaming) — можна доточувати
  фоновим темпом, але **без commitment** на launch.

---

## 5. Рішення про лендінг

**Питання користувача:** «Нам треба якийсь сайт лендінг чи що?»

**Коротка відповідь:** Так — single-page лендінг потрібен **на public launch** (W+4),
але **не для closed beta** (W0..W3). До public — `/welcome` всередині `apps/web` достатньо.

**Три опції (детально у [Phase 1 § 2](./01-web-launch-with-users.md#2-лендінг-decision)):**

| Опція                         | Що це                                                                                                                 | Час до live | Ризик                              | Маркетинг-flex    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------- | ----------------- |
| A. Окремий сайт               | `sergeant.com.ua` (Astro/Framer) + `app.sergeant.com.ua` (PWA)                                                        | 2-3 тижні   | Великий time-sink                  | Високий           |
| B. Monolith `apps/web`        | `/welcome` як public landing, без окремого сайту                                                                      | 0 (уже є)   | SEO/marketing-friction             | Низький           |
| **C. Гібрид (рекомендовано)** | Single-page Astro на `sergeant.com.ua` зараз + `app.sergeant.com.ua` для PWA + повноцінний marketing-сайт post-launch | 3-5 днів    | Мінімум зусиль, легко масштабувати | Достатній для W+4 |

**Обґрунтування:**

- Existing GTM plan [02 § 2.2](../business/02-go-to-market.md#22-landing-page) вже передбачає окремий лендінг.
- Solo-founder ≠ повноцінна marketing-команда → робити Framer / Astro one-pager, не custom-build.
- Закрита бета працює на email-інвайтах → лендінг не критичний; для public launch обовʼязковий
  через SEO, share-cards, PH-assets.

---

## 6. Критичний шлях (week-by-week)

> Це **зведений** timeline з трьох фаз. Детальні daily action items — у відповідних phase-документах.
> Стиль формата: `Wk | Phase | Що робимо | Чому це блокер для наступного тижня`.

### Phase 1 — Web (W-4 .. W+12)

| Wk     | Фокус                                | Що робимо                                                                                         | Gate до наступного тижня                                 |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| W-4    | Pre-launch infra + waitlist          | Купити `sergeant.com.ua`, single-page Astro landing live, email-збір (Loops free), Telegram-канал | Domain live, waitlist 50+ signups                        |
| W-3    | Pre-launch content + custdev         | Founder's story DOU, 10–15 custdev interviews, share-cards, PH-assets draft                       | ≥ 200 waitlist; custdev insights → backlog               |
| W-2    | Pre-launch dev: FTUX + flags         | `feature.invite_only_signup` flag, FTUX-tracker SLO baselines, demo-mode polish                   | FTUX funnel ≥ 70% step completion rate (internal)        |
| W-1    | Pre-launch dry-run                   | E2E dry-run, runbook, on-call rotation (solo), DB backups verified, status page live              | Dry-run pass, backups restore-tested                     |
| W0     | Closed beta cohort A — 10 invites    | Manual invites, in-app feedback widget live, Telegram private group                               | D1 retention ≥ 60%, no P0 bugs                           |
| W+1    | Closed beta cohort B — 10–20 invites | Daily triage, weekly digest email, custdev follow-up calls                                        | NPS ≥ 30, < 5 P1 bugs open                               |
| W+2    | Closed beta polish + paywall-stub    | Iterate on top 5 friction points, deploy paywall-stub (no Stripe yet), Privacy/ToS draft          | Activation funnel cleared; legal pages live in staging   |
| W+3    | Closed beta → soft public prep       | Apple Dev enrollment START (D-U-N-S kickoff for Phase 2!), Stripe + ФОП registration kickoff      | Apple Dev D-U-N-S in process; legal pages published prod |
| W+4    | Soft public launch — open signup     | Remove invite gate, Product Hunt prep, paid traffic test (small budget)                           | 500+ signups, server stable                              |
| W+5–7  | Soft public iteration                | A/B test FTUX variations, churn analysis, Telegram-канал growth, Twitter build-in-public          | D7 retention ≥ 30%, NPS ≥ 40                             |
| W+8    | **Capacitor handoff trigger**        | Web stable, paywall live (Stripe Checkout + Customer Portal), >2K MAU                             | → Phase 2 entry criteria met                             |
| W+9–12 | Stable + Capacitor parallel work     | Web FTUX optimizations, Capacitor enrollment + signing finalization                               | Phase 2 ready for internal alpha                         |

### Phase 2 — Capacitor (W+8 .. W+16)

> Стартує **paralelно** з Phase 1 W+8 (як тільки Apple Dev enrollment пройшов D-U-N-S).
> Детально: [02 — Capacitor launch](./02-capacitor-launch.md).

| Wk      | Фокус                                       | Що робимо                                                                        | Gate                                                                       |
| ------- | ------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| W+8     | Enrollment finalize + secrets               | Apple ASC API key, provisioning profile, Android keystore у CI                   | All CI secrets green; signed build artefact passes smoke                   |
| W+9     | Store metadata draft                        | Іконки, screenshots, demo-video, App Privacy / Data Safety форми                 | Listing draft submitted (not yet live)                                     |
| W+10    | Internal alpha — TestFlight + Play Internal | 5–10 internal testers (founder + 5 friends), nightly builds, crash-free baseline | < 2 crashes / 100 sessions; P0 bugs = 0                                    |
| W+11    | Closed Beta — 50–150 testers                | TestFlight external + Play Closed Testing track, Telegram beta group             | NPS ≥ 35 для mobile cohort; retention D7 ≥ 25%                             |
| W+12–13 | Polish + UX-divergence chemicals            | Status bar, splash, keyboard, back-button regression на real devices             | UX-checklist pass (від Phase 2 § 7)                                        |
| W+14    | Staged production rollout — 1% Play         | Staged rollout 1% → 10% → 50% Android, TestFlight → App Store Review submission  | App Store review approved; Play 50% with crash-free ≥ 99%                  |
| W+15    | Production GA — Android 100% + iOS approved | Full GA, marketing push, ASO start, monitor reviews                              | Crash-free 7-day ≥ 99% iOS / ≥ 98.5% Android                               |
| W+16    | **Native decision gate**                    | Зібрати дані Capacitor у проді 4-6 тижнів, оцінити gap to native                 | Decision: Phase 3 Сценарій A (sunset) / B (premium) / C (next-gen replace) |

### Phase 3 — Native (Expo) — conditional

> **За поточними даними рекомендація — НЕ запускати окремо у цьому циклі.**
> Decision gate у W+16 після Capacitor production rollout.
> Деталі: [03 — Native Expo launch](./03-native-expo-launch.md).

| Сценарій                  | Trigger                                                                                                              | Дія                                                                 | Effort        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------- |
| **A. Sunset apps/mobile** | Capacitor crash-free ≥ 99% + retention D30 ≥ 20% + < 5% користувачів просять native                                  | Sunset ADR, переключити RN команду на shell-polish + AI features    | 1 ADR + comms |
| **B. Native як premium**  | Power-user demand confirmed (custdev), Capacitor задовольняє 90%, можемо позиціонувати native як «Pro experience»    | Native як paid tier, окремий store-listing, opt-in для існуючих     | 4-6 тижнів    |
| **C. Native як next-gen** | Capacitor має 2+ архітектурних блокера (e.g. low cold-start критично для retention), funding для дублювання effort є | Full parity sprint, migration plan для shell users, eventual sunset | 7-10 тижнів   |

---

## 7. Top-10 блокерів

Консолідовано з 4 паралельних аналізів. Owner — `@Skords-01` за замовчуванням,
де явно не вказано інакше.

| #   | Блокер                                                                                                                                                                                      | Owner / Surface           | Estimate  | Phase                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------- | ---------------------------- |
| 1   | **Privacy Policy + ToS публічні URLs** ([04 § 1.1](../business/04-launch-readiness.md#11-обовязкові-документи))                                                                             | Founder + (юрист consult) | 1-2 тижні | Web public + Capacitor       |
| 2   | **Stripe billing pipeline** (subscriptions + stripe_webhook_events міграції, Checkout, Customer Portal) — [Initiative 0010 phase 2-4](../../initiatives/0010-revenue-first-launch.md)       | Devin + founder           | 2-3 тижні | Web public (paywall live)    |
| 3   | **Apple Developer Program enrollment** ($99 + D-U-N-S Number; ~2 тижні delay)                                                                                                               | Founder                   | 2-3 тижні | Capacitor iOS                |
| 4   | **Google Play Developer Console enrollment** ($25 one-time)                                                                                                                                 | Founder                   | 1-2 дні   | Capacitor Android            |
| 5   | **ФОП реєстрація + банк-рахунок для UA-Stripe** (UAH support)                                                                                                                               | Founder                   | 2-4 тижні | Web paywall live             |
| 6   | **Apple + Google Sign-in via Better Auth** ([0010 phase 4.3](../../initiatives/0010-revenue-first-launch.md))                                                                               | Devin                     | 1-2 тижні | Web public (signup friction) |
| 7   | **Окремий лендінг live** (single-page Astro на sergeant.com.ua, опція C)                                                                                                                    | Founder + Devin           | 3-5 днів  | Web public                   |
| 8   | **Store-listing assets** (іконки, screenshots, demo-video, App Privacy / Data Safety форми)                                                                                                 | Founder + designer        | 1 тиждень | Capacitor                    |
| 9   | **Cookie consent banner для EU** (ePrivacy compliance)                                                                                                                                      | Devin                     | 1-2 дні   | Web public                   |
| 10  | **DB backups end-to-end verified** ([04 § 7 item 20](../business/04-launch-readiness.md#7-pre-launch-чеклист) + [playbooks/test-backup-restore.md](../../playbooks/test-backup-restore.md)) | Devin                     | 1 день    | Web closed beta              |

**Сумарний critical path:** W-4 .. W+8 для всіх Web блокерів; W+2 .. W+11 для Capacitor блокерів.

---

## 8. Open questions для founder-а

Питання, на які треба відповісти **до старту W-4**, або вони ризикують відкласти всю послідовність.

### Стратегічні

1. **Розмір closed beta cohort:** 10 / 30 / 100 інвайтів? (Малий — швидше iterate, великий — точніший signal)
2. **Stripe vs LemonSqueezy:** Stripe чекає на ФОП (2-4 тижні), LemonSqueezy як merchant-of-record прискорює, але -5% revenue. Bridge?
3. **UA-only на launch vs EN-first з Day 1:** Product Hunt-readiness залежить від EN-first.
4. **Лендінг:** Astro SSG / Framer / `/welcome`-only? (рекомендація: гібридна опція C — § 5)
5. **iOS Capacitor одночасно з Android чи окремою хвилею:** Android швидше (готова pipeline), iOS чекає Apple Dev D-U-N-S.
6. **Paid acquisition на CP-2 чи organic-only перші 4 тижні після public launch?** Чесний N1 baseline vs швидший growth.

### Тактичні

7. **Чи готовий founder вкладати ~5-10 годин/тиждень у custdev-інтервʼю** протягом closed beta (W-3 .. W+3)?
8. **Legal pages — founder сам, юрист-консультант, чи Devin draft + owner review?**
9. **Чи приймається рекомендація Path C** ([01 — Web § 2](./01-web-launch-with-users.md#2-лендінг-decision)): defer paywall до post-Phase 2?
10. **Чи `sergeant.com.ua` вже зареєстрований** і вказує на Vercel — чи ще треба купити домен у W-4?

### Native-specific (W+16 decision gate)

11. **Якщо Native стане primary** — як саме мігрувати users з shell (deep-link redirect? forced update?)
12. **Чи планується найм другого розробника для mobile** (визначає, чи Сценарій B можливий)
13. **iOS App Tracking Transparency** — потрібен чи NO?
14. **Native як premium pricing tier чи free?** Якщо premium — як комунікувати differentiation?

### Capacitor-specific

15. **Apple Developer Program — individual ($99) чи organization ($99 + D-U-N-S, ~2 тижні)?**
    Organization дає легший team-bundle compliance, але block early start.
16. **Apple Store category:** Health & Fitness (точніше, суворіший review) чи Productivity (швидший review)?
17. **Capacitor mono-paywall через Stripe redirect (Strategy A — free iOS на бета)** чи паралельно
    Apple StoreKit IAP + Google Play Billing у shell (compliance з Apple Review Guideline 3.1.1)?

---

## 9. Top ризики + mitigation

| Ризик                                                                           | Likelihood | Impact | Mitigation                                                                                                                                    |
| ------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Dev D-U-N-S delay блокує Phase 2** (потрібно ≥ 2 тижні, починати у W+2) | Medium     | High   | Стартувати enrollment одразу у W+2; паралельно довести Android lane (швидша)                                                                  |
| **Stripe ФОП delay блокує public launch з paywall** (2-4 тижні)                 | High       | High   | Path C з [01 — Web](./01-web-launch-with-users.md#5-технічні-передумови): запуск free, paywall post-Phase 2                                   |
| **Solo founder burnout у W-3 .. W+8** (custdev + dev + ops одночасно)           | High       | High   | Daily triage caps, weekly digest замість ad-hoc reply, Devin для tech-tasks, no-features-Fridays                                              |
| **P0 production incident у W0..W+1**                                            | Medium     | High   | [hotfix-prod-regression.md](../../playbooks/hotfix-prod-regression.md), instant Vercel/Railway rollback, status page live, on-call founder    |
| **NPS < 20 на closed beta** → no PMF signal                                     | Medium     | High   | Stop the line, custdev deep-dive, можливо pivot scope (smaller initial module set)                                                            |
| **Apple Store reject Phase 2** (App Review Guideline issues для health/fin)     | Medium     | Medium | Pre-submit checklist у [02 — Capacitor § 7](./02-capacitor-launch.md), Apple-friendly category, Sign in with Apple якщо Google OAuth активний |
| **Capacitor crash-free < 98% у W+14**                                           | Low        | Medium | Phased rollout 1%→10%→50%, instant Play rollback, Sentry alert thresholds                                                                     |

---

## 10. Що робити в найближчі 7 днів

> Конкретний minimum-viable список, який не залежить від рішень з § 8.
> Запускає Phase 1 W-4.

- [ ] **Купити `sergeant.com.ua`** (якщо ще ні) і вказати на Vercel
- [ ] **Створити Telegram-канал** «Sergeant 🎖️» + waitlist landing single-page (Astro або Framer)
- [ ] **Стартувати ФОП реєстрацію** (паралельно — ~2-4 тижні)
- [ ] **Apple Developer enrollment** заявка (паралельно — ~2 тижні D-U-N-S)
- [ ] **Privacy Policy + ToS draft** через Termly (~$50/міс) + review founder
- [ ] **DB backup restore-тест** ([playbooks/test-backup-restore.md](../../playbooks/test-backup-restore.md))
- [ ] **`feature.invite_only_signup` flag** додати в [feature-flags.md registry](../../governance/feature-flags.md)
- [ ] **Закласти 5-10 годин на custdev-інтервʼю** у calendar (W-3 .. W+3)
- [ ] **Відповісти на 10-12 open questions** з § 8 (мінімум — top-6 стратегічних)

---

## 11. Cross-refs

### Phase docs (детальні плани)

- [`00-readiness-audit.md`](./00-readiness-audit.md) — статус 4 поверхонь, матриця готовності, top blockers
- [`01-web-launch-with-users.md`](./01-web-launch-with-users.md) — Phase 1 з тижневим планом, landing decision, user testing strategy
- [`02-capacitor-launch.md`](./02-capacitor-launch.md) — Phase 2 з iOS/Android lanes, store submission, IAP decision
- [`03-native-expo-launch.md`](./03-native-expo-launch.md) — Phase 3 conditional, 3 сценарії + рекомендація

### Існуючий контекст (parent of this work)

- [`docs/launch/README.md`](../README.md) — launch hub (business + tech + product-os subtrees)
- [`docs/launch/business/01-monetization-and-pricing.md`](../business/01-monetization-and-pricing.md)
- [`docs/launch/business/02-go-to-market.md`](../business/02-go-to-market.md)
- [`docs/launch/business/04-launch-readiness.md`](../business/04-launch-readiness.md)
- [`docs/launch/product-os/ftux-master-tracker.md`](../product-os/ftux-master-tracker.md)
- [`docs/launch/product-os/paywall-implementation-plan.md`](../product-os/paywall-implementation-plan.md)

### Architecture / ADRs

- [`docs/architecture/platforms.md`](../../architecture/platforms.md) — feature parity матриця (SSOT)
- [`docs/architecture/apps-status-matrix.md`](../../architecture/apps-status-matrix.md)
- [`docs/architecture/hosting-evolution.md`](../../architecture/hosting-evolution.md)
- [ADR-0051 — Pricing v3 single tier](../../adr/0051-pricing-v3-single-tier.md)
- [ADR-0052 — Mobile strategy: Capacitor primary](../../adr/0052-mobile-strategy-capacitor-primary.md)

### Initiatives

- [`docs/initiatives/0002-mobile-platform-decision.md`](../../initiatives/0002-mobile-platform-decision.md)
- [`docs/initiatives/0010-revenue-first-launch.md`](../../initiatives/0010-revenue-first-launch.md)

### Release playbooks

- [`docs/playbooks/release.md`](../../playbooks/release.md) — canonical release flow
- [`docs/playbooks/release-web-and-api.md`](../../playbooks/release-web-and-api.md)
- [`docs/playbooks/release-mobile-shell.md`](../../playbooks/release-mobile-shell.md)
- [`docs/playbooks/release-expo-mobile.md`](../../playbooks/release-expo-mobile.md)
- [`docs/playbooks/test-backup-restore.md`](../../playbooks/test-backup-restore.md)
- [`docs/playbooks/hotfix-prod-regression.md`](../../playbooks/hotfix-prod-regression.md)

---

> **Ownership:** `@Skords-01`. **Cross-session handoff** — через 4 phase-doc у цьому піддереві.
> Зміни — через PR з conventional commit `docs(launch): …`. Не редагуй inline у production runs
> без owner-approval. Cross-cutting питання, які зачіпають ADR-0052 або pricing — обовʼязковий ADR.
