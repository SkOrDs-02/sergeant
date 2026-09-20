<!-- Lifecycle: Active | Owner: product | Added: 2026-09-17 | Next review: 2027-03-17 -->

# Дизайн-контракт: лендінг

> **Last touched:** 2026-09-19 by @claude. **Next review:** 2027-03-29.
> **Status:** Active — контракт as-built: описує `apps/landing/src/index.css` (`@theme`), `index.html`, `App.tsx`, `components/{SiteLayout,SiteHeader,SiteFooter,TelegramCta,Wordmark,HomeSections,MonoAccessTable,UpdatedOn,GuideHomeModule}.tsx`, `pages/{HomePage,BetaPage,PytannyaPage,NotFoundPage,PrivacyPage}.tsx` (решта 26 сторінок успадковують ті самі класи), `lib/{analytics,links,pageMeta,routeMeta.json}`, `content/*`, тести `tokens.drift.test.ts`, `copy.consistency.test.ts`, `copy.slop.test.ts` (з 2026-09-17), `routeRegistry.test.ts`, гейти `tests/a11y/axe.spec.ts`, `lighthouserc.json` і CI-джобу `Landing quality (axe + Lighthouse)` станом на 2026-09-17. Код не змінювався; розбіжності з каноном позначені **[борг]** із файлом і рядком — їх 11, усі в коментарях, доках і межах гейтів, жодного в рантаймі.

Публічний маркетинговий сайт `apps/landing` (31 маршрут із `routeMeta.json`,
`README.md:6`): окремий статичний Vite + React + Tailwind 4 застосунок із
власним `@theme`, без client-side router (`App.tsx:35-40`), без бекенду
(`vite.config.ts:27-32`) і з однією дією на всіх сторінках — переходом у
Telegram-бот черги (`TelegramCta.tsx:24-29`). До 2026-09-17 поверхня не
мала дизайн-контракту: індекс дизайн-доків описував її як «нейтральний
stone-бренд без модульного акценту та компоненти хаба»
(`docs/design/design/README.md:24-27`), а в коді вона — тепла паперова
основа з Unbounded, кольоровими блоками модулів і гострими кутами
(`index.css:3-8`).

## Проблема

Лендінг — єдина поверхня, яку людина бачить **до** продукту, і єдина, чий
канал — пошук і ШІ-краулери (`ci.yml:954-957`). При цьому він не ділить із
`apps/web` ні рантайм токенів, ні примітивів: `packages/design-tokens` —
Tailwind-3 preset з rgb-триплетами, а лендінг на Tailwind 4 з `@theme`
(`index.css:15-18`, `tokens.drift.test.ts:12-14`). Агент, який приходить
сюди з каноном `apps/web` (`Button (variant, tone)`, `.text-style-*`,
stone-бренд), не має жодного правила, що тут спільне, а що навмисно
власне — і ризикує або «виправити» паперову основу на stone, або занести
шосту кнопку. Історія вже це показала: до тесту дрейфу лендінг малював
Фінік кольором emerald-500 через два місяці після переходу системи на
teal-700 (`tokens.drift.test.ts:16-18`).

## Мета

Один документ, за яким (а) рев'ю перевіряє PR у `apps/landing` на палітру,
примітиви, стани й тон, (б) агент верстає нову сторінку чи секцію, не
вигадуючи, і (в) зафіксовано межу між спільним і власним: що тримає
`tokens.drift.test.ts`, а що — лише цей текст. Контракт as-built: кожне
правило нижче або вже так у коді, або позначене як **[борг]** із файлом.

## Продуктові рішення, на які спирається контракт

- **Напрям «Порядок без крику» (2026-08-27)** — гібрид двох гіпотез: тепла
  паперова основа з «рукописними» нотатками-інсайтами + бренд-характер
  (Unbounded, кольорові блоки модулів, гострі кути) (`index.css:3-8`).
  Анти-слоп-аудит назвав лендінг однією з трьох поверхонь, що пройшли
  тест підміни без застережень (`anti-slop-strategy.md:316`).
- **Одна дія — Telegram, форми немає.** Бот не може написати першим, тож
  зібраний email не має сенсу; email-форму знято, серверний
  `POST /api/v1/waitlist` живий, але лендінг у нього не пише
  (`README.md:117-121`, `TelegramCta.tsx:26-29`). `WaitlistForm` із
  `validation.emailInvalidPublic` живе в `apps/web` на `/pricing`
  (`apps/web/src/core/pricing/WaitlistForm.tsx:79`) і належить
  pricing-контракту, не цьому.
- **Cookieless.** `persistence: "memory"`, `person_profiles: "never"`, без
  autocapture, pageview-хуків і session-recording (`analytics.ts:41-61`).
  Атрибуція «клік → /start у боті» іде одноразовим токеном у deep link, а не
  ідентифікатором людини (`landingAttribution.ts:13-21`).
- **Сторінка = одне питання людини; секція без URL не існує.** У шапці
  жодних якорів, чотири модулі — чотири сторінки (`SiteHeader.tsx:4-8`).
