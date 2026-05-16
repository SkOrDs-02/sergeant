# Sergeant — Pre-launch Marketing Execution Plan

> **Last validated:** 2026-05-16 by @Skords-01 (2-round marketing council audit).
> **Next review:** 2026-08-14.
> **Status:** Ready to execute.
> **Companion docs:** [`../design/brandbook.md`](../design/brandbook.md) (voice + palette) · [`../design/redesign-v2-execution-plan.md`](../design/redesign-v2-execution-plan.md) (parallel product polish plan).

## How to use this document

Цей файл — **виконавчий план** для побудови маркетингу Sergeant з нуля. Він написаний так, щоб новий агент/виконавець міг увійти cold і запускати фази без додаткового брифу.

**Перед першим PR / publish з цього плану — обов'язково:**
1. Прочитай [`../design/brandbook.md`](../design/brandbook.md) (voice, persona, palette, refs Duolingo/Yazio/Monobank).
2. Прочитай секції **Voice playbook** і **Persona archetype** нижче — це canonical guard для всього маркетинг-output'у.
3. Виконуй фази в порядку залежностей (див. dependency tree). Phase 0 ставить foundation, Phase 1 ships landing.

**Constraints (cross-cutting):**
- **UA-only ринок**, ukrainian-first voice. Не оптимізувати під RU.
- **Pre-launch**: App Store / Play Store не подано. CTA = waitlist, не Download.
- **Solo developer + AI + n8n**. Реалістична капасіті: 3-4 Telegram-пости/тиждень, 1 blog/тиждень з AI assist + manual review.
- **Mobile-first**: 80%+ traffic буде mobile (UA pattern). Hero на 360px — primary surface.

## Context

Sergeant — це багатомодульний застосунок life management (Finyk фінанси / Fizruk фітнес / Routine звички / Nutrition харчування). Tagline working: "Твій персональний хаб життя". Voice: "дружній, мотивуючий, як корисний друг, не drill-сержант" (з [`brandbook.md`](../design/brandbook.md)).

**Стан на момент створення плану:**
- Продукт ще в активній розробці (parallel UI polish описаний у [`redesign-v2-execution-plan.md`](../design/redesign-v2-execution-plan.md)).
- Landing — greenfield (`apps/` містить server / web / mobile / mobile-shell; немає `apps/marketing`).
- Соцмережі — нуль активних.
- Брендбук + design system — повні.

## Persona archetype (canonical)

> Sergeant — це твій розумний друг-ровесник, який сам через це пройшов: веде фінанси без сорому, тренується без надриву, їсть усвідомлено — і щиро радіє твоєму прогресу, навіть якщо вчора ти пропустив день.

Кожен marketing-output (copy, post, email, blog) має проходити фільтр "чи звучить як ця персона?". Один речний guard для AI-generation prompts.

### Module voice nuances (sub-personas)

- **Finyk** — спокійний і безсоромний. «Знаєш, куди пішли гроші» — не «Ти витрачаєш забагато». Жодного фінансового менторства або guilt-trip.
- **Fizruk** — бадьорий, але не drill-сержант. «Зробив — молодець. Не зробив — завтра є.» Фокус на послідовності, не інтенсивності.
- **Routine** — тихий чемпіон звичок. «Один плюс сьогодні» — маленькі перемоги, без грандіозних обіцянок.
- **Nutrition** — нейтральний і практичний. «Що їв сьогодні?» — жодних суджень «корисно/шкідливо».

## Tagline lineup (per context, не один слоган)

| Контекст | Tagline | Чому |
|---|---|---|
| Landing hero H1 | «Усе про себе — в одному місці.» | Інтрига + конкретика, не корпоративно |
| Landing sub | «Фінанси, тренування, звички та харчування. Нарешті разом.» | Розкриває модулі + "нарешті" = м'яка іронія на pain point |
| Nav logo descriptor | «Твій персональний хаб життя» | Working tagline, охоплює all 4 modules |
| App Store subtitle (30 chars max) | «Усе про себе — в одному місці» | Short reuse |
| Onboarding splash | «Твій персональний хаб життя» | Continuity з App Store |
| Social bio (Telegram/X/Instagram) | «Маленькі кроки. Щоденно.» | Ритмічний, не обіцяє революції |

Усі 5 варіантів voice-compliant. Landing-власник може swap'нути hero H1 між двома основними варіантами на основі A/B даних.

## Voice playbook per channel (canonical)

