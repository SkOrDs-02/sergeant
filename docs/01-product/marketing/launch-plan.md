# Sergeant — Pre-launch Marketing Execution Plan

> **Last validated:** 2026-07-31 by @claude (звірка з кодом).
> **Next review:** 2026-10-29.
> **Status:** Reference — **voice- і channel-канон, не execution plan**. Технічна частина (стек вейтліста, форма, referral) розійшлася з реалізацією; актуальний стан — у розділі «Що з цього реалізовано» нижче.
> **Companion docs:** [`../design/brandbook.md`](../../05-design/design/brandbook.md) (voice + palette) · [`../design/redesign-v2/execution-plan.md`](../../05-design/design/redesign-v2/execution-plan.md) (parallel product polish plan).

## How to use this document

Цей файл писався як **pre-implementation план** для побудови маркетингу з нуля. Лендінг і вейтліст відтоді реалізовані — **іншим стеком, ніж описано нижче**. Тому:

- **Бери звідси:** persona archetype, voice playbook per channel, UA lexicon, tagline lineup, content pillars, SEO-кластери, email-копію, prepublish-чеклист. Це все лишається канонічним.
- **Не бери звідси:** Airtable, n8n-флоу, Astro-стек, `nanoid(8)` ref-коди, Google Sheet як лічильник. Нічого з цього в репо немає.

**Реальні поверхні для звірки:** `apps/landing/src/pages/HomePage.tsx`, `apps/landing/src/components/` (`TelegramCta`, `HomeSections`, `DashboardPreview`), `apps/landing/src/lib/links.ts`, `apps/web/src/core/pricing/WaitlistForm.tsx`, server `/api/v1/waitlist` і `/api/v1/telegram/webhook`, [`telegram-waitlist.md`](../../90-work/planning/specs/archive/telegram-waitlist.md).

> ⚠️ Шляхи `apps/web/src/core/LandingPage.tsx` і `apps/web/src/core/WaitlistForm.tsx`, які раніше стояли в цьому абзаці, **не існують**. Кореневий `/` у `apps/web` — це `RootRoute` (хаб для залогіненого юзера), а не маркетингова сторінка; маркетинговий лендінг живе в окремому воркспейсі `apps/landing`.

## Що з цього реалізовано (станом на 2026-07-31)

| Блок плану                  | Стан        | Фактично                                                                                                               |
| --------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Лендінг                     | ✅ інакше   | `apps/landing` — Vite + React 18 + Tailwind 4, **не Astro**                                                            |
| Головний CTA                | ✅ інакше   | Telegram deep link (`TelegramCta`), **не email-форма**                                                                 |
| Збір вейтліста              | ✅ інакше   | `telegram_waitlist` (Postgres, міграція 089) + `waitlist_entries`, **не Airtable**                                     |
| Атрибуція каналів           | ✅ інакше   | `start_payload` у deep link (`?start=dou`), **не UTM у localStorage**                                                  |
| Email drip (4 листи)        | ⚠️ частково | FTUX-drip у коді (`ftuxDripMail.ts` + BullMQ + `ftuxUnsubscribeToken.ts`); **блокер — домен у Resend не верифіковано** |
| Referral / `ref_code`       | ❌ немає    | Ні таблиці, ні ендпоінтів, ні `nanoid(8)`-кодів                                                                        |
| Live counter «847 чекають»  | ❌ немає    | Google Sheet + n8n cron не існують                                                                                     |
| n8n флоу (10 штук)          | ❌ немає    | n8n у контурі маркетингу не піднятий                                                                                   |
| `/llms.txt`, JSON-LD schema | ❌ немає    | —                                                                                                                      |
| Блог `/blog`                | ❌ немає    | Ні маршруту, ні контенту                                                                                               |
| Соцмережі                   | ❌ немає    | Акаунти не заведені                                                                                                    |
| OG-картка                   | ✅ є        | `apps/landing/scripts/generate-og.mjs` → `public/og.png`                                                               |

**Головна архітектурна розбіжність:** план будувався навколо «без backend, без JWT — тільки Airtable + n8n + URL params». Реалізація пішла протилежним шляхом: вейтліст живе у власній Postgres-таблиці, розсилка — CLI-скрипт у репо. Це вийшло дешевше, бо backend і Postgres уже були; зовнішній CRM додав би інтеграцію там, де вистачило однієї таблиці. Секції нижче з Airtable/n8n читай як **опис намірів**, не як інструкцію.