- **Бета хвилями, без публічної дати; ядро безкоштовне назавжди**
  (`BetaPage.tsx:17-19`, `HomeSections.tsx:279-286`). `/beta` — `noindex`,
  живе лише як гейт конверсії (`routeMeta.json:10`,
  `routeRegistry.test.ts:33-37`).
- **Чесність як формула, не як речення:** експорт, непродаж даних, імʼя
  автора і шкала впевненості — по одному джерелу в `src/content/`
  (`exportClaim.ts`, `noSaleClaim.ts`, `author.ts`,
  `confidenceLevels.ts`), розходження ловить `copy.consistency.test.ts`.

## Палітра і тон поверхні

Лендінг — **не stone**. Основа — теплий папір із warm-black текстом, бренд —
emerald-700, модулі — повноширинні кольорові блоки, темні CTA-смуги —
«Чорнило». Усе визначено в `@theme` `index.css:21-110`; у `className` hex
немає (`check-design-conventions.mjs:55` сканує `apps/landing/src`, allowlist
`rawHexInClassName` порожній, `:64`).

### Що спільне з `apps/web` (тримає `tokens.drift.test.ts`)

Спільного рантайму немає; синхронність тримає тест, який читає `index.css`
регексом і порівнює з `@sergeant/design-tokens/tokens`
(`tokens.drift.test.ts:20-29`). **Межа тесту — рівно ці токени; токен, якого
тест не називає, синхронним не є, навіть якщо стоїть у тому ж блоці під тим
самим коментарем** (`tokens.drift.test.ts:88-92`, історія `ink-hi`).

| Токен лендінга                                          | Канон у `tokens.js`                                                                 | Рядок тесту |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------- |
| `--color-accent` / `-hover` / `-soft`                   | `brandColors.emerald[700 / 800 / 50]`                                               | `:42-52`    |
| `--color-finyk` / `-fizruk` / `-routine`                | `moduleColors.<m>.primary` (teal-700, cyan-700, rose-500)                           | `:54-60`    |
| `--color-<m>-soft` (усі чотири)                         | `moduleColors.<m>.surface`                                                          | `:62-71`    |
| `--color-nutrition`                                     | **`#466212` (lime-800, `moduleAccentRgb.nutrition.strong`)**, навмисно НЕ `primary` | `:73-79`    |
| `--color-ink` / `-surface` / `-hi` / `-text` / `-muted` | `inkTheme.surface.{bg,surface,surfaceHi}`, `inkTheme.text.{strong,muted}`           | `:81-102`   |
| `--color-<m>-glow`                                      | `inkTheme.accent.<m>` (тир-400)                                                     | `:104-113`  |
| `--color-danger`                                        | `#c23a3a` і **≠** `--color-routine`                                                 | `:115-124`  |

Поза тестом (власні значення лендінга, не дзеркала): `--color-background`
`#f3ede2`, `--color-surface` `#faf7f1`, `--color-card` `#ffffff`,
`--color-note` `#fbf3df`, `--color-cardline(-strong)`, чотири текстові тири
`foreground(-strong)` / `muted` / `subtle`, `--color-routine-strong`
`#b8395e`, `--color-ink-line`, `--radius-card: 6px` (`index.css:27-40,
65-74, 95, 108-109`). Додаєш `--color-ink-*` чи модульний токен — додавай
рядок у тест (`tokens.drift.test.ts:92`).

**[борг]** `docs/design/design/brandbook.md:8` і `:287-289` кажуть, що
кремова рампа `cream.*` лишається «для `apps/landing`» і що `#fdf9f3`
(`cream.100`) є фоном лендінга (`--color-background`). У коді фон —
`#f3ede2` (`index.css:29`), поверхня — `#faf7f1` (`:30`), і жодне з них не
є значенням `cream.*` (`tokens.js:60-67`). Брендбук описує стан до напряму
2026-08-27.

### Ролі кольорів