| Канал | Ти/Ви | Регістр | Енергія | Довжина |
|---|---|---|---|---|
| Landing hero | Ти | Напівформальний, ясний | Спокійна впевненість | ≤12 слів на блок |
| Email drip | Ти | Теплий, особистий | Підбадьорливий, без тиску | 3–5 речень на блок |
| Telegram-канал | Ти | Розмовний, живий | Дружній, з гумором | 2–4 рядки + обережно emoji |
| X (Twitter) | Ти | Напіврозмовний | Build-in-public чесний | Thread 3-7 твітів |
| Instagram | Ти | Нативний соц | Натхненний, візуальний | Caption ≤3 рядки |
| TikTok (post-launch) | Ти | Максимально розмовний | Жвавий, без пафосу | Підпис ≤1 рядок |
| Long-form blog (SEO) | Ти | Розмовний, але довші речення (до 20 слів) | Друг пояснює, не лекція | 1500-3000 слів |
| llms.txt | Нейтральний | Product description | Один теплий рядок зверху | ~500 слів, факти |

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

| Synergy | Components closed | Effort |
|---|---|---|
| **Astro static + React island form + n8n webhook + Airtable + Google Sheet (live counter)** | Stack для landing + waitlist + drip + live count + analytics — все одним flow | M |
| **`nanoid(8)` ref-code у Airtable** | Referral attribution без backend, без JWT. K-факт track. Соц-amplify leaderboard. | S |
| **Voice-injected AI generation prompt + automation prepublish checklist** | Programmatic SEO scale + brand consistency without per-page heavy human review | M |
| **`localStorage` UTM capture + передача на submit** | Attribution survives тиждень+ delayed signup без cookies/auth | XS |

## Page architecture (canonical IA)

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

**Sticky footer CTA**: Intersection Observer після hero → scroll до `#waitlist` anchor (не друга форма).

## Form anatomy (canonical — 1 field MVP)

**Submit flow: 1 поле (email) → success card з optional module-interest poll.**

```
[ Email                                     ]
[ Отримати early access →                  ]
   "Без спаму · 847 людей вже чекають"
```

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

**Inline reveal на тій самій сторінці (no redirect — зберігає UTM у URL).** Success card містить:
1. Confirmation message + email timeline expectation
2. 3-step visual timeline (запрошення → онбординг → повний доступ)
3. Optional module-interest pill chips quick-poll (writes to Airtable async)
4. Secondary referral CTA з ref-link одразу

**Окрема `/thank-you` сторінка не потрібна.**

## Email drip — 4 листи (canonical)

**Tone rules:**
1. Прогрес, не тиск — ніколи "ти ще не зробив".
2. Конкретика замість обіцянок — "побачиш, куди пішли ₴1 200" > "зміни майбутнє".
3. Один CTA на лист.
4. **Forward-looking value only** — без порівняння з минулим («знаєш скільки витрачаєш...»), без "здивує/дізнаєшся скільки".

**Табу:** "нарешті", "вже давно час", "ексклюзивно для вас", "скільки можна".

**Unsubscribe footer**: обов'язково з Email 1, не пізніше.

