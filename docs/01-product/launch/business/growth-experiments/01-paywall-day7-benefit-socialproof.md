# Growth-експеримент G_next-1 — reverse-trial day-7 paywall A/B (benefit-framed + social proof)

> **Issue:** [CMP-70](../../../../) (дочірній до [CMP-67](../../../../) — наступний GTM крок після Pro-тарифу).
> **Owner:** Рупор (CMO). **Рев'ю перед go-live:** CEO (обов'язкове, незворотна публікація меседжингу).
> **Status:** **CEO-апрувнуто** (request_confirmation accepted 2026-07-09) → Eng-wiring делеговано у [CMP-72](../../../../) (Engineering Lead, `todo`). **Last touched:** 2026-07-09.
> **AARRR етап:** Activation → Revenue. **Доменні лінзи:** A/B-мислення, JTBD (позиціювання болю), AIDA/PAS (структура), social proof, ASO-конверсія (тон зі style-guide.uk).

> **Cross-refs:** [ADR-0068](../../../../04-governance/adr/0068-pricing-v4-uah-reverse-trial.md) (reverse-trial 7 днів, ₴199/міс / ₴1 490/рік) · [activation-success-events (CMP-66)](../../product-os/activation-success-events.md) (пороги activation) · [`PaywallModal.tsx`](../../../../../apps/web/src/core/billing/PaywallModal.tsx) · [`TrialBanner.tsx`](../../../../../apps/web/src/core/billing/TrialBanner.tsx) · [`style-guide.uk.md`](../../../copy/style-guide.uk.md) · Eng-wiring → [CMP-72](../../../../) · PostHog wiring → [CMP-69](../../../../).

---

## 1. Гіпотеза (формальна)

**Якщо** на 7-й день reverse-trial (момент перед автоматичним downgrade) показати paywall з benefit-framed копі + шаром social proof (B), **то** конверсія в Pro зросте відносно поточного нейтрального feature-list меседжингу (A), **бо** сегмент (військові/медики UA, mobile-first) отримує повідомлення про _цінність вже побудованого ритму_, а не тиск «купи Pro» — reverse-trial уже дав аha-moment, тож framing «не втрачай те, що маєш» (loss-aversion через benefit, не через страх) краще конвертує, ніж перелік фіч.

**AARRR ланка:** Activation → Revenue (downgrade-момент = останній friction-point перед втратою Pro-досвіду).

**Первинна гіпотеза (H1):** Variant B піднімає day-7→paid conversion відносно A на ≥ MDE (див. §4) при neutral guardrails (dismiss-rate не росте, D7-retention не падає).

**Антигіпотеза (H0):** різниця B vs A у day-7→paid conversion ≤ MDE — меседжинг не рухає воронку на цьому friction-point (тоді рухати _позицію_ paywall або _сам reverse-trial_, не копі).

---

## 2. Surface — де і коли показуємо

- **Тригер:** reverse-trial до завершення ≤ 24 год (`subscription.status === "trials" && trial_ends_at - now ≤ 24h`) **або** момент downgrade. Тон з ADR-0068: paywall-копі «тепер попередження перед downgrade, не opt-in CTA».
- **Surface id:** `trial_day7` (новий — розширення `PaywallSurface` enum у [`PaywallModal.tsx`](../../../../../apps/web/src/core/billing/PaywallModal.tsx)). **Eng-залежність мінімальна** (див. §7): paywall events вже wired (`paywall_viewed`), потрібен лише flag-flip A/B + новий surface id.
- **Каноніка подій:** impression = `paywall_viewed { surface: "trial_day7", variant: "A"|"B" }`; tap = CTA → `/pricing?source=paywall_trial_day7` → `checkout_opened`; conversion = `subscription_started` з атрибуцією з surface/variant (атрибутція через `?source=` — консистентна з [`PricingPage.tsx`](../../../../../apps/web/src/core/PricingPage.tsx) checkout-handler).

> **Blind spot (підсвічую явно):** точний момент показу (24h до vs у момент downgrade) — продуктове рішення; я рекомендую 24h до (юзер ще в Pro, може действовать), але фінальне слово за PM/CEO. Якщо показ у момент downgrade — копі B треба адаптувати (benefit-frame вже у минулому часі).