| Елемент                         | Канон                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Сторінка                        | `body` — `bg-background` + `text-foreground` + `font-sans` (`index.css:116-121`); `html.bg-background` (`index.html:2`); `theme-color` = `#f3ede2`, той самий hex (`index.html:16`).                                                                                                                                                                                                   |
| Шапка / підвал                  | Лінії `border-b-2` / `border-t-2 border-foreground-strong` (`SiteHeader.tsx:92`, `SiteFooter.tsx:9`). Це «статутна» лінія напряму, а не `cardline`.                                                                                                                                                                                                                                    |
| «Паперові» картки колажу        | `bg-card` (дані) або `bg-note` (нотатка-інсайт), `rounded-[var(--radius-card)]`, `paper-shadow` / `paper-shadow-lg` (тепла тінь без синяви, `index.css:123-130`), нахил `-rotate-3` … `rotate-[1.5deg]` (`HomePage.tsx:80,99,130`). Порожня нотатка — `border-2 border-dashed border-cardline-strong` **без тіні**: право мовчати, показане версткою (`HomeSections.tsx:115-119,164`). |
| Блоки модулів на головній       | Акцент = сама поверхня: `bg-finyk` і `bg-fizruk` з `text-ink-text`; `bg-routine` і **`bg-nutrition-glow`** (lime-400, а не lime-800) з `text-ink` (`HomeSections.tsx:55-109`). Rose-400 тримає лише великі заливки (`index.css:66-68`). Module-accent containment — колір живе всередині свого блока (`HomeSections.tsx:26-28`).                                                       |
| Мітка модуля на своїй сторінці  | `font-display text-xs uppercase tracking-[0.12em]` кольором модуля: `text-finyk`, `text-fizruk`, `text-nutrition`, а для Рутини — **`text-routine-strong`** (`HroshiPage.tsx:115`, `TrenuvanniaPage.tsx:53`, `YizhaPage.tsx:65`, `ZvychkyPage.tsx:52`): rose-500 як текст на папері дає ~2.6:1 (`index.css:65-73`).                                                                    |
| Підписи пар у нотатках звʼязків | Той самий принцип: `text-fizruk` / `text-nutrition` / `text-finyk` / `text-routine-strong`, `aria-hidden` (`HomeSections.tsx:131-138,150-154,166-171`).                                                                                                                                                                                                                                |
| Бренд-акцент `text-accent`      | Лише як семантичний «так/добре»: код `404` (`NotFoundPage.tsx:20`), клітинки «Бачить» у `MonoAccessTable.tsx:35`, чек-таблиця гайда (`GuideChekyPage.tsx:86`). Кнопок брендом не фарбують.                                                                                                                                                                                             |
| Помилка / «Не бачить»           | `text-danger` (`MonoAccessTable.tsx:35`) — власний семантичний токен, ніколи модульний (`index.css:76-83`).                                                                                                                                                                                                                                                                            |
| «Чорнило»                       | `bg-ink text-ink-text` для CTA-смуг (`HomeSections.tsx:275`, `BetaPage.tsx:80`, `AboutPage.tsx:137`) і для врізок у гайдах (`rounded-[var(--radius-card)] bg-ink px-7 py-6`, напр. `GuideMonobankPage.tsx:52`); підписи на чорнилі — `text-ink-muted`.                                                                                                                                 |
| Прогрес-бар у hero              | Трек `bg-finyk-soft`, заповнення `bg-finyk` (`HomePage.tsx:87-91`) — єдине місце, де `-soft` модуля працює як трек.                                                                                                                                                                                                                                                                    |

**[борг]** `index.css:78` посилається на «Hard Rule #12 у apps/web» —
правило retired рішенням ADR-0081 (`AGENTS.md § Hard rules`); чинна назва
конвенції — module-accent containment (tokens + review).

### Типографіка

Дві родини, обидві самохостинг: `--font-sans` Manrope Variable (канонічний
шрифт продукту, має кирилицю) і `--font-display` Unbounded 500/700/800
(`index.css:22-25`, `main.tsx:3-16`). Google Fonts прибрано: зовнішній
запит віддавав IP відвідувача, а DM Sans не мав кирилиці (`index.html:38-41`).
Ролей `.text-style-*` тут **немає** — це preset `apps/web`
(`02-typography.md:119-121`); лендінг тримає власну шкалу Tailwind-класами:

| Роль                      | Класи                                                                                                                                | Де                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| h1 головної               | `font-display text-[44px] font-extrabold uppercase leading-[1.05] tracking-tight sm:text-6xl lg:text-[62px]`                         | `HomePage.tsx:186`                           |
| h1 сторінки               | `font-display text-3xl`/`text-4xl font-extrabold uppercase … sm:text-5xl`                                                            | `BetaPage.tsx:41`, `ZvychkyPage.tsx:55`      |
| h2 секції                 | `font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl`                                   | `HomeSections.tsx:45,190`                    |
| Мітка блока / групи       | `font-display text-xs font-medium` (або `font-bold`) `uppercase tracking-[0.12em]`                                                   | `HomeSections.tsx:38`, `SiteHeader.tsx:154`  |
| Заголовок групи в підвалі | `font-display text-xs font-bold uppercase tracking-[0.08em] text-subtle`                                                             | `SiteFooter.tsx:25`                          |
| Лід / body                | `text-lg leading-relaxed text-muted` (лід), `text-sm leading-relaxed text-muted` (body), `text-pretty` / `text-balance` де є перенос | `HomePage.tsx:191`, `HomeSections.tsx:48`    |
| Цитата-інсайт             | `text-lg font-medium leading-snug text-foreground` у `<blockquote>`                                                                  | `HomeSections.tsx:139`                       |
| Підпис / meta             | `text-xs text-subtle`, `text-[13px] font-bold` для назв карток                                                                       | `HomeSections.tsx:142`, `HomePage.tsx:81-82` |