| # | День | Мета | Opener | CTA |
|---|---|---|---|---|
| 1 | 0 | Welcome | «Твоє місце в Sergeant заброньовано — ти дізнаєшся про запуск першим.» | Розкажи другу (м'який seed) |
| 2 | 5 | Value hit (per module, branched в n8n) | Finyk: «Фінансова картина за тиждень — одна хвилина на день.» / Fizruk / Routine / Nutrition — окремі opener per module | Слідкуй у Telegram |
| 3 | 14 | Referral | «Маєш когось, хто теж хоче навести лад у витратах або тренуваннях?» | Надішли [ref_link] |
| 4 | 21 | Pre-launch teaser | «Перші 500 отримують доступ — ти вже серед них. Залишилось небагато.» | Підтверди email (відповісти на лист) |

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
4. **Behind-the-scenes AI + n8n** — як automation допомагає solo. Демістифікація AI-assisted dev.
5. **Community moments** — milestone-пости (100/500/1000 waitlist), public visibility top referrers ("Топ запрошувачів тижня"), без накрутки.

Founder voice (BIP) і brand voice (продукт) — **різні рівні, не конкурують**. Telegram природно тримає обидва. BIP-пости мають landing для широкої аудиторії у першому реченні (навіть якщо суть технічна), щоб не відштовхнути non-tech audience Routine/Nutrition.

## Channel mix + cadence (realistic for solo+AI)

| Канал | Стан | Формат primary | Cadence/week | Pillar mix |
|---|---|---|---|---|
| Telegram канал (не група) | **Start Week 1** | Текст + image, poll | 3-4 пости | Build-in-public + module spotlight + milestone |
| X (Twitter) | **Start Week 1** | Thread 3-7 твітів | 2-3 пости | Build-in-public + technical |
| Instagram | **Start Week 1** | Carousel + Stories | 1 carousel + Stories щодня | Module spotlight + life-hacks |
| TikTok | Defer post-launch | Vertical video | — | — |
| LinkedIn | Skip (B2C, не наш ICP) | — | — | — |
| Threads | Defer (emerging, 0 ROI) | — | — | — |

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

### Stack

**Astro (static) + native React island form (~2KB gzip) + fetch() → n8n webhook + Airtable (CRM) + Google Sheet (live counter).**

**Чому native form, не Tally** (Round 2 decision): Tally iframe додає ~40KB JS зайвого bundle + меншe контролю над UX (особливо success card з pill chips quick-poll). Native island дає (1) повний контроль над поведінкою, (2) нуль зайвого JS, (3) inline error handling. **Tally — Plan B** якщо solo dev wants ship за день без коду форми.

### UTM tracking

Зберігати у `localStorage` при першому візиті → передавати при signup до n8n webhook → Airtable column. Так attribution не втрачається при delayed conversion.

Параметри: `utm_source` (telegram/instagram/x/blog) + `utm_medium` (social/inline-cta) + `utm_campaign` (pre-launch-waitlist / [blog-slug]) + `utm_content` ([post-id]/cta-top/cta-mid/cta-exit).

### Urgency mechanic

- **Live counter** (Google Sheet): n8n пише `waitlist_count` кожні 30 хв → лендинг читає через Sheets JSON API → "847 людей вже чекають".
- **Early-bird badge** (статичний): "Перші 500 отримують early access".
- **НЕ робити**: fake countdown, псевдо-динамічний лічильник. Шкодить довірі UA-аудиторії.

### Referral mechanic

1. Signup → n8n генерує `nanoid(8)` як `ref_code` → Airtable (email + ref_code + invited_by + invite_count=0).
2. Юзер ділиться: `sergeant.app/?ref=ABCD1234`.
3. Новий signup з `?ref=` → n8n webhook → Airtable lookup інвайтера → `invite_count++`.
4. `invite_count === 3` → email інвайтеру: "Ти запросив 3 друзів — ти серед першої черги."

Стек: тільки Airtable + n8n + URL params. Без backend, без JWT.

Social amplification: раз на 2 тижні Telegram-пост "Топ запрошувачів тижня" з @username (з їх згоди). Інтегровано в **Community moments** content pillar, не окремий 6-й pillar.

### North-star metrics + benchmarks

| Метрика | OK threshold | Rationale |
|---|---|---|
| Signup rate (landing → submit) | ≥ 8% | UA SaaS норма 5-12% для нішевих продуктів |
| Email open rate (drip) | ≥ 40% | Pre-launch warm list; <30% — red flag |
| Referral K-factor | ≥ 0.25 | Кожен 4-й запрошує 1 друга → organic growth loop |
| Blog → signup CR | ≥ 3% | З organic traffic; нижче — CTA слабкий |
| Social → landing CR | ≥ 2% | Instagram/TikTok cold 1-3%; Telegram до 5% |

### Blog CTA placement

3 точки: (1) після intro (перші 150 слів), (2) на 60% scroll після "aha moment", (3) exit-intent overlay. **НЕ в кінці статті** — там читач уже знає чи піде.

CTA copy: «Увійди в перших 500» / «Спробуй першим — early access» (scarcity + конкретна вигода). **Не**: «Приєднайся до waitlist» (слабко, пасивно).

## N8n flow inventory (10 flows total)

### Waitlist + funnel (4)

1. **Signup → CRM**: Webhook → parse UTM body (localStorage-збережені) → Airtable create (email, utm_*, ref_code=nanoid(8), invited_by=?ref, module_interest=null) → confirmation email Day 0. **Second async webhook** для post-submit module-interest poll → Airtable update by email → fills module_interest column.
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

### Phase 0 — Foundation (Week 0-1, no public output)

Підготовка stack + governance assets перед першим публічним постом.

| # | Task | Effort |
|---|---|---|
| 0.1 | Створити Airtable бази: `waitlist` (схема: email, module_interest, utm_*, ref_code, invited_by, invite_count, signup_date, status) | XS |
| 0.2 | Створити Google Sheet `waitlist_counter` + n8n cron 30-хв sync з Airtable | XS |
| 0.3 | Скласти n8n flows #1 (signup → CRM) + #2 (drip scheduler) + #3 (referral attribution) — test з 3 fake signup | S |
| 0.4 | Скласти email templates × 5 для drip (per-module branch для Day 2) у Resend/SendGrid | S |
| 0.5 | Закласти voice playbook як constant prompt у Claude/n8n templates (automation prepublish checklist active) | S |
| 0.6 | Bootstrap Astro project (separate repo або subfolder), Tailwind preset з `packages/design-tokens/` | M |
| 0.7 | Setup Telegram-каналу + X account + Instagram account з consistent handles (`@sergeant_app` або similar) + bios з social tagline «Маленькі кроки. Щоденно.» | XS |

### Phase 1 — Ship landing + waitlist (Week 1-2)

| # | Task | Effort |
|---|---|---|
| 1.1 | Landing IA build: hero + problem bar + module showcase (tabbed/carousel) + how-it-works + value props + waitlist form + FAQ + footer | M |
| 1.2 | Waitlist form: email only → n8n webhook (single field MVP) | S |
| 1.2a | Post-submit success card з optional module-interest pill chips (async secondary webhook) | S |
| 1.3 | Sticky footer CTA (Intersection Observer → scroll to `#waitlist`) | XS |
| 1.4 | Inline success state (no redirect, 3-step timeline + referral CTA) | S |
| 1.5 | UTM `localStorage` capture | XS |
| 1.6 | Live counter widget (read Google Sheet JSON API) | XS |
| 1.7 | `/llms.txt` у корені (~500 слів, нейтральний tone) | XS |
| 1.8 | `SoftwareApplication` + `Organization` JSON-LD schema на main landing | XS |
| 1.9 | Deploy до Vercel + custom domain | S |
| 1.10 | Mobile QA на real iPhone + Android budget (Moto G class) | S |

**Verification:**
- Lighthouse mobile ≥ 90 на всіх 4 axes
- Form submit → Airtable entry within 5 sec → confirmation email within 5 min
- 3 test signups з different `?ref=` URLs → invite_count increments correctly
- Live counter показує real number

### Phase 2 — Content engine ignition (Week 2-4)

| # | Task | Effort |
|---|---|---|
| 2.1 | Pillar content #1: «Повний гайд: як вести особистий бюджет» (Finyk) — 2500 слів з voice-injected prompt + manual edit | L |
| 2.2 | Blog setup (Ghost або Notion + Astro static fetch) | M |
| 2.3 | Inline CTA placement (intro 150 слів, 60% scroll, exit-intent) | S |
| 2.4 | N8n flow #5 (blog → Telegram teaser + X thread) | M |
| 2.5 | N8n flow #8 (auto-FAQ Schema на publish) | S |
| 2.6 | Pillar content #2: Nutrition «Правильне харчування без дієт» | L |
| 2.7 | Pillar content #3: Routine «Як виробити звичку і не кинути» | L |

### Phase 3 — Social channel activation (Week 1-4, parallel to Phase 2)

**Week 1 — "Ми існуємо"**
- Day 1: Announce-пост everywhere (tagline + 4 модулі + waitlist link + referral CTA одразу).
- Telegram: "Чому я будую Sergeant" — особиста story 300 слів.
- X: Thread "4 речі яких мені не вистачало як продакту в UA" → перехід до продукту.
- Instagram: Carousel "Що таке Sergeant" (5 слайдів, 1 модуль = 1 slide).

**Week 2 — Module deep-dive: Finyk**
- Telegram: "Як я відстежую фінанси з Finyk" — real use case.
- X: BIP thread "Чому копійки а не гривні всередині" (технічна деталь).
- Instagram: Carousel "5 категорій витрат UA-розробника".
- Stories poll: "Ти ведеш бюджет?" (data collection для контенту).
- **First "referral leaderboard" пост** як proof of social momentum.

**Week 3 — Module deep-dive: Routine + BIP**
- Telegram: "Що зламалось цього тижня і як AI допоміг".
- X: BIP thread з реальним прикладом n8n flow або typecheck регресії.
- Instagram: Carousel "Як побудувати звичку за допомогою Routine".
- Milestone post: якщо 100+ waitlist — celebrate публічно.

**Week 4 — Community + waitlist push**
- Telegram: "100 людей чекають на Sergeant — ось що вони хочуть".
- X: Retweet/quote найкращих відгуків, Q&A thread.
- Instagram: User-generated-style контент (beta-тестери цитати як carousel).
- Waitlist CTA в кожному пості цього тижня.

### Phase 4 — Refinement (Month 2-3)

| # | Task | Effort |
|---|---|---|
| 4.1 | Programmatic SEO Routine MVP (10 шаблонних "як виробити X" сторінок) | M |
| 4.2 | N8n flow #6 (waitlist milestone alerts автодрафт) | S |
| 4.3 | N8n flow #9 (keyword position check + Telegram alert) | M |
| 4.4 | N8n flow #7 (X mention CRM capture + weekly digest) | S |
| 4.5 | UA creator collab outreach — beta access в обмін на огляд у 3-5 UA productivity Telegram каналах | M |
| 4.6 | A/B test hero H1 ("Усе про себе — в одному місці" vs alternative) | S |
| 4.7 | Pillar content #4, #5 (brand story + comparison) | M |

### Phase 5 — Launch transition (when App Store approval lands)

| # | Task |
|---|---|
| 5.1 | Замінити waitlist форму на "Завантажити" CTA з прямими store-links |
| 5.2 | Масовий email всьому waitlist: "Sergeant вже в App Store — ти серед перших" |
| 5.3 | Деактивувати drip-scheduler у n8n |
| 5.4 | Airtable status="launched" для аналітики |
| 5.5 | Ref-коди лишити активними +30 днів для word-of-mouth metrics |
| 5.6 | Launch Phase 6: `/compare/` сторінки (потрібна domain authority вже накопичена) |
| 5.7 | Розглянути TikTok activation (post-launch, не раніше) |
| 5.8 | Розглянути open Telegram-group або enable channel comments (якщо 500+ waitlist / 50+ DAU) |

## Dependency tree

```
Phase 0 — Foundation
    ├── 0.1-0.5 (Airtable + n8n core) — блокує всі signup flows
    ├── 0.6 (Astro bootstrap) — блокує Phase 1
    └── 0.7 (Social accounts) — блокує Phase 3 Day 1

Phase 1 — Landing ship (depends on 0.1-0.6)
    └── Live waitlist + drip + counter + llms.txt + schema

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

`brandbook.md` каже "Soft & Organic пастель"; `redesign-v2.md` ввів "bright module-tinted" hero gradients. Marketing decision:

- **Landing Hub-Hero** (top of `/`) — **Soft & Organic** кремовий (`#fdf9f3 → #f0fdfa`). Зберігає voice ambiguity-free.
- **Module showcase секції на landing** — bright tinted (`--hero-grad-{module}`). Демонструють ідентичність модулів.
- **Marketing assets (соцмережі, email headers)** — нейтральний або Emerald-палітра. Не яскраві coral/lime окрім module-специфічного контенту.

Це закриває T4 token gap з [`redesign-v2-execution-plan.md`](../design/redesign-v2-execution-plan.md) як **policy decision**, не код. У brandbook.md можна додати «hero gradient lives in module-showcase scope; main hero stays Soft & Organic» одним рядком.

## Open questions / decisions deferred

- **Hero H1 final**: «Усе про себе — в одному місці» (intrigue) vs «Один застосунок. Чотири модулі. Уся картина.» (proof). **Рекомендація: ship intrigue, A/B test після 200 signups.**
- **Tally.so vs custom Astro form**: **Round 2 decision: native Astro form island.** ~40KB Tally bundle penalty не варто заради 1-day ship convenience. Tally — Plan B only якщо solo dev hits unblocked-by-code wall.
- **Invite-only з position number** vs simple waitlist email: складніша реферальна mechanics. **Рекомендація: simple waitlist MVP; pivot на position-bump якщо K-factor < 0.3 за 30 днів.**
- **Telegram-канал vs group**: канал до launch. **Decision threshold: 500+ waitlist OR 50+ DAU**.
- **Discord**: skip permanently (over-engineered для UA productivity).
- **Threads**: defer до Q4 2026 (emerging, 0 ROI зараз).
- **LinkedIn**: skip permanently (B2C, не наш ICP).

## Refs

- [`../design/brandbook.md`](../design/brandbook.md) — voice + palette + references
- [`../design/redesign-v2-execution-plan.md`](../design/redesign-v2-execution-plan.md) — паралельний product polish plan
- [`../design/cross-module-prompts.md`](../design/cross-module-prompts.md) — cross-module value framing (transferable у marketing copy)
- [`../design/empty-states.md`](../design/empty-states.md) — value-first vs feature-first framing (transferable у landing copy)