Історичний контекст revenue-планування — [`pr-plan-revenue-2026-05.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/pr-plan-revenue-2026-05.md) (архів).

**Перед першим PR / publish з цього плану — обов'язково:**

1. Прочитай [`../design/brandbook.md`](../../05-design/design/brandbook.md) (voice, persona, palette, refs Duolingo/Yazio/Monobank).
2. Прочитай секції **Voice playbook** і **Persona archetype** нижче — це canonical guard для всього маркетинг-output'у.
3. Виконуй фази в порядку залежностей (див. dependency tree). Phase 0 ставить foundation, Phase 1 ships landing.

**Constraints (cross-cutting):**

- **UA-only ринок**, ukrainian-first voice. Не оптимізувати під RU.
- **Pre-launch**: App Store / Play Store не подано. CTA = waitlist, не Download.
- **Solo developer + AI + n8n**. Реалістична капасіті: 3-4 Telegram-пости/тиждень, 1 blog/тиждень з AI assist + manual review.
- **Mobile-first**: 80%+ traffic буде mobile (UA pattern). Hero на 360px — primary surface.

## Context

Sergeant — це багатомодульний застосунок life management (Finyk фінанси / Fizruk фітнес / Routine звички / Nutrition харчування). Tagline working: "Твій персональний хаб життя". Voice: "дружній, мотивуючий, як корисний друг, не drill-сержант" (з [`brandbook.md`](../../05-design/design/brandbook.md)).

**Стан на момент створення плану (травень 2026):**

- Продукт ще в активній розробці (parallel UI polish описаний у [`redesign-v2-execution-plan.md`](../../05-design/design/redesign-v2/execution-plan.md)).
- Landing — ще не існував.
- Соцмережі — нуль активних.
- Брендбук + design system — повні.

**Що змінилось до 2026-07-31:** standalone marketing-workspace `apps/landing` перестав бути «опцією» і став default-ом — саме він задеплоюється на apex-домен. Соцмережі досі нуль активних. Актуальна дельта — у таблиці вище.

## Persona archetype (canonical)

> Sergeant — це твій розумний друг-ровесник, який сам через це пройшов: веде фінанси без сорому, тренується без надриву, їсть усвідомлено — і щиро радіє твоєму прогресу, навіть якщо вчора ти пропустив день.

Кожен marketing-output (copy, post, email, blog) має проходити фільтр "чи звучить як ця персона?". Один речний guard для AI-generation prompts.

### Module voice nuances (sub-personas)

- **Finyk** — спокійний і безсоромний. «Знаєш, куди пішли гроші» — не «Ти витрачаєш забагато». Жодного фінансового менторства або guilt-trip.
- **Fizruk** — бадьорий, але не drill-сержант. «Зробив — молодець. Не зробив — завтра є.» Фокус на послідовності, не інтенсивності.
- **Routine** — тихий чемпіон звичок. «Один плюс сьогодні» — маленькі перемоги, без грандіозних обіцянок.
- **Nutrition** — нейтральний і практичний. «Що їв сьогодні?» — жодних суджень «корисно/шкідливо».

## Tagline lineup (per context, не один слоган)

| Контекст                          | Tagline                                                     | Чому                                                      |
| --------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| Landing hero H1                   | «Усе про себе — в одному місці.»                            | Інтрига + конкретика, не корпоративно                     |
| Landing sub                       | «Фінанси, тренування, звички та харчування. Нарешті разом.» | Розкриває модулі + "нарешті" = м'яка іронія на pain point |
| Nav logo descriptor               | «Твій персональний хаб життя»                               | Working tagline, охоплює all 4 modules                    |
| App Store subtitle (30 chars max) | «Усе про себе — в одному місці»                             | Short reuse                                               |
| Onboarding splash                 | «Твій персональний хаб життя»                               | Continuity з App Store                                    |
| Social bio (Telegram/X/Instagram) | «Маленькі кроки. Щоденно.»                                  | Ритмічний, не обіцяє революції                            |

Усі 5 варіантів voice-compliant. Landing-власник може swap'нути hero H1 між двома основними варіантами на основі A/B даних.

## Voice playbook per channel (canonical)

| Канал                | Ти/Ви       | Регістр                                   | Енергія                   | Довжина                    |
| -------------------- | ----------- | ----------------------------------------- | ------------------------- | -------------------------- |
| Landing hero         | Ти          | Напівформальний, ясний                    | Спокійна впевненість      | ≤12 слів на блок           |
| Email drip           | Ти          | Теплий, особистий                         | Підбадьорливий, без тиску | 3–5 речень на блок         |
| Telegram-канал       | Ти          | Розмовний, живий                          | Дружній, з гумором        | 2–4 рядки + обережно emoji |
| X (Twitter)          | Ти          | Напіврозмовний                            | Build-in-public чесний    | Thread 3-7 твітів          |
| Instagram            | Ти          | Нативний соц                              | Натхненний, візуальний    | Caption ≤3 рядки           |
| TikTok (post-launch) | Ти          | Максимально розмовний                     | Жвавий, без пафосу        | Підпис ≤1 рядок            |
| Long-form blog (SEO) | Ти          | Розмовний, але довші речення (до 20 слів) | Друг пояснює, не лекція   | 1500-3000 слів             |
| llms.txt             | Нейтральний | Product description                       | Один теплий рядок зверху  | ~500 слів, факти           |

### UA lexicon

**Уникати:** русизми (самочувствіє → самопочуття, нагрузка → навантаження), англіцизми без потреби (трекати → відстежувати, бустити → посилювати), клінічний жаргон без пояснення (метаболізм, макронутрієнти), корпоративний пафос (екосистема, синергія, рішення), наказовий тиск (мусиш, треба, не забудь).

**Охоче використовувати:** «сьогодні»/«зараз»/«цього ранку» (прив'язка до моменту), «ти» (без дистанції), «маленький»/«один крок»/«трохи» (знижують тривогу), числа з контекстом («+3 км цього тижня», «₴240 зекономлено»), просту похвалу («молодець», «добре», «вийшло»).

## Automation prepublish checklist (n8n-implementable, 5 rules)

Будь-який AI-generated copy перед публікацією має пройти ці фільтри (n8n workflow):

1. **Ти-форма**: regex `\bВи\b|\bВам\b|\bВаш` — fail якщо match.
2. **Без тиску**: заблокувати «мусиш», «треба», «не забудь», «обов'язково», «нарешті» (last — wildcard, бо може бути валідним у "нарешті разом").
3. **Без shame**: заблокувати «пропустив», «знову», «вже Х день не», «лінуєшся».
4. **Module-voice match**: якщо текст про конкретний модуль — перевірити відповідність nuance (regex на негативні маркери per module).
5. **Channel length**: Instagram caption ≤150 симв. до хештегів; TikTok підпис ≤80 симв.; Email subject ≤50 симв.

## 4 architectural synergies (multiplier wins)

> **Не реалізовано в цьому вигляді.** Таблиця лишається як запис початкового задуму; фактичні рішення — у колонці «Фактично».

| Synergy                                                                   | Задум                                                                          | Фактично                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Standalone static + external form automation**                          | Окремий marketing-домен зі сторонньою формою                                   | ✅ окремий воркспейс `apps/landing`, але форма власна → `/api/v1/waitlist`                 |
| **`nanoid(8)` ref-code у Airtable**                                       | Referral attribution без backend, без JWT                                      | ❌ referral не реалізований узагалі                                                        |
| **Voice-injected AI generation prompt + automation prepublish checklist** | Programmatic SEO scale + brand consistency without per-page heavy human review | ❌ не запущено (немає блогу)                                                               |
| **`localStorage` UTM capture + передача на submit**                       | Attribution survives delayed signup без cookies/auth                           | ✅ інакше: `start_payload` у Telegram deep link — атрибуція без localStorage і без трекера |

## Page architecture (canonical IA)

**Задум (травень 2026):**

```
/ (main landing — awareness + waitlist)
  ├─ Nav (logo + "Зайняти місце" ghost CTA)
  ├─ Hero (H1 + sub + primary CTA + supporting visual)
  ├─ Problem bar ("4 застосунки → 1 Sergeant")
  ├─ Module showcase (tabbed switcher; mobile: swipe carousel)
  ├─ How it works (3 кроки)
  ├─ Social proof (live waitlist counter + quotes)
  ├─ Value props (Все разом / Розумні інсайти / Не нудить)
  ├─ Waitlist form (#waitlist anchor)
  ├─ FAQ (4-5 питань + FAQPage Schema)
  └─ Footer
/blog/ (SEO pillar content — Phase 2)
/llms.txt (AI search readiness — Week 1)
/compare/ (comparison hub — Phase 4, post-launch або 500+ waitlist)
```

**Реалізовано** (`apps/landing/src/pages/HomePage.tsx`, після редизайну `b0286bc81`):

```
/ (single page)
  ├─ SiteHeader
  ├─ Hero — «Бачить звʼязки між усім, що важливо»
  │    + TelegramCta (placement="hero") + DashboardPreview
  ├─ HowItWorks
  ├─ ModulesSection
  ├─ ConnectionsSection    ← крос-модульні звʼязки (немає в задумі)
  ├─ HonestSection         ← чесні обмеження (немає в задумі)
  ├─ BetaCta               ← TelegramCta (placement="footer")
  └─ SiteFooter
/* → NotFoundPage
```

**Дельта і чому вона така:**

- **Немає** social proof з live-лічильником, FAQ-блоку, `/blog`, `/llms.txt`, `/compare/`. Лічильник свідомо не робимо: fake або псевдодинамічні числа шкодять довірі (див. § Urgency mechanic), а реального числа, яким варто хвалитись, поки немає.
- **Зʼявились** `ConnectionsSection` і `HonestSection` — обидві відповідають зміщенню позиціювання з «4 застосунки в одному» на «бачить звʼязки». Це той самий редизайн, що дав нинішній H1.
- **Sticky footer CTA** не реалізований; замість якоря `#waitlist` — друга Telegram-кнопка в `BetaCta` з окремим `start_payload` (`landing_footer`), що заодно дає атрибуцію «згори чи знизу натиснули».

## Form anatomy (canonical — 1 field MVP)

> **Форми на лендінгу немає взагалі.** Єдина дія на `apps/landing` — Telegram-кнопка. Спека допускала email-форму як другорядну («або лишай пошту, якщо Telegram не для тебе»), але реалізація звузилась до однієї conversion action; `WaitlistForm` лишився в `apps/web` (`/pricing`). Причина не в конверсії форми, а в тому, що email-канал **мертвий**: домен у Resend не верифіковано, тож зібрані адреси нікуди не написати. Принцип «1 поле» лишається чинним, якщо форму колись повернуть; success-card з module-interest poll і referral-CTA — **не реалізовані**.

**Submit flow (задум): 1 поле (email) → success card з optional module-interest poll.**

```
[ Email                                     ]
[ Отримати early access →                  ]
   "Без спаму · 847 людей вже чекають"
```

> Рядок «847 людей вже чекають» — макет, не жива функція: лічильника немає (§ Urgency mechanic).

Submit → inline success card на тій самій сторінці (no redirect):

```
✓ Ти в списку!
"Sergeant готується — ти дізнаєшся першим. Лист протягом 5 хвилин."

3-крок timeline: запрошення → онбординг → повний доступ

— Розкажи нам більше (optional) —
[ Що цікавить найбільше? ]
   [Фінанси] [Тренування] [Звички] [Харчування]   ← pill chips, 44px touch

[ Запросити друга → отримати priority access ]
```

**Чому 1 поле, не 2 (Round 2 resolution):**

- Cold traffic 1-field CR ~12% vs 2-field ~10% — 2% втрата реальна
- Module-interest ловимо post-submit як optional quick-poll (юзер вже підписаний, ризику відмови нема)
- Якщо пропустить poll → fallback опенер у Day 5 email = generic Hub-level value

**Tradeoff визнаний:** ~30-40% юзерів не дадуть module-interest → Email 2 для них буде generic. Це OK для MVP, можна tune later.

## Post-signup flow

> **Не реалізовано.** Ні success-card із timeline, ні module-interest poll, ні referral-CTA. Для Telegram-шляху цей екран узагалі не потрібен: підтвердження дає сам бот у відповідь на `/start`, і воно приходить у місце, де людина вже є, а не на сторінку, яку вона зараз закриє. Тексти відповідей — `START_REPLY_NEW`, `START_REPLY_AGAIN`, `STOP_REPLY` у `apps/server/src/modules/telegram/waitlistBot.ts`.

**Задум (для email-шляху): inline reveal на тій самій сторінці (no redirect).** Success card містить:

1. Confirmation message + email timeline expectation
2. 3-step visual timeline (запрошення → онбординг → повний доступ)
3. Optional module-interest pill chips quick-poll
4. Secondary referral CTA з ref-link одразу

**Окрема `/thank-you` сторінка не потрібна.**

## Email drip — 4 листи (canonical)

**Tone rules:**

1. Прогрес, не тиск — ніколи "ти ще не зробив".
2. Конкретика замість обіцянок — "побачиш, куди пішли ₴1 200" > "зміни майбутнє".
3. Один CTA на лист.
4. **Forward-looking value only** — без порівняння з минулим («знаєш скільки витрачаєш...»), без "здивує/дізнаєшся скільки".

**Табу:** "нарешті", "вже давно час", "ексклюзивно для вас", "скільки можна".

**Unsubscribe footer**: обов'язково з Email 1, не пізніше. У коді це вже вирішено — `apps/server/src/email/ftuxUnsubscribeToken.ts` генерує підписаний токен відписки.

> **Стан цієї послідовності.** Копія нижче лишається канонічною, але **pre-launch drip не запущений**. У коді є інша, вже реалізована послідовність — FTUX-drip для зареєстрованих юзерів (`ftuxDripCopy.ts`, черга через BullMQ, диспетчер у `ftuxDripMail.ts`). Тобто інфраструктура розсилок існує; бракує двох речей: верифікованого домену в Resend і власне pre-launch-кампанії поверх наявного механізму. Гілкування per-module передбачалось «в n8n» — n8n немає, тож розгалуження треба робити в тому ж диспетчері.
>
> Лист №3 (Referral) **не відправиться** без referral-механіки, якої в коді немає. Лист №4 обіцяє «перші 500» — звіряти з реальним розміром вейтліста перед відправкою, інакше це порожня обіцянка.

| #   | День | Мета                   | Opener                                                                                                                  | CTA                                  |
| --- | ---- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | 0    | Welcome                | «Твоє місце в Sergeant заброньовано — ти дізнаєшся про запуск першим.»                                                  | Розкажи другу (м'який seed)          |
| 2   | 5    | Value hit (per module) | Finyk: «Фінансова картина за тиждень — одна хвилина на день.» / Fizruk / Routine / Nutrition — окремі opener per module | Слідкуй у Telegram                   |
| 3   | 14   | Referral ⚠️ блоковано  | «Маєш когось, хто теж хоче навести лад у витратах або тренуваннях?»                                                     | Надішли [ref_link]                   |
| 4   | 21   | Pre-launch teaser      | «Перші 500 отримують доступ — ти вже серед них. Залишилось небагато.»                                                   | Підтверди email (відповісти на лист) |

**Чому Day 5, не Day 2** (Round 2 decision): Day 2 — занадто щільно після welcome, ризик spam fatigue. Day 5 = "встиг забути, нагадай чим це корисно".

**Чому 4 emails, не 5**: видалений Day 7 social-proof email — milestone celebration виноситься у Telegram-канал (social-growth pillar), не дублюється у email. Email сегмент тримає функціональну послідовність welcome → value → referral → teaser, без soft-touch padding.

**Якщо module-interest не зібрано на post-submit poll** (~30-40% юзерів): Email 2 fallback = generic Hub-level value «Sergeant — твій персональний хаб життя. Чотири модулі, одна звичка щодня.»

**Email 2 — per-module opener bank (фінальні, brand-voice approved, forward-looking):**

- **Finyk**: «Фінансова картина за тиждень — одна хвилина на день.»
- **Fizruk**: «Sergeant Fizruk запам'ятовує твої тренування — ти бачиш прогрес, а не здогадуєшся.»
- **Routine**: «Sergeant Routine тримає звички поряд — ти вирішуєш темп, він нагадує тихо.»
- **Nutrition**: «Sergeant Nutrition рахує макроси за тебе — одна страва, секунда часу.»

## Content pillars (5)

1. **Build-in-public** — прогрес розробки, що зламалось, як AI допоміг. Унікальний leverage solo dev.
2. **Module spotlight** — глибокий deep-dive по одному модулю на тиждень.
3. **UA life-hacks** — практичні поради у контексті модулів (як відстежити витрати у ₴, як побудувати звичку).
4. **Behind-the-scenes automation** — як AI-assisted dev і скрипти допомагають solo. Демістифікація процесу. (Спочатку формулювалось як «AI + n8n»; n8n у контурі немає — реальний матеріал це монорепо-тулінг, агентні скіли й CI-гейти.)
5. **Community moments** — milestone-пости (100/500/1000 waitlist), без накрутки. «Топ запрошувачів тижня» **потребує referral-механіки**, якої немає — до її появи цей формат недоступний.

Founder voice (BIP) і brand voice (продукт) — **різні рівні, не конкурують**. Telegram природно тримає обидва. BIP-пости мають landing для широкої аудиторії у першому реченні (навіть якщо суть технічна), щоб не відштовхнути non-tech audience Routine/Nutrition.

## Channel mix + cadence (realistic for solo+AI)

| Канал                     | Стан                    | Формат primary      | Cadence/week               | Pillar mix                                     |
| ------------------------- | ----------------------- | ------------------- | -------------------------- | ---------------------------------------------- |
| Telegram канал (не група) | **Start Week 1**        | Текст + image, poll | 3-4 пости                  | Build-in-public + module spotlight + milestone |
| X (Twitter)               | **Start Week 1**        | Thread 3-7 твітів   | 2-3 пости                  | Build-in-public + technical                    |
| Instagram                 | **Start Week 1**        | Carousel + Stories  | 1 carousel + Stories щодня | Module spotlight + life-hacks                  |
| TikTok                    | Defer post-launch       | Vertical video      | —                          | —                                              |
| LinkedIn                  | Skip (B2C, не наш ICP)  | —                   | —                          | —                                              |
| Threads                   | Defer (emerging, 0 ROI) | —                   | —                          | —                                              |

**Heavy week** (release/milestone): +1-2 extra пости скрізь.
**Light week**: Telegram 2, X 1-2, Instagram Stories only.

**Blog crosspost**: не замінює pillar пости. Додатковий шар — Telegram teaser + X thread per blog publish.

**Community**: Telegram-канал (не група) до launch. Discord — skip (over-engineered для UA productivity app). Після 500+ waitlist або 50+ DAU — рішення про відкриття групи/коментарів.

## SEO + AI search strategy

### Keyword clusters (commercial intent)

Top targets per module:

- **Finyk**: «програма для обліку витрат», «застосунок для фінансів українською», «трекер витрат безкоштовно», «особистий бюджет онлайн»
- **Fizruk**: «застосунок для тренувань українською», «трекер тренувань безкоштовно», «програма тренувань для початківців»
- **Routine**: «трекер звичок українською», «застосунок для звичок і цілей», «streak трекер безкоштовно», «дисципліна застосунок»
- **Nutrition**: «лічильник калорій українською», «правильне харчування план безкоштовно», «денна норма калорій калькулятор»
- **Hub**: «застосунок для продуктивності українською», «персональний планувальник застосунок», «все в одному продуктивність»

### Pillar content (ranked by conversion intent)

1. **«Повний гайд: як вести особистий бюджет»** (Finyk) — найвищий intent. Direct pain → direct solution.
2. **«Правильне харчування без дієт»** (Nutrition) — medium-high. MyFitnessPal-втомлені шукають альтернативу.
3. **«Як виробити звичку і не кинути»** (Routine) — medium. Informational intent сильний; conversion через streak-aha moment.
4. **«Чому одного застосунку недостатньо: концепція хабу life»** (brand story) — Phase 2.
5. **«Порівняння трекерів звичок: Habitica, Streaks, Sergeant»** — Phase 2.

### Programmatic SEO (Routine only, MVP 10 pages)

10 шаблонних сторінок «Як виробити звичку: [конкретна]» для top-UA-volume звичок: вода, ранкова зарядка, читання, сон, медитація, прогулянки, ведення щоденника, без телефону вранці, подяка, планування тижня.

**Pipeline**: Claude з voice-injected prompt → automation prepublish checklist → human reads first + last paragraph only (red flags там) → publish. ~10 хв/сторінку × 10 = 100 хв (один вечір).

**Не робити mass 1000+ сторінок** — Google E-E-A-T карає AI slop.

### AI search readiness — ship order

**Week 1 (must ship):**

- `/llms.txt` у корені (~500 слів, нейтральний з 1 теплим відкриваючим реченням)
- `SoftwareApplication` + `Organization` schema на main landing

**Week 2-4 (з першим blog post):**

- `FAQPage` schema на module sections + FAQ block of main landing

**Phase 4 (~3 місяці після, post-launch):**

- `/compare/habitica-vs-sergeant`, `/compare/myfitnesspal-vs-sergeant` тощо — потрібна domain authority

**Comparison tone**: «Різні інструменти для різних людей. Обери Habitica якщо X. Обери Sergeant якщо Y.» — **не** "ми кращі". Чесний fit-framing AI-агенти цитують охоче.

### Backlink strategy (solo UA realistic)

- Guest post на **DOU.ua** — "Як я побудував life-hub застосунок за X місяців"
- Listicle pitch до **ain.ua** / **mc.today** — "10 застосунків від українських розробників 2026"
- UA-tech Telegram-канали: "Стартапи UA", "Dev UA"
- Partner exchange з UA fitness/productivity блогерами — value exchange, не платно
- **Уникати**: PBN, купівля посилань (Google карає 2025+)

## Waitlist + referral architecture

> ⚠️ **Найбільша розбіжність документа з кодом.** Уся секція описує no-backend-архітектуру (Airtable + n8n + URL params). Реалізація пішла протилежним шляхом. Нижче — фактичний стек, потім початковий задум для довідки.

### Stack — фактичний

**Лендінг:** `apps/landing` — Vite + React 18 + Tailwind 4 (SPA, не static-site-generator). Ділить `@sergeant/design-tokens` і `@sergeant/shared` з монорепо; дрейф токенів ловить `tokens.drift.test.ts`.

**Два незалежні канали збору:**

| Канал        | Точка входу                              | Сховище                            | Розсилка                                           |
| ------------ | ---------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| **Telegram** | `TelegramCta` → `t.me/<bot>?start=...`   | `telegram_waitlist` (міграція 089) | `scripts/telegram/broadcast-waitlist.mjs` (вручну) |
| **Email**    | `WaitlistForm` → `POST /api/v1/waitlist` | `waitlist_entries`                 | ⚠️ заблоковано неверифікованим доменом Resend      |

Записи **не дедуплікуються** між каналами: якщо людина лишила і те, й те — це два рядки у двох таблицях. Свідоме рішення, дедуплікація не варта складності на цьому обсязі.

**Чому Telegram головний:** бот не може написати першим (обмеження Bot API), тому збирати `@ніки` у форму безглуздо. Єдиний робочий патерн — інверсія: людина сама тисне Start, ми отримуємо `chat_id` і **право писати**. Email при цьому лишається як портативний запасний канал — Telegram може заблокувати бота.

### Атрибуція — фактична

**`start_payload` у deep link**, не UTM у localStorage: `?start=landing`, `?start=landing_footer`, `?start=dou`, `?start=twitter`. Значення падає в колонку `start_payload` — атрибуція каналу без жодного трекера, cookies чи localStorage. Ліміт Telegram: 64 символи, `A-Za-z0-9_-`.

Клієнтська телеметрія бачить лише клік (`/start` відбувається на боці Telegram), тому конверсія «клік → Start» рахується як `COUNT(telegram_waitlist)` проти кліків у PostHog.

### Urgency mechanic

- **Live counter — не реалізований.** Google Sheet + n8n cron не існують; «847 людей вже чекають» у макетах вище — плейсхолдер.
- **Early-bird badge** (статичний): "Перші 500 отримують early access" — можна ставити, це не залежить від інфраструктури.
- **НЕ робити**: fake countdown, псевдо-динамічний лічильник. Шкодить довірі UA-аудиторії. Це правило — причина, чому лічильник краще не показувати взагалі, ніж показувати вигаданий.

### Referral mechanic — не реалізовано

Ні `ref_code`, ні таблиці `referrals`, ні ендпоінтів. Дизайн нижче лишається чинним як ТЗ; тарифну сітку винагород див. [`launch/business/02-go-to-market.md §5.2`](../launch/business/02-go-to-market.md#52-реферальна-програма).

1. Signup → генерується `nanoid(8)` як `ref_code`.
2. Юзер ділиться: `sergeant.com.ua/?ref=ABCD1234`.
3. Новий signup з `?ref=` → lookup інвайтера → `invite_count++`.
4. `invite_count === 3` → лист інвайтеру: "Ти запросив 3 друзів — ти серед першої черги."

> Початковий задум — «тільки Airtable + n8n + URL params, без backend, без JWT». Оскільки backend і Postgres уже є, реалізовувати це через зовнішній CRM немає сенсу: дешевше додати таблицю поруч із `telegram_waitlist`. Social amplification («Топ запрошувачів тижня») стає можливим лише після цього кроку.

### North-star metrics + benchmarks

| Метрика                          | OK threshold | Rationale                                        | Чи можна виміряти зараз                             |
| -------------------------------- | ------------ | ------------------------------------------------ | --------------------------------------------------- |
| Signup rate (landing → Telegram) | ≥ 8%         | UA SaaS норма 5-12% для нішевих продуктів        | ✅ кліки в PostHog vs `COUNT(telegram_waitlist)`    |
| Email open rate (drip)           | ≥ 40%        | Pre-launch warm list; <30% — red flag            | ❌ drip не запущений                                |
| Referral K-factor                | ≥ 0.25       | Кожен 4-й запрошує 1 друга → organic growth loop | ❌ referral не реалізований                         |
| Blog → signup CR                 | ≥ 3%         | З organic traffic; нижче — CTA слабкий           | ❌ блогу немає                                      |
| Social → landing CR              | ≥ 2%         | Instagram/TikTok cold 1-3%; Telegram до 5%       | ⚠️ соцмереж немає; `start_payload` готовий приймати |

> З пʼяти north-star метрик сьогодні вимірюється одна. Це прямий наслідок того, що email, referral, блог і соцмережі не запущені — не проблема інструментування.

### Blog CTA placement

3 точки: (1) після intro (перші 150 слів), (2) на 60% scroll після "aha moment", (3) exit-intent overlay. **НЕ в кінці статті** — там читач уже знає чи піде.

CTA copy: «Увійди в перших 500» / «Спробуй першим — early access» (scarcity + конкретна вигода). **Не**: «Приєднайся до waitlist» (слабко, пасивно).

## N8n flow inventory (10 flows total)

> ⚠️ **n8n у контурі маркетингу не піднятий — жоден із 10 флоу не існує.** Секція лишається як каталог намірів. Перед реалізацією врахуй: сховище — Postgres, не Airtable, тож «Airtable create / lookup / aggregate» скрізь читай як SQL. Флоу #1 (signup → CRM) уже покритий кодом: `POST /api/v1/waitlist` і `POST /api/v1/telegram/webhook` пишуть напряму в таблиці, зовнішній webhook-посередник не потрібен.

### Waitlist + funnel (4)

1. **Signup → CRM**: Webhook → parse UTM body (localStorage-збережені) → Airtable create (email, utm\_\*, ref_code=nanoid(8), invited_by=?ref, module_interest=null) → confirmation email Day 0. **Second async webhook** для post-submit module-interest poll → Airtable update by email → fills module_interest column.
2. **Drip scheduler**: Airtable trigger (new record) → Wait nodes (Day 5/14/21) → branch per `module_interest` (з fallback generic Hub-value якщо null) → per-module email template.
3. **Referral attribution**: Webhook `/signup?ref=CODE` → Airtable lookup ref_code → increment invite_count → if ≥3 → priority email до інвайтера.
4. **Weekly stats digest**: Cron Monday 9:00 Kyiv → Airtable aggregate + Google Sheet read → Telegram до засновника.

### Content + social (3)

5. **Blog → cross-post**: новий пост у Ghost/Notion → n8n → Telegram (teaser + link) + X thread (перший параграф → 4-5 твітів + link). 2-годинний інтервал між каналами.
6. **Waitlist milestone alerts**: Airtable count → n8n cron (4 год) → коли 100/500/1000 → autodraft celebration post → Telegram до founder для approve.
7. **X mention → CRM capture**: моніторити @sergeant_app mentions/replies → Airtable з тегом (feedback/question/positive) → weekly digest у Telegram.

### SEO (3)

8. **Auto-FAQ Schema on publish**: новий blog → витягнути H2 → Claude генерує FAQ-пари → вставити `application/ld+json` → publish.
9. **Daily keyword position check + alert**: cron 09:00 → DataForSEO API (cheapest tier) → 20 target keywords → якщо ±5 delta → Telegram alert.
10. **Blog → 4-канал syndication** (overlaps з #5 — об'єднати у Phase 2): Claude генерує (1) X thread (5 твітів), (2) Instagram caption + 10 хештегів, (3) Telegram-канал short anonce, (4) LinkedIn professional tone (defer post-launch).

## Execution phases

> **Phase 0 і Phase 1 частково виконані іншим шляхом.** Таблиці нижче лишаються як запис задуму; колонка «Стан» показує фактичне.

### Phase 0 — Foundation (Week 0-1, no public output)

| #   | Task                                                             | Effort | Стан                                                                      |
| --- | ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| 0.1 | Сховище вейтліста                                                | XS     | ✅ інакше: Postgres `telegram_waitlist` + `waitlist_entries`, не Airtable |
| 0.2 | Лічильник вейтліста                                              | XS     | ❌ не робимо (§ Urgency mechanic)                                         |
| 0.3 | Флоу signup → CRM / drip / referral                              | S      | ✅/❌ signup покритий кодом; drip і referral — ні                         |
| 0.4 | Email templates для drip                                         | S      | ⚠️ FTUX-drip є (`ftuxDripCopy.ts`); pre-launch-кампанії немає             |
| 0.5 | Voice playbook як constant prompt для AI-генерації               | S      | ❌                                                                        |
| 0.6 | Bootstrap marketing-проєкту з Tailwind preset з `design-tokens/` | M      | ✅ інакше: `apps/landing` на Vite+React, не Astro; токени підключені      |
| 0.7 | Setup Telegram-каналу + X + Instagram з consistent handles       | XS     | ⚠️ бот вейтліста `@serg_qa_bot` є; каналу і соцмереж немає                |

> **Юзернейм бота — відкрите питання.** `serg_qa_bot` читається як внутрішній тестовий, а не як обличчя продукту. BotFather дозволяє перейменувати, але **вже роздані deep link-и після цього помруть** — отже, робити це треба до першої публічної роздачі посилання. Це прямо конфліктує з пунктом 0.7 про «consistent handles».

### Phase 1 — Ship landing + waitlist (Week 1-2)

| #    | Task                                                  | Effort | Стан                                                 |
| ---- | ----------------------------------------------------- | ------ | ---------------------------------------------------- |
| 1.1  | Landing IA build                                      | M      | ✅ інакший склад секцій — див. § Page architecture   |
| 1.2  | Waitlist form: email only                             | S      | ✅ `WaitlistForm` → `POST /api/v1/waitlist`          |
| 1.2a | Post-submit success card з module-interest pill chips | S      | ❌                                                   |
| 1.3  | Sticky footer CTA                                     | XS     | ❌ замість нього — друга Telegram-кнопка в `BetaCta` |
| 1.4  | Inline success state (timeline + referral CTA)        | S      | ❌                                                   |
| 1.5  | UTM `localStorage` capture                            | XS     | ✅ інакше: `start_payload` у deep link               |
| 1.6  | Live counter widget                                   | XS     | ❌ не робимо                                         |
| 1.7  | `/llms.txt` у корені                                  | XS     | ❌                                                   |
| 1.8  | `SoftwareApplication` + `Organization` JSON-LD schema | XS     | ❌                                                   |
| 1.9  | Deploy до Vercel + custom domain                      | S      | ❌ домен не зареєстрований, deploy-конфіг не в репо  |
| 1.10 | Mobile QA на real iPhone + Android budget             | S      | ❓ не задокументовано                                |

**Verification (актуалізовано під фактичний стек):**

- Lighthouse mobile ≥ 90 на всіх 4 axes
- Клік на Telegram-CTA → `/start` → рядок у `telegram_waitlist` зі `start_payload='landing'`
- Email-форма в `apps/web` (`/pricing`) → рядок у `waitlist_entries` протягом 5 сек (на лендінгу форми немає)
- `broadcast-waitlist.mjs --dry-run` друкує коректну вибірку й текст
- Повторний `/start` не створює другий рядок і не зсуває `created_at` (ідемпотентність webhook-а)

### Phase 2 — Content engine ignition (Week 2-4)

| #   | Task                                                                                                                  | Effort |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------ |
| 2.1 | Pillar content #1: «Повний гайд: як вести особистий бюджет» (Finyk) — 2500 слів з voice-injected prompt + manual edit | L      |
| 2.2 | Blog setup (Ghost або Notion + Astro static fetch)                                                                    | M      |
| 2.3 | Inline CTA placement (intro 150 слів, 60% scroll, exit-intent)                                                        | S      |
| 2.4 | N8n flow #5 (blog → Telegram teaser + X thread)                                                                       | M      |
| 2.5 | N8n flow #8 (auto-FAQ Schema на publish)                                                                              | S      |
| 2.6 | Pillar content #2: Nutrition «Правильне харчування без дієт»                                                          | L      |
| 2.7 | Pillar content #3: Routine «Як виробити звичку і не кинути»                                                           | L      |

### Phase 3 — Social channel activation (Week 1-4, parallel to Phase 2)

> **Не розпочато** — акаунтів немає. Два зауваження перед стартом: (1) `referral CTA` у Week 1 і `referral leaderboard` у Week 2 неможливі без referral-механіки; (2) кожен канал має отримати власний `?start=` payload, інакше атрибуція злипнеться в одне «landing».

**Week 1 — "Ми існуємо"**

- Day 1: Announce-пост everywhere (tagline + 4 модулі + waitlist link).
- Telegram: "Чому я будую Sergeant" — особиста story 300 слів.
- X: Thread "4 речі яких мені не вистачало як продакту в UA" → перехід до продукту.
- Instagram: Carousel "Що таке Sergeant" (5 слайдів, 1 модуль = 1 slide).

**Week 2 — Module deep-dive: Finyk**

- Telegram: "Як я відстежую фінанси з Finyk" — real use case.
- X: BIP thread "Чому копійки а не гривні всередині" (технічна деталь).
- Instagram: Carousel "5 категорій витрат UA-розробника".
- Stories poll: "Ти ведеш бюджет?" (data collection для контенту).
- ~~**First "referral leaderboard" пост**~~ — потребує referral-механіки, якої немає.

**Week 3 — Module deep-dive: Routine + BIP**

- Telegram: "Що зламалось цього тижня і як AI допоміг".
- X: BIP thread з реальним прикладом — напр. типова регресія на typecheck або як влаштований monorepo-гейт.
- Instagram: Carousel "Як побудувати звичку за допомогою Routine".
- Milestone post: якщо 100+ waitlist — celebrate публічно.

**Week 4 — Community + waitlist push**

- Telegram: "100 людей чекають на Sergeant — ось що вони хочуть".
- X: Retweet/quote найкращих відгуків, Q&A thread.
- Instagram: User-generated-style контент (beta-тестери цитати як carousel).
- Waitlist CTA в кожному пості цього тижня.

### Phase 4 — Refinement (Month 2-3)

| #   | Task                                                                                             | Effort |
| --- | ------------------------------------------------------------------------------------------------ | ------ |
| 4.1 | Programmatic SEO Routine MVP (10 шаблонних "як виробити X" сторінок)                             | M      |
| 4.2 | N8n flow #6 (waitlist milestone alerts автодрафт)                                                | S      |
| 4.3 | N8n flow #9 (keyword position check + Telegram alert)                                            | M      |
| 4.4 | N8n flow #7 (X mention CRM capture + weekly digest)                                              | S      |
| 4.5 | UA creator collab outreach — beta access в обмін на огляд у 3-5 UA productivity Telegram каналах | M      |
| 4.6 | A/B test hero H1 ("Усе про себе — в одному місці" vs alternative)                                | S      |
| 4.7 | Pillar content #4, #5 (brand story + comparison)                                                 | M      |

### Phase 5 — Launch transition (when App Store approval lands)

| #   | Task                                                                                      |
| --- | ----------------------------------------------------------------------------------------- |
| 5.1 | Замінити waitlist форму на "Завантажити" CTA з прямими store-links                        |
| 5.2 | Масовий email всьому waitlist: "Sergeant вже в App Store — ти серед перших"               |
| 5.3 | Деактивувати drip-scheduler                                                               |
| 5.4 | Позначити записи вейтліста як «launched» для аналітики (колонка в Postgres)               |
| 5.5 | Ref-коди лишити активними +30 днів для word-of-mouth metrics (якщо referral реалізують)   |
| 5.6 | Launch Phase 6: `/compare/` сторінки (потрібна domain authority вже накопичена)           |
| 5.7 | Розглянути TikTok activation (post-launch, не раніше)                                     |
| 5.8 | Розглянути open Telegram-group або enable channel comments (якщо 500+ waitlist / 50+ DAU) |

## Dependency tree

```
Phase 0 — Foundation
    ├── 0.1-0.5 (сховище + флоу) — блокує всі signup flows   [частково ✅ у Postgres]
    ├── 0.6 (bootstrap лендінга) — блокує Phase 1            [✅ apps/landing]
    └── 0.7 (Social accounts) — блокує Phase 3 Day 1         [❌]

Phase 1 — Landing ship (depends on 0.1-0.6)                  [частково ✅]
    └── Live waitlist ✅ + drip ❌ + counter ❌ + llms.txt ❌ + schema ❌
    └── БЛОКЕР, не в початковому плані: домен + deploy-конфіг

Phase 2 — Content engine (depends on Phase 1)
    └── Blog + pillar content + n8n syndication

Phase 3 — Social activation (depends on 0.7; can run parallel to Phase 1/2)
    └── 4-week launch plan, Telegram-first

Phase 4 — Refinement (depends on Phase 1-3 data)
    └── Programmatic SEO + alerts + A/B + creator collab

Phase 5 — Launch transition (depends on App Store approval — exogenous)
    └── Store-link swap + mass email + post-launch channels
```

## Hero gradient drift — resolved policy

`brandbook.md` каже "Soft & Organic пастель"; `redesign-v2/governance.md` ввів "bright module-tinted" hero gradients. Marketing decision:

- **Landing Hub-Hero** (top of `/`) — **Soft & Organic** кремовий (`#fdf9f3 → #f0fdfa`). Зберігає voice ambiguity-free.
- **Module showcase секції на landing** — bright tinted (`--hero-grad-{module}`). Демонструють ідентичність модулів.
- **Marketing assets (соцмережі, email headers)** — нейтральний або Emerald-палітра. Не яскраві rose/lime окрім module-специфічного контенту.

Це закриває T4 token gap з [`redesign-v2-execution-plan.md`](../../05-design/design/redesign-v2/execution-plan.md) як **policy decision**, не код. У brandbook.md можна додати «hero gradient lives in module-showcase scope; main hero stays Soft & Organic» одним рядком.

## Open questions / decisions deferred

**Закриті фактом реалізації:**

- ~~**Hero H1 final**: «Усе про себе — в одному місці» vs «Один застосунок. Чотири модулі. Уся картина.»~~ — **обрано третій варіант**: «Бачить звʼязки між усім, що важливо» (редизайн `b0286bc81`). Позиціювання зсунулось з «усе в одному місці» на «бачить звʼязки»; таблиця tagline lineup вище цього зсуву ще не відображає — звіряти перед використанням.
- ~~**Tally.so vs custom form**~~ — власна форма, як і рекомендувалось (`WaitlistForm` → `/api/v1/waitlist`). Tally в стеці немає.
- ~~**Invite-only з position number vs simple waitlist**~~ — simple waitlist, без позицій і без інвайт-кодів. Гейт бети — список адресатів Telegram-розсилки.

**Досі відкриті:**

- **A/B тест H1** — інфраструктури A/B на лендінгу немає; після 200 signups робити нічим. Або ставити її, або визнати, що H1 фіксований.
- **Telegram-канал vs group**: канал до launch. **Decision threshold: 500+ waitlist OR 50+ DAU**. Наразі існує лише бот вейтліста — ні каналу, ні групи.
- **Юзернейм бота** `serg_qa_bot` — перейменувати до першої публічної роздачі посилань, інакше видані deep link-и помруть.
- **Discord**: skip permanently (over-engineered для UA productivity).
- **Threads**: defer до Q4 2026 (emerging, 0 ROI зараз).
- **LinkedIn**: skip permanently (B2C, не наш ICP).

## Refs

- [`../design/brandbook.md`](../../05-design/design/brandbook.md) — voice + palette + references
- [`../design/redesign-v2/execution-plan.md`](../../05-design/design/redesign-v2/execution-plan.md) — паралельний product polish plan
- [`../design/cross-module-prompts.md`](../../05-design/design/cross-module-prompts.md) — cross-module value framing (transferable у marketing copy)
- [`../design/empty-states.md`](../../05-design/design/empty-states.md) — value-first vs feature-first framing (transferable у landing copy)