Підлога 12px: найменше в коді — `text-xs` (12px) і `text-[13px]`; гейт
`check-design-conventions.mjs` (`text-2xs` і `text-[<12px]`) на лендінгу на
нулі (`:44-47`). Числа — `tabular-nums` і нерозривні пробіли з `&#8239;₴`
(`HomePage.tsx:83-85`).

### Форма, радіус, motion

- **Гострі кути — частина напряму.** Кнопки, блоки модулів, таблиці — без
  `rounded-*`; `--radius-card: 6px` лише для паперових карток
  (`index.css:108-109`). Сітка «01/02/03» — `gap-px bg-cardline-strong`
  з клітинками `bg-background` (`ZvychkyPage.tsx:77-79`).
- **Motion — мінімальний, з reduced-motion.** `scroll-behavior: smooth`
  вимикається під `prefers-reduced-motion` (`index.css:112-136`); бар у
  hero — `transition-[width] duration-300 motion-reduce:transition-none`
  (`HomePage.tsx:89`); шеврон FAQ — `group-open:rotate-45
motion-reduce:transition-none` (`PytannyaPage.tsx:63`). Автоплей-анімацій,
  parallax і конфеті немає.
- **Гліфи** — інлайн-SVG з ручних path-ів (`Wordmark.tsx:1-27`,
  `HomeSections.tsx:9-23`, бургер `SiteHeader.tsx:127-142`), `aria-hidden`.
  Жодних емодзі й іконкових бібліотек (`package.json:19-26` їх не має).

## Примітиви й кнопки

Спільного `Button` тут **немає**: `@sergeant/shared` дає лише контракти
аналітики й атрибуції (`package.json:22`), `@sergeant/design-tokens` — лише
devDependency для тесту дрейфу (`:31`). Кнопки — це `<a>` з повторюваним
класом. Канон `apps/web` `(variant, tone)` (`04-components.md:58-63`) сюди не
переноситься; власний канон лендінга — дві «кнопки» і один тип посилання:

| Елемент                               | Канон                                                                                                                                                                                                                                                                  | Стан у коді                                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTA «ink» (на папері)                 | `inline-flex min-h-12 items-center justify-center px-8 py-4 font-display text-sm font-bold uppercase tracking-[0.08em] bg-foreground-strong text-background hover:bg-ink-hi`, фокус `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink` | так — `TelegramCta.tsx:46-49,64`; той самий клас руками на `HomePage.tsx:219`, `NotFoundPage.tsx:31`, у шапці `SiteHeader.tsx:109,115,172` (там `min-h-11` + `text-xs`) |
| CTA «inverse» (на чорнилі)            | Те саме, палітра `bg-background text-foreground-strong hover:bg-card`, фокус `focus-visible:outline-ink-text`                                                                                                                                                          | так — `TelegramCta variant="inverse"` (`HomeSections.tsx:288-292`, `BetaPage.tsx:90-94`)                                                                                |
| Текстове посилання в прозі            | `font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current` + той самий фокус                                                                                                                          | так — `HomeSections.tsx:205,233,256`, `GuideHomeModule.tsx:17`, `StanPage.tsx:70-71`, `PytannyaPage.tsx:86`                                                             |
| Навігаційне посилання (шапка)         | `text-sm font-semibold text-foreground` + `hover:text-foreground-strong` + фокус                                                                                                                                                                                       | так, але без `min-h` (`SiteHeader.tsx:83-84`) — див. [борг] нижче                                                                                                       |
| Навігаційне посилання (мобільне меню) | `flex min-h-11 items-center border-t border-cardline text-base font-semibold`                                                                                                                                                                                          | так — `SiteHeader.tsx:86-87`                                                                                                                                            |
| Посилання підвалу                     | `inline-flex min-h-11 items-center` + hover/фокус                                                                                                                                                                                                                      | так — `SiteFooter.tsx:5-6`                                                                                                                                              |
| Перемикач у hero (1/3/5)              | `<button aria-pressed>` `h-11 w-11 border-2 border-foreground-strong font-display text-[13px] font-bold`; активний `bg-foreground-strong text-background`, неактивний `bg-background hover:bg-cardline`                                                                | так — `HomePage.tsx:105-125`, група `role="group" aria-label` (`:96-99`)                                                                                                |
| Бургер                                | `<button aria-expanded aria-controls="mobile-nav" aria-label>` `min-h-11 min-w-11`, шлях іконки міняється за станом                                                                                                                                                    | так — `SiteHeader.tsx:119-143`                                                                                                                                          |
| FAQ                                   | Нативний `<details name="faq">` + `<summary>` `min-h-11` з `<h2>` усередині, маркер прихований                                                                                                                                                                         | так — `PytannyaPage.tsx:43-69`                                                                                                                                          |

Фокус скрізь — `outline`, не `ring`, і лише `focus-visible:` (гейт
`focusVariant`, `check-design-conventions.mjs:92-95`; у `apps/landing/src`
збігів `focus:` немає). Touch targets: усі CTA — `min-h-12` або `min-h-11`,
клітинки перемикача 44×44 (`h-11 w-11`); 12 явних `min-h-11/12` у 7 файлах.
Механічного 44px-гейта на лендінгу **немає**: `Mobile UI audit` у `ci.yml`
міряє лише `apps/web` (`AGENTS.md § Touch targets`).