---

## 3. A/B-копі (готовий до вставки, style-guide.uk-компліант)

> Усі рядки — за [`style-guide.uk.md`](../../../copy/style-guide.uk.md): звертання «ти», 1-а особа однини для action-state (не використовується тут — це не busy-button), заголовки без крапки, CTA — наказова форма 2-ї однини, `…` = U+2026 (не `...`), без «будь ласка»/«на жаль». Кирилиця піде у `apps/web/src/shared/i18n/uk.ts` (Hard Rule i18n) — Eng follow-up, не в JSX-літерал.

### Variant A — control (поточний нейтральний feature-list тон)

Тон: перелік фіч + інформування про завершення trial. Базується на існуючому `DEFAULT_FEATURES` + `TrialBanner` body.

```
title:       "Trial завершується"
description: "Сьогодні завершується 7 днів Pro. Оформи підписку, щоб не втратити доступ до AI-чату й автосинку Mono."
features:
  - "Безлімітний AI-чат + щоденні брифи"
  - "Авто-синхронізація Mono + CloudSync між пристроями"
  - "Експорт CSV/PDF + крос-модульні звіти"
  - "₴199/міс або ₴1 490/рік — без прив'язки картки зараз"
ctaLabel:    "Перейти на Pro"
dismissLabel:"Не зараз"
```

### Variant B — treatment (benefit-framed + social proof)

Тон: benefit-слова для _болів_ (JTBD: «продовжити те, що вже працює»), не feature-list. PAS-структура: [що вже маєш] → [що втрачаєш] → [як залишається з тобою]. Social proof — _чесний_, на продуктових фактах + founder-credibility (засновник — практикуючий медик), **без fabricated чисел** (див. §6 — числовий social proof лише після реальних даних).

```
title:        "Збережи свій ритм"
description:  "За 7 днів ти вже завів бюджет, підключив Mono і побудував стрік.
              Pro залишає цей ритм із тобою: AI без ліміту, авто-синх і звіти,
              що бачать усю картину твого дня."
features:
  - "AI без ліміту щодня — поради, що знають твій тиждень, а не загальний шаблон"
  - "Mono авто-синх — транзакції падають самі, рукою нічого не тягти"
  - "Звіти PDF/CSV — твої цифри в одному місці, навіть без інтернету"
  - "CloudSync — продовжуй з телефону чи ноута, де зручно"
socialProof:  "Працює офлайн. Дані — на твоєму пристрої. Зроблений в Україні медиком, що сам тримає ритм у полі."
ctaLabel:     "Зберегти Pro"
dismissLabel: "Не зараз"
```

**Що свідомо інакше у B:**

1. **Headline** — benefit («збережи ритм») замість факту («trial завершується»).
2. **Description** — починається з _досягнутого_ юзера (loss-aversion на реальному досвіді, не абстракт).
3. **Features** — кожен буллет переведений у benefit-форму («поради, що знають твій тиждень» vs «безлімітний AI-чат»).
4. **CTA** — «Зберегти Pro» (action над _збереженням_) замість «Перейти на Pro» (action над _переходом_).
5. **Social proof** — рядок під features, на трьох стабільних фактах (offline / on-device / made-in-UA-by-medic). Без цифр — бо їх ще немає (див. §6).

> **Чому чесний social proof, а не «обрано 10 000+»:** сегмент військових/медиків жорстко перевіряє claim-и; fabricated числа = бренд-самогубство у trust-критичній ніші. Числовий social proof додається окремим follow-up після 28 днів прод-даних (див. §6).

---

## 4. Експеримент-дизайн