**[борг]** `SiteHeader.tsx:83-84` — desktop-навігація (`hidden … md:flex`,
`:98`) не має `min-h-11`, на відміну від мобільного меню (`:86-87`) і
підвалу (`SiteFooter.tsx:5-6`); на планшеті з coarse pointer при ≥768px це
цілі нижче 44px.

## Стани, які поверхня зобов'язана мати

Форми немає, тож класичних станів waitlist (успіх / помилка / дубль) на
клієнті **не існує за задумом**: клік — остання подія, яку бачить сайт;
далі все в Telegram (`TelegramCta.tsx:26-29`, `analyticsEvents.ts:348-349`).

| Стан                      | Поведінка                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTA за замовчуванням      | `<a target="_blank" rel="noreferrer">` на `https://t.me/<bot>?start=<placement>_<ref>` (`links.ts:19-21`, `TelegramCta.tsx:52-55`); бот — `VITE_TELEGRAM_BOT` або `serg_qa_bot` (`links.ts:11-12`). Лейбл за замовчуванням «Приєднатися через Telegram», на сторінках — «Стати в чергу» / «Стати в чергу в Telegram» (`TelegramCta.tsx:66`, `BetaPage.tsx:92`). |
| «Успіх»                   | На сайті не показується: бот відповідає в Telegram; вебхук бота шле `LANDING_TELEGRAM_STARTED` серверним транспортом (`analyticsEvents.ts:340-353`).                                                                                                                                                                                                            |
| «Дубль» / повторний клік  | Кожне завантаження сторінки дає новий `ref` через ініціалізатор `useState`, щоб `href` і подія не розійшлись між рендером і кліком (`TelegramCta.tsx:36-39,45`); дедуп — на боці бота (`parseLandingStartPayload`, `landingAttribution.ts:69-87`).                                                                                                              |
| Офлайн                    | Стану в коді немає: у `src/` жодного `navigator.onLine`/`fetch`; сторінка статична, клік веде на зовнішній хост, і відмову показує браузер. Це наслідок рішення «без форми», а не пропуск.                                                                                                                                                                      |
| Аналітика без ключа       | `initAnalytics()` — повний no-op без `VITE_POSTHOG_KEY`; `track()` тихо повертається (`analytics.ts:30-37,86-94`). Блокувальник реклами → `catch` чистить чергу, сторінка не ламається (`:76-79`).                                                                                                                                                              |
| Мобільне меню відкрите    | `aria-expanded`, `Escape` і pointerdown повз шапку закривають (`SiteHeader.tsx:64-81`); клік по пункту теж закриває (`:163,171`).                                                                                                                                                                                                                               |
| Hero-віджет 1 / 3 / 5     | Перемикає суму, відсоток бару і текст нотатки (`HomePage.tsx:23-39`); `aria-pressed` на активній клітинці; підпис бере рівень із `CONFIDENCE.stable` (`:41`).                                                                                                                                                                                                   |
| Порожня закономірність    | Третя нотатка — пунктир без тіні, `text-subtle`, `figcaption` sr-only «ще не підтверджено» (`HomeSections.tsx:164-179`).                                                                                                                                                                                                                                        |
| Перехід за якорем `/#faq` | Докручує `scrollIntoView` після першого кадру, бо нативний скрол по хешу промахується до маунта (`App.tsx:107-119`).                                                                                                                                                                                                                                            |
| Невідомий URL             | `NotFoundPage` із власним title, `noindex`, CTA «На головну» (`NotFoundPage.tsx:15-35`); Vercel віддає `dist/404.html` зі статусом 404, catch-all rewrite прибрано 2026-09-02 (`README.md:75-81`, `vercel.json` без `rewrites`).                                                                                                                                |
| `/beta`                   | `noindex` (`routeMeta.json:10`), не в sitemap і не в `llms.txt` (`routeRegistry.test.ts:33-41`).                                                                                                                                                                                                                                                                |
| Дата на сторінці          | `UpdatedOn` з `lastmod` маршруту — одне джерело для видимої дати, sitemap і `dateModified` (`UpdatedOn.tsx:3-8`); `/stan` додатково звіряє `STATUS_UPDATED` з `lastmod` (`copy.consistency.test.ts:86-88`).                                                                                                                                                     |

**[борг]** `NotFoundPage.tsx:11-13` — коментар описує catch-all rewrite,
що «віддає з тілом головної»; rewrite прибрано 2026-09-02
(`README.md:75-81`, `vercel.json:8-14` містить лише `redirects`).

## Копі

- **Каталогу i18n немає.** Копі живе в JSX сторінок і компонентів; те, що
  мусить збігатися між сторінками, — у `src/content/` (`author.ts`,
  `confidenceLevels.ts`, `exportClaim.ts`, `noSaleClaim.ts`, `faqItems.ts`);
  SEO-рядки — у `lib/routeMeta.json`; карта для агентів — рукописний
  `public/llms.txt`. `LANDING_LOCALE = "uk"`, сайт лише україномовний
  (`analytics.ts:19-20`).
- **Гейт узгодженості — `copy.consistency.test.ts`:** «один клік» не поруч
  з «експорт» (`:34-49`), `EXPORT_CLAIM` / `NO_SALE_CLAIM` / `CONFIDENCE.*` /
  `AUTHOR_NAME` беруться з джерела, а не літералом (`:51-84,128-141`),
  «щонайменше за 30 днів» однаково на трьох сторінках (`:93-101`), слова
  «стрік» немає ніде включно з `routeMeta.json` і `llms.txt` (`:105-122`).
- **Тон — за [`style-guide.uk.md`](../../../product/copy/style-guide.uk.md)**,
  і код його виконує: «ти» («Сержант на твоєму боці», `HomePage.tsx:193-194`),
  перша особа автора для обіцянок («я напишу, коли відкриється твоя»,
  `HomeSections.tsx:282`; «Чому я це роблю», `:221`), коротке тире `–`
  замість `—` (`HomePage.tsx:192`, §1.9-9а), апостроф `ʼ` U+02BC
  («звʼязки», `HomeSections.tsx:191`, §1.10), кнопки в інфінітиві
  («Стати в чергу», §4). Заголовок плитки — сфера («Гроші»), не
  бренд-імʼя («Фінік»): новачок читає найбільший шрифт
  (`HomeSections.tsx:31-35`).
- Заборонених слів §7 («Будь ласка», «На жаль», «Ой!») у прочитаних
  сторінках немає; «Приєднуйся до бети» стоїть лише в `og:description`
  (`index.html:27`).

- **Гейт тону — `copy.slop.test.ts`** (додано 2026-09-17, хвиля G аудиту
  копії сайту `docs/work/specs/audits/2026-09-17-site-copy-audit.md`
  §6.2): на видимому тексті кожного з 31 маршруту рахує тире « – »,
  антитези «X, а не Y», «чесн\*», фрази мета-чесності, інженерний
  стоп-список, callout-и `border-l-2`, речення з «Тому/Тобто/Тож» на
  початку, changelog-маркери і слова проти бюджету власника (головна
  ≤ 350, модуль ≤ 800, гайд ≤ 550, `/zvyazky` і `/pomichnyk` ≤ 550, решта
  ≤ 400); мету маршрутів і `llms.txt` звіряє на мета-чесність і жаргон.
  У коротких сторінок є абсолютний мінімум (3 тире, 1 антитеза), бо
  густина на 100 слів там вироджується.

**[борг]** ESLint-гейти тону `sergeant-design/ukrainian-copy` і
`no-cyrillic-jsx-literal` обмежені `apps/web/**` (`eslint.web.js:132-147`);
на `apps/landing` їх замінюють рев'ю, `copy.consistency.test.ts` (сторінки
між собою) і `copy.slop.test.ts` (сторінки проти порогів аудиту), а не
лінтер на рівні JSX-літерала.

**[борг]** `docs/design/design/brandbook.md:29-37` описує голос як
«грайливий, гейміфікаційні елементи в дусі Duolingo» з теглайном «Твій
персональний хаб життя»; лендінг верстає «Порядок без крику» і «рахує, а
не читає лекцій» (`HomePage.tsx:187-194`). Брендбук сам віддає перевагу
дизайн-системі при розбіжності (`:17-19`), але голос лендінга ніде в
каноні не зафіксований — крім цього контракту.

## Аналітика

Імена — лише з `ANALYTICS_EVENTS` у `@sergeant/shared` (`analytics.ts:1-4,
15-17`). Лендінг шле **чотири** події, усі content-free:

| Подія                      | Де                                | Payload                                                                                |
| -------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| `landing_viewed`           | `App.tsx:92-101` (кожна сторінка) | `path` (невідоме → `/404`), `locale`, `referrer?` лише зовнішній (`:77-90`)            |
| `landing_telegram_clicked` | `TelegramCta.tsx:56-63`           | `source: hero \| footer \| beta` (`landingAttribution.ts:28`), `locale`, `ref`, `path` |
| `landing_widget_changed`   | `HomePage.tsx:110-116`            | `trainings: 1 \| 3 \| 5`, `locale`                                                     |
| `landing_faq_opened`       | `PytannyaPage.tsx:47-53`          | `question` (літерал із `FAQ_ITEMS`), `locale`                                          |

Друга половина воронки — `landing_telegram_started` із бота; склеювання
**по `ref`**, не по `distinct_id`, бо лендінг cookieless
(`analyticsEvents.ts:355-358`). SDK — динамічний `import("posthog-js")`,
`environment` реєструється супер-властивістю, щоб фільтр по середовищу не
губив події лендінга (`analytics.ts:39-73`). Політика приватності
перелічує всі чотири події словами (`PrivacyPage.tsx:30-35`); нова подія
= новий рядок там (`analyticsEvents.ts:369-370`). Новий інтерактивний
стан без івента не приймається.