| Параметр                        | Значення                                                                                                                                                                         | Примітка                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Primary metric**              | Day-7 → paid conversion = `subscription_started { source: paywall_trial_day7 } / paywall_viewed { surface: trial_day7 }` у вікні 14 днів від impression                          | delta B vs A                                                     |
| **Secondary metric**            | Tap-through rate = `checkout_opened / paywall_viewed` per variant                                                                                                                | чи B рушає з mid-funnel, навіть якщо кінцева конверсія noisy     |
| **Guardrail metrics**           | (1) dismiss-rate `dismiss / paywall_viewed` — B не дратує; (2) D7-retention когорти — B не ламає утримання; (3) `paywall_viewed` total volume per variant — рівно 50/50 split    | якщо dismiss-rate B > A +5pp — stop, copy агресивний             |
| **MDE (min detectable effect)** | **+40 % relative** на primary (напр. baseline 4 % → 6 %)                                                                                                                         | _directional_ read, не confirmatory (див. §5 — traffic)          |
| **Significance**                | α = 0.10 (one-sided), power = 0.80                                                                                                                                               | directional — копі-експеримент, не drug-trial                    |
| **Split**                       | 50/50 per `paywall_viewed` (PostHog `$feature/flag` `paywall_trial_day7_copy` = "A"\|"B"), sticky per user                                                                       | Eng: feature flag (CMP-69 scope або окремий)                     |
| **Sample size (орієнтовно)**    | ~1 700 impression/arm при baseline 4 %, MDE +40 % rel, α 0.10, power 0.80 → **~3 400 day-7 paywall impression total**                                                            | calculator: two-proportion, pooled p≈0.05                        |
| **Тривалість**                  | Залежить від traffic: `duration ≈ 3 400 / (new_signups_per_week × trial_completion_rate)`. При 100 signup/тиж, ~100 % trial-completion → **~34 тижні**. При 500/тиж → ~7 тижнів. | **требує підтвердження traffic-базелайну від CEO/Eng** (див. §5) |
| **Вікно атрибуції**             | 14 днів від `paywall_viewed` до `subscription_started`                                                                                                                           | cover付款 після downgrade                                        |
| **Stop-criteria**               | dismiss-rate B > A +5pp; або D7-retention B < A −3pp                                                                                                                             | автостоп через PostHog alert                                     |

### Decision rule

- **B win:** primary delta ≥ MDE, guardrails green → ship B 100 %, заархівувати A.
- **No lift:** |delta| < MDE → меседжинг не рухає воронку; наступна гіпотеза — рухати _позицію_ paywall (раніше/пізніше у trial) або _сам reverse-trial механізм_, не копі.
- **B lose:** delta < 0 зsig → ship A, B відкидається (benefit-frame не резонує з сегментом — сигнал для наступної гіпотези).

---

## 5. Blind spots / припущення, що потребують CEO-підтвердження

1. **Traffic-базелайн.** Розрахунок тривалості потребує кількості нових signup/тиждень і trial-completion rate — цього я не маю (PostHog growth-воронка, див. TOOLS.md). **Запит до CEO/Eng:** підтвердити порядок (100? 500? 5 000/тиж?). Якщо < 200/тиж — A/B на day-7 surface буде длитися місяцями; тоді **альтернатива** — розширити експеримент на _всі_ paywall surfaces (`ai_chat_limit`, `mono_auto_sync`, …) для швидшого набору sample, з variant як surface-агностичним копі-шаблоном.
2. **Момент показу.** 24h до downgrade (рекомендую) vs у момент downgrade — продуктове рішення (PM/CEO). Див. §2.
3. **Baseline conversion.** MDE = +40 % relative — припущення на reverse-trial day-7 (низький baseline, кілька %). Реальний baseline фіксується після 28 днів прод-даних (як у activation-success-events §6). До того — directional read.
4. **Числовий social proof.** У B немає fabricated цифр (свідомо). Додавання «обрано N+» — _лише_ після реальної кількості beta/прод-юзерів (див. §6). CEO-апрув на конкретне число обов'язковий.

---

## 6. Лонч-чекліст go-live

> Go-live **не може** статись без #1 (CEO-рев'ю копі) і #2 (Eng flag). Решта — parallel.