**[закрито 2026-09-17]** Чотири борги нижче про застарілий контракт
телеметрії закрито одним PR: коментар `analytics.ts`, коментар
`PrivacyPage.tsx`, таблиця в `apps/landing/README.md` і контракт у
`packages/shared/src/lib/analyticsEvents.ts` тепер описують ті самі
чотири події й `source: hero | footer | beta`; константу
`LANDING_EMAIL_CAPTURED`, що не мала жодного call site, прибрано з реєстру.
Записи лишаються як історія знахідки.

**[борг → закрито]** `analytics.ts:1-9` — коментар називав
`landing_email_captured` і `waitlist_submitted`, «рівно одне поле вводу –
email» і «три явні події»; код шле чотири події, поля вводу немає.
**[борг → закрито]** `PrivacyPage.tsx:8` — «трьома явними подіями» в
коментарі при чотирьох у прозі (`:30-33`).
**[борг → закрито]** `apps/landing/README.md:127-133` — таблиця «Дві події»
без `landing_widget_changed` і `landing_faq_opened`, `source: hero | footer`
без `beta`.
**[борг → закрито]** `packages/shared/src/lib/analyticsEvents.ts:310-324` —
контракт казав, що `apps/landing` шле `LANDING_VIEWED`,
`LANDING_EMAIL_CAPTURED` і `WAITLIST_SUBMITTED` з маршрутами `/thanks`,
`/pricing`; `:336` давав `source: "hero" | "footer" | "thanks"` проти
чинного `LandingPlacement = "hero" | "footer" | "beta"`
(`landingAttribution.ts:28`).

## SEO і доступність

- **Документ:** `<html lang="uk">`, `viewport`, `title` + `description`,
  favicon ICO + SVG + `apple-touch-icon` (iOS не рендерить SVG у цій ролі),
  `og:*` з `og:locale uk_UA`, `twitter:card summary_large_image`
  (`index.html:2-35`). `canonical`, `og:url`, `og:image` дописує білд з
  одного джерела адреси `apps/landing/scripts/site-url.mjs` — домен у HTML руками не
  вписують (`index.html:42-47`, `vite.config.ts:6-25`).
- **Per-route:** `routeMeta.json` — єдине джерело title/description/
  `noindex`/`lastmod`/`ogImage` (`pageMeta.ts:6-11`); `postbuild-seo.mjs`
  кладе per-route HTML + sitemap, `prerender.mjs` — повний HTML кожного
  маршруту через `entry-server.tsx` разом із JSON-LD, щоб краулери без JS
  бачили текст (`entry-server.tsx:8-16`, `README.md:88-104`). Три реєстри
  (`ROUTES`, `routeMeta.json`, `llms.txt`) звіряє `routeRegistry.test.ts`
  разом із межами title 30–60 і description 120–160 (`:85-100`) та
  унікальністю title (`:102-105`).
- **JSON-LD:** `SoftwareApplication` з `featureList`, `offers price 0 UAH`,
  `publisher.sameAs = [THREADS_URL]` на головній (`HomePage.tsx:151-179`);
  `Article` з `author: AUTHOR_JSON_LD` на сторінках і гайдах
  (`ZvychkyPage.tsx:34-42`, гейт `copy.consistency.test.ts:135-137`);
  `FAQPage` з `FAQ_ITEMS` на `/pytannya` (`PytannyaPage.tsx:11-21`).
- **Семантика:** одна `<main>` через `SiteLayout` (`SiteLayout.tsx:24-30`),
  `nav aria-label` для головної, мобільної і футерної навігації
  (`SiteHeader.tsx:97,149`, `SiteFooter.tsx:21`), `<figure>/<blockquote>/
  <figcaption>` для нотаток, `<time dateTime>` для дат, `role="group"` для
  перемикача, sr-only підпис для порожньої нотатки.
- **Axe-гейт по ВСІХ маршрутах** (`tests/a11y/axe.spec.ts:7-19`): список
  із `routeMeta.json` мінус `/404`, теги WCAG 2.1 AA + best-practice,
  блокують лише `serious` / `critical` (`:36-46`); міряється пререндерений
  `dist/` через `vite preview` на :4174 (`playwright.config.ts:10-13,39-47`).
- **Lighthouse-бюджети** (`lighthouserc.json`): desktop-preset, 3 прогони,
  медіана, чотири маршрути (`/`, `/hroshi`, `/guides/monobank`,
  `/pytannya`); `accessibility` і `seo` **= 1**, `best-practices` ≥ 0.95,
  `performance` ≥ 0.9, LCP ≤ 2000 ms і CLS ≤ 0.1 — `error`; FCP ≤ 1500 ms
  і TBT ≤ 200 ms — `warn`. Пороги жорсткіші за `apps/web` (там LCP 3000).