| #   | Дія                                                                                                                                                                                                  | Власник                                        | Статус                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| 1   | **CEO-рев'ю копі A/B** + апрув variant B benefit-framing + social-proof рядка                                                                                                                        | Рупор → CEO                                    | ✅ done — request_confirmation accepted 2026-07-09 |
| 2   | Eng: додати `trial_day7` у `PaywallSurface` enum + feature flag `paywall_trial_day7_copy` (A/B sticky)                                                                                               | Engineering Lead (через CEO)                   | 📋 делеговано → [CMP-72](../../../../) (`todo`)    |
| 3   | PostHog: impression-атрибутція `paywall_viewed.variant` + funnel `paywall_viewed → checkout_opened → subscription_started` per variant (`paywall_viewed` вже wired; variant prop додається у CMP-72) | Engineering Lead (CMP-72) → Рупор (PostHog UI) | 📋 частина CMP-72 + downstream Рупор               |
| 4   | i18n: винести кириличні рядки A/B у `apps/web/src/shared/i18n/uk.ts` (Hard Rule, не JSX-літерал)                                                                                                     | Engineering Lead (CMP-72)                      | 📋 частина CMP-72                                  |
| 5   | Підтвердити traffic-базелайн (signup/тиж + trial-completion) → фіналізувати тривалість                                                                                                               | CEO/Eng → Рупор                                | ⏳                                                 |
| 6   | Пілотний тиждень: monitor split 50/50 + dismiss-rate guardrail (stop-criteria)                                                                                                                       | Рупор (PostHog)                                | після go-live                                      |
| 7   | Через `duration` тижнів: зняти результат, decision rule (§4), ship-win або kill                                                                                                                      | Рупор                                          | —                                                  |

**Go-live дата:** T = Eng flag merge ([CMP-72](../../../../)). CEO-апрув (#1) отримано. `paywall_viewed` вже wired — variant prop (частина CMP-72) розблоковує зчитування A/B; hard-залежності від [CMP-69](../../../../) (інші PostHog events) немає. Конкретну go-live дату ставить CEO після merge CMP-72 + підтвердження traffic-базелайну (#5).

---

## 7. Eng-залежність (мінімальна)

Згідно [CMP-67 memory](../../../../) та issue-опису CMP-70:

- `paywall_viewed` event **вже wired** (`PaywallModal.tsx:74`, `analyticsEvents.ts:32`).
- `checkout_opened` / `subscription_started` **вже wired** (`PricingPage.tsx`, `analyticsEvents.ts:199/244`).
- **Потрібне від Eng:** (1) новий `trial_day7` surface id; (2) feature-flag `paywall_trial_day7_copy` (A/B, sticky per user); (3) прокинути `variant` у `paywall_viewed` props; (4) i18n-винесення рядків. Усе — один web-PR, ~半天. Не блокує вироблення копі (цей doc).

---

## 8. Рев'ю-гейт (HEARTBEAT §4)

Цей документ — **draft для CEO-рев'ю**. Жодного зовнішнього випуску (соцмережі/стори/email/скриншот-копі) без явного CEO-апруву. Paywall-копі — in-app, не зовнішня публікація, але меседжинг _навколо_ Pro-цінності — брендова поверхня, тож CEO-підтримка тон/позиціювання обов'язкове перед go-live.

**Прошу CEO:**

1. Апрувнути/правити variant B (benefit-framing + social-proof рядок).
2. Підтвердити момент показу (24h до vs downgrade) та traffic-базелайн (#5).
3. Дати go/no-go на делегування Eng-кроків (#2–#4) як child issue.

---

## 9. Self-критика (verify-before-done)

- **Що могло зламатись:** MDE +40 % rel — агресивний; реальний lift копі-експерименту на paywall частіше 10–25 %. Якщо справжній lift < MDE, експеримент «не побачить» win → false negative → kill хорошу копі. Мітогація: directional read (α 0.10 one-sided), guardrail-метрики додатково сигналять навіть при non-sig primary.
- **Які краї не покрив:** (a) не знаю реального baseline conversion → MDE може бути нереалістичним; (b) copy B не проходив тест з реальними військовими/медиками — тон benefit-frame може резонувати слабше, ніж очікую (сегмент жорстко прагматичний); (c) single surface (day-7) — якщо traffic малий, набір sample тягнеться місяцями.
- **Перевірка:** копі валідоване проти style-guide.uk (§1–§9) вручну; event-ім'я звірені з `analyticsEvents.ts`; ціни/ліміти — з ADR-0068. Типчек/`pnpm check` не запускав — цей doc не торкається коду (копі для i18n-винесення — Eng follow-up, не мій scope).