- **CI-джоба `Landing quality (axe + Lighthouse)`** (`ci.yml:951-1009`):
  без `needs:`, щоб червоний `check` її не глушив; Lighthouse-крок під
  `if: always()`, щоб падіння axe не ховало число; звіти — артефакт
  `landing-quality-reports` на 7 днів. До 2026-09-15 лендінг не покривав
  жоден гейт якості (`:954-957`).
- **Заголовки безпеки** — `vercel.json:15-52`: CSP з `script-src 'self'
https://*.posthog.com`, `frame-ancestors 'none'`, HSTS, `nosniff`.

## Чого не робити

- Не тягнути stone-бренд, `MeshBackground`, `Card`/`Button`/`Icon` чи
  `.text-style-*` з `apps/web` — спільного рантайму немає, і напрям інший.
- Не імпортувати `tailwind-preset.js` заради восьми кольорів: мостити
  Tailwind 3 ↔ 4 дорожче за тест дрейфу (`index.css:15-18`).
- Не додавати `--color-*`, що дзеркалить `tokens.js`, без рядка в
  `tokens.drift.test.ts` — інакше він синхронний лише на словах.
- Не писати hex у `className` і не використовувати `focus:` — гейт
  `check-design-conventions.mjs` сканує `apps/landing/src`.
- Не фарбувати помилку модульним акцентом і не брати `text-routine` як
  текст на папері — лише `-strong` (`index.css:65-83`).
- Не повертати email-форму, cookie-persistence, autocapture чи
  session-recording — це ламає cookieless-позицію і політику приватності.
- Не додавати якорі в шапку і секції без власного URL (`SiteHeader.tsx:4-8`).
- Не хардкодити домен, дату, імʼя автора, формулу експорту чи рівень
  впевненості — у кожного є одне джерело і тест.
- Не заводити маршрут без запису в `routeMeta.json`, `llms.txt` і без
  `ogImage` + прогону `generate-og.mjs` (`README.md:179-180`).

## Поза скоупом

- `WaitlistForm` на `/pricing` (`apps/web/src/core/pricing/WaitlistForm.tsx`,
  `validation.emailInvalidPublic` в `uk.ts:66`) — pricing-контракт
  ([`2026-09-16-pricing-paywall-design.md`](./2026-09-16-pricing-paywall-design.md)).
- Telegram-бот, таблиця `telegram_waitlist`, `landing_telegram_started` —
  серверна половина воронки (`analyticsEvents.ts:340-353`).
- Генератор og-картинок `apps/landing/scripts/generate-og.mjs` і скріншоти
  `apps/landing/scripts/shot-pages.mjs` — інструменти, не поверхня.
- Мобільний застосунок — на паузі
  ([ADR-0094](../../../governance/adr/0094-mobile-web-first-freeze.md));
  на сайті згадується лише в «Доповіді про стан» (`StanPage.tsx:22,63-67`).

**[борг]** `docs/design/design/README.md:24-27` перелічує landing серед
поверхонь «без контракту», які «тримає нейтральний stone-бренд без
модульного акценту та компоненти хаба» — жодне з трьох тверджень для
лендінга не відповідає коду; після злиття цього файлу індекс і реєстр
`specs/README.md:23-36` потребують рядка на нього.

## Верифікація

- `pnpm --filter @sergeant/landing test` — `tokens.drift.test.ts` (межа
  дзеркалення з таблиці вище), `copy.consistency.test.ts` (формули копі),
  `routeRegistry.test.ts` (три реєстри маршрутів, межі SEO-рядків),
  `lib/dates.test.ts`.
- `pnpm --filter @sergeant/landing test:a11y` — axe по всіх маршрутах;
  webServer сам робить `build` + `vite preview :4174`
  (`playwright.config.ts:39-47`).
- `pnpm --filter @sergeant/landing build && pnpm --filter @sergeant/landing lighthouse`
  — бюджети з `lighthouserc.json` на :4175.
- `pnpm lint:design-conventions` — hex у className, `focus:`, 12px floor;
  `apps/landing/src` у `SCAN_DIRS` (`check-design-conventions.mjs:55`).
  `pnpm lint:ui-canon` лендінг **не** сканує (скрипт `apps/landing` не
  згадує) — легасі-кнопок тут і немає, бо немає `Button`.
- `pnpm --filter @sergeant/landing lint && pnpm --filter @sergeant/landing typecheck`.
- CI: джоба `Landing quality (axe + Lighthouse)` у `ci.yml:951-1009`;
  після деплою — `curl -o /dev/null -w "%{http_code}\n"` на невідомий шлях
  дає 404 (`README.md:83-86`).
- Рев'ю за цим документом: палітра з таблиці ролей (модуль = блок, Рутина
  як текст = `-strong`, помилка = `danger`), дві кнопки і один тип
  посилання, `min-h-11/12` на кожній інтерактивній цілі, копі з
  `src/content/` там, де воно повторюється, івент на кожен новий
  інтерактивний стан плюс рядок у політиці приватності.
