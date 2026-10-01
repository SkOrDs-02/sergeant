<!-- Lifecycle: Active | Owner: product | Added: 2026-09-17 | Next review: 2027-03-17 -->

# Дизайн-контракт: юридичні сторінки

> **Last touched:** 2026-10-01 by @claude (згода на аналітику — крок онбордингу, банер запасний). **Next review:** 2027-04-08.
> **Status:** Active — контракт as-built: описує `core/legal/{LegalPage,LegalDocumentView,LegalLinks}.tsx`, `legalShared.ts`, `legalDocumentTypes.ts`, чотири документи `{privacy,terms,cookies,offer}Document.ts`, маршрути `/legal/*` у `core/app/StandaloneRoutes.tsx` і копі `messages.legal` у `shared/i18n/uk.ts` станом на 2026-09-17. Код не правився: кожна розбіжність із каноном позначена **[борг]** із файлом і рядком; відкритих боргів дизайну — 8 (перелік у підсумку внизу). Юридичні знахідки аудиту 2026-07-31 (реквізити, explicit consent, opt-in) — не в цьому контракті, вони в [реєстрі верифікації](../../../work/specs/audits/verification/findings.json) під `LEGAL-20260731-*`, усі десять зі статусом `open`.

Поверхня, де продукт говорить не голосом коуча, а голосом сторони
договору: чотири публічні сторінки `/legal/privacy`, `/legal/terms`,
`/legal/cookies`, `/legal/offer` і компонент `LegalLinks`, який веде на них
з auth, pricing і Налаштувань. До 2026-09-17 поверхня контракту не мала —
[`README.md`](../README.md) прямо називає legal серед поверхонь, які
«тримає нейтральний stone-бренд без модульного акценту та компоненти хаба».
Документ фіксує, що саме тут канон, і де сторінка від нього відійшла.

## Проблема

Юридичні документи — найдовший текст у продукті: 16 + 16 + 8 + 15 = 55
секцій, кожна з кількох абзаців (`privacyDocument.ts` 21 KB,
`termsDocument.ts` 16 KB, `offerDocument.ts` 13 KB, `cookiesDocument.ts`
9 KB). Це єдина поверхня, де типографіка вирішує не «як виглядає», а «чи
дочитають». Водночас верстка `LegalDocumentView` успадкована від hero-екранів:
абзаци набрані роллю `label`, кожна секція несе свій `headline`, ширина
рядка не обмежена. Агент, який додає п'ятий документ або секцію, не мав
чого перевірити на рев'ю — і цей контракт дає йому мірило.

## Мета

Один документ, за яким (а) рев'ю перевіряє PR у `core/legal/**` на ролі
тексту, примітиви, стани й копі, (б) агент верстає новий документ чи
новий стан поверхні, не вигадуючи. Контракт as-built: кожне правило нижче
або вже так у коді, або позначене як **[борг]** із файлом і рядком.

## Продуктові рішення, на які спирається контракт

- **Чотири документи, не один.** Аудит [2026-07-31](../../../work/specs/audits/2026-07-31-legal-docs-beta-readiness.md)
  § 0 розділив колишній 546-рядковий `LegalPage.tsx` на роутер +
  чотири файли документів + `legalShared.ts` (ліміт Hard Rule #18). Тип
  документа — `LegalDocument { eyebrow, title, intro, sections[] }`
  (`legalDocumentTypes.ts:8-13`); секція — `{ title, body: string[] }`.
  Жодного markdown, жодного HTML у тексті: абзац = рядок масиву.
- **Публічні, анонімні, без бекенду.** Маршрути змонтовано поза auth-гейтом
  (`StandaloneRoutes.tsx:311-325`); `LegalPage` не читає `useAuth` і не
  робить жодного запиту. Контур `playwright.pwa-regression.config.ts`
  піднімає лише `vite preview` і перевіряє `/legal/privacy` без API —
  це і є доказ, що сторінки живуть без сервера (аудит § 7).
- **Юрдоки не залежать від стану синку.** `AnonymousDataMigrationProvider.tsx:81-87`
  тримає всі чотири шляхи в `GATE_EXEMPT_PATHS`: збій переносу анонімних
  даних не сміє ховати Політику приватності, яку продукт зобов'язаний
  показувати. Тест — `AnonymousDataMigrationProvider.test.tsx:326`.
- **«Ми» — голос сторони, не продукту** (рішення founder-а 2026-08-26,
  [`style-guide.uk.md § 2`](../../../product/copy/style-guide.uk.md)).
  `src/core/legal` стоїть в allowlist правила `sergeant-design/ukrainian-copy`
  (`eslint.web.js:156-163`): «Ми не продаємо твій контент» — це юрособа,
  а 1-а однини звучала б слабше. Решта правил ToV там теж не діє.
- **Draft до public launch, і сторінка про це каже.** Над кожним
  документом — плашка review-gate з `messages.legal.reviewGateNotice`
  (`uk.ts:586-587`): «це робочий draft…, не юридична консультація».
  Плейсхолдери контролера й реквізитів лишаються в коді свідомо
  (`legalShared.ts:20-21`, `offerDocument.ts:131-133`) — знахідки
  `LEGAL-20260731-5-2` і `5-3`, відкриті.
- **Оферта оприлюднена, але не чинна.** Секція «Статус оферти під час
  закритої бети» (`offerDocument.ts:17`) каже, що акцепт — оплата платного
  плану, а реєстрація акцептом не є (аудит § 5.5, знахідка `5-5`).
- **Згода на аналітику — opt-in, і питають її не на `/legal/*`.**
  PostHog мовчить до явного «Дозволити» (`opt_out_capturing_by_default`,
  рішення власника 2026-09-29). З 2026-10-01 нові люди відповідають
  **кроком онбордингу** одразу після вибору модулів на `/welcome`
  (`core/onboarding/OnboardingConsentStep.tsx`, рішення власника): обидві
  відповіді однакового вигляду, а «Про приватність» відкриває ту саму
  політику в аркуші (`core/legal/PrivacyPolicySheet.tsx`), не виводячи з
  онбордингу. Плаваючий банер (`core/observability/AnalyticsConsentBanner.tsx`
  через `AnalyticsConsentGate`) лишився запасним шляхом для тих, хто вже
  минув онбординг і ніколи не відповідав; на `/welcome` та `/onboarding/*`
  його не показують. Тумблер згоди живе в Налаштування → «Дані та
  приватність» (`core/settings/PrivacySection.tsx`). Юридичні тексти
  (`cookiesDocument.ts` § «Згода на аналітику: як це працює»,
  `privacyDocument.ts` § про підстави обробки) досі кажуть «банер при
  першому запуску»: суть (opt-in) точна, форма — ні; правка юридичного
  тексту за рішенням власника.
- **Декларації про дані — у Налаштуваннях, не на `/legal/*`.**
  `uk.dataDisclosure.ts` (субпроцесори AI, sunset-обіцянка «попередимо за
  30 днів») рендериться в `PrivacySection.tsx:310-325` за рішенням
  founder-а 2026-09-14 (PR-S4). Це той самий регістр «ми», але інша
  поверхня — контракт її не описує, лише фіксує, що `LegalLinks` стоїть
  там поруч (`PrivacySection.tsx:303`).

## Палітра і тон поверхні

Юридичні сторінки — **нейтральна stone-поверхня без модульного акценту**,
та сама оболонка, що в auth і pricing.

| Елемент             | Канон                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Оболонка            | `MeshBackground` (`.bg-mesh`, стіл хаба) із `h-app-dvh min-h-0 overflow-y-auto overscroll-contain px-5 py-8 sm:py-12` і `data-testid="legal-scroll-container"` (`LegalDocumentView.tsx:21-24`); зовні — `page-enter h-app-dvh min-h-0 overflow-hidden` (`StandaloneRoutes.tsx:320`). Скрол належить оболонці, не `body`.                                                                                                                |
| Колонка             | `main#main tabIndex={-1}` `mx-auto w-full max-w-4xl flex-col gap-8` (`LegalDocumentView.tsx:25-29`). **[борг]** абзаци не обмежені `max-w-prose`: на десктопі рядок тягнеться на всю `max-w-4xl` (896 px мінус паддінги), канон довгого тексту вимагає `max-w-prose` на елементі ([`02-typography § Довгий текст`](../design-system/02-typography.md)).                                                                                 |
| Шапка               | `text-center`: логотип-посилання на `/` → `BrandLogo size="lg"`, кікер `text-style-overline text-brand-strong` (`eyebrow`), `h1 text-style-display text-text`, вступ `max-w-2xl text-style-body text-muted` (`LegalDocumentView.tsx:30-46`). Один `display` на екран — канон дотримано.                                                                                                                                                 |
| Плашка review-gate  | `rounded-3xl border border-warning-soft bg-warning-soft/40 p-4 text-left text-style-label text-text` (`LegalDocumentView.tsx:47-50`). Семантичний `warning` тут доречний: це попередження про статус документа, не декор. `/40` — на зареєстрованій 5-крокової шкалі.                                                                                                                                                                   |
| Дата оновлення      | `text-style-caption text-subtle` під плашкою (`LegalDocumentView.tsx:51-53`).                                                                                                                                                                                                                                                                                                                                                           |
| Секція документа    | `section.rounded-3xl border border-line bg-panel p-5 sm:p-6` (`LegalDocumentView.tsx:60`), заголовок `h2`, тіло `mt-3 space-y-3`. Радіус `3xl` — тир Hero за [`radius-rhythm.md`](../radius-rhythm.md); для контентної картки канон каже `rounded-2xl`, але секцію тут не рахуємо боргом: вона не `Card`, і `3xl` збігається з плашкою вище.                                                                                            |
| Заголовок секції    | `h2 text-style-headline text-text` (`LegalDocumentView.tsx:62`). **[борг]** 8–16 `headline` на екран поверх `display`-h1 — канон «один `display` або `headline` на екран; два хедлайни змагаються» ([`02-typography § Do / Don't`](../design-system/02-typography.md)). Роль заголовка секції — `title`.                                                                                                                                |
| Абзац               | `p` у контейнері `text-style-label text-muted` (`LegalDocumentView.tsx:63`). **[борг]** роль `label` (13→14 px, вага 500, lh 1.4) — для «міток, кнопок, вторинного тексту»; канон для абзаців — `body` (15→16 px, lh 1.55, «для довгого читання має дихати»). Це головний борг поверхні: 55 секцій юридичного тексту набрано роллю підпису.                                                                                             |
| Футер               | `text-center space-y-4`: `LegalLinks` + два текстові посилання (`goToPricing`, `signInOrCreate`) через `·` `aria-hidden` (`LegalDocumentView.tsx:72-91`). Посилання — `text-style-label text-brand-strong underline-offset-4 hover:underline`.                                                                                                                                                                                          |
| `LegalLinks`        | `nav aria-label="Юридичні документи"` `flex-wrap gap-x-3 gap-y-2`; `compact` перемикає `text-style-label` → `text-style-caption`; кожне посилання `text-muted hover:text-text` з `min-h-11 min-w-11` (`LegalLinks.tsx:27-44`). Вбудовується: `AuthPage.tsx:211` (`compact mt-5`), `PricingPage.tsx:627` (`compact`), `PrivacySection.tsx:303` (`compact justify-start`), сам футер юрдоків (`LegalDocumentView.tsx:73`, повний розмір). |
| Motion              | Лише `page-enter` оболонки (`animations.css:37`, reduced-motion — `animations.css:1074`). Всередині сторінки анімацій немає, і так має лишатись.                                                                                                                                                                                                                                                                                        |
| Ілюстрації / іконки | Немає. Єдиний гліф — `BrandLogo`. Емодзі й буліти-символи в тексті: `formatProcessor` зшиває рядок із `•` (`legalShared.ts:135-137`) — це текст, не іконка.                                                                                                                                                                                                                                                                             |
| Теми                | Лише токени (`text-text` / `text-muted` / `text-subtle` / `bg-panel` / `border-line` / `warning-soft`), тож dark і hc успадковуються з `theme.css` без локальних оверрайдів. Окремого axe-прогону під темами для `/legal/*` немає (див. § Доступність).                                                                                                                                                                                 |

Правило для нового документа: **та сама оболонка, той самий тип
`LegalDocument`, жодного власного стилю в файлі документа** — файли
`*Document.ts` містять лише текст і константи з `legalShared.ts`.

## Примітиви й кнопки

Кнопок на поверхні **немає**: жодного `Button` у `core/legal/**`, тож
храповик `legacyButton` тут нічого не рахує. Усі дії — `Link`
react-router.

| Елемент                   | Канон                                                                                                                               | Стан у коді                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Назад» / на головну      | Логотип як посилання на `/` з `aria-label={messages.legal.homeLogoAria}`, `min-h-11 rounded-2xl focus-visible:ring-2 ring-focus/45` | так (`LegalDocumentView.tsx:31-37`). Окремої кнопки «Назад» з `chevron-left` (як на `/pricing`) немає — і не потрібна: сторінка публічна, попереднього екрана може не бути.                   |
| Навігація між документами | `LegalLinks` у футері, чотири посилання, активний документ не підсвічується                                                         | так (`LegalLinks.tsx:15-20`); `aria-current` на активному документі не ставиться — стан «ти вже тут» не позначений.                                                                           |
| Зміст / якорі секцій      | —                                                                                                                                   | **немає**: `section` не має `id`, `h2` не має якоря, sticky-змісту немає (`LegalDocumentView.tsx:56-70`). Посилання на конкретний розділ («див. § Твої права») сьогодні неможливе.            |
| Вихід у продукт           | Два текстові посилання: `PRICING_PATH` і `SIGN_IN_PATH`, `text-brand-strong`, `min-h-11`                                            | так (`LegalDocumentView.tsx:75-89`)                                                                                                                                                           |
| Скрол-контейнер           | `data-testid="legal-scroll-container"` на `MeshBackground`, `overflow-y-auto` на оболонці, а не на `body`                           | так; контракт закріплено `LegalDocumentView.test.tsx:25-27` і smoke `pwa-feedback-regressions.spec.ts:5-22` (`@critical`)                                                                     |
| Touch targets             | ≥ 44 px на **всіх** pointer-ах (не лише coarse): `min-h-11 min-w-11` на посиланнях `LegalLinks`, `min-h-11` на футерних і логотипі  | так — суворіше за `Button`, який добирає 44 px лише під `pointer: coarse`                                                                                                                     |
| Фокус                     | Логотип — канонічне кільце `ring-focus/45`; текстові посилання — `focus-visible:outline-none focus-visible:underline` без кільця    | так; підкреслення як єдиний фокус-індикатор посилання — прийнятно для inline-links, кільця для них канон не вимагає                                                                           |
| Друк                      | —                                                                                                                                   | **немає**: жодного `@media print` / `print:` у `apps/web/src`. Скрол-оболонка `h-app-dvh overflow-y-auto` на папері обріже документ першою сторінкою. Не борг проти канону, а відсутній стан. |

## Стани, які поверхня зобов'язана мати

| Стан                               | Поведінка                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Гість                              | Повний документ; футер веде на `/pricing` і `/sign-in`. Сторінка не читає сесію (`LegalPage.tsx` без `useAuth`).                                                                                                                                                                                                              |
| Увійшов                            | Ідентично гостю: «Увійти або створити акаунт» показується й авторизованому — умовного рендеру немає (`LegalDocumentView.tsx:84-89`). Не борг проти канону, але факт, який варто знати перед тим, як писати «увійшов → інший футер».                                                                                           |
| Незнайомий `/legal/<x>`            | Не доходить до `LegalPage`: `renderStandaloneRoute` віддає `NotFoundPage` для шляхів поза `STANDALONE_ROUTE_PATHS` (`StandaloneRoutes.tsx:494-503`). Фолбек на privacy у `LegalPage.tsx:42-43` — захисна гілка, недосяжна з роутера.                                                                                          |
| Короткі шляхи `/privacy`, `/terms` | **404.** Аліасів немає — у `appPaths.ts:140-143` лише `/legal/*`. Лендинг (`apps/landing`) має власні `/privacy` і `/data` — інший застосунок, інший домен маршрутів.                                                                                                                                                         |
| Збій переносу анонімних даних      | Сторінка рендериться, перенос триває у фоні (`GATE_EXEMPT_PATHS`, `AnonymousDataMigrationProvider.tsx:75-87`).                                                                                                                                                                                                                |
| Офлайн                             | Без API — працює (pwa-regression контур). Лінивий чанк `LegalPage` потрапляє в прекеш SW (`globPatterns: **/*.{js,…}`, `vite.config.js:279`), тож після першого візиту сторінка відкривається офлайн; окремого тесту саме офлайну (SW після первинного візиту) немає — аудит § 7 це зафіксував, стан не змінився.             |
| Reduced motion                     | `page-enter` вимикається глобально (`animations.css:1074`).                                                                                                                                                                                                                                                                   |
| Довгий документ на 393 px          | Скрол усередині оболонки; горизонтального overflow не має бути — `overflow-x-hidden` на `MeshBackground` за замовчуванням (`MeshBackground.tsx:77`). Mobile-audit `tests/mobile/*.spec.ts` цей маршрут **не** проганяє.                                                                                                       |
| Заголовок вкладки                  | `ROUTE_TITLES` для всіх чотирьох (`appPaths.ts:48-51`): «Sergeant · Політика приватності» тощо. Зверни увагу: для `/legal/terms` title каже «Умови використання», а `h1` документа — «Умови користування» (`termsDocument.ts:13`). Розбіжність двох слів у назві одного документа — копі, не дизайн; фіксую, не рахую боргом. |

## Копі

- **Текст документів живе в коді, не в i18n-каталозі** — свідомо:
  коментар `uk.ts:575-580` каже, що в каталог винесено лише
  chrome-літерали, а «сам контент документів лишається inline як
  plain-string-константи». Документ — це `*Document.ts` з
  `LegalDocument`; спільні константи (`LAST_UPDATED`, `EFFECTIVE_DATE`,
  чотири email-и, `CONTROLLER_PLACEHOLDER`, чотири групи `*_PROCESSORS`) —
  `legalShared.ts`.
- **Хром сторінки** — `uk.ts` → `messages.legal.*`: `linksNavAria`,
  `homeLogoAria`, `reviewGateNotice`, `lastUpdatedPrefix`, `goToPricing`,
  `signInOrCreate` (`uk.ts:581-591`). Живе в лінивому `uk.ts`, не в
  `uk.core.ts` — правильно: `LegalPage` лінивий (`StandaloneRoutes.tsx:67`),
  до першого екрана цей текст не їде.
- **[борг]** Англійський літерал у JSX: `<strong>Founder/lawyer review
gate:</strong>` (`LegalDocumentView.tsx:48`) зашитий у компонент поза
  каталогом і англійською на UA-only поверхні (так її називає сам
  `uk.ts:576`). Лінт `no-cyrillic-jsx-literal` його не бачить, бо він не
  кириличний. Той самий рядок `reviewGateNotice` мішає латинські терміни
  «draft», «refunds», «processors» (`uk.ts:586-587`), а `goToPricing` —
  «Перейти до pricing» (`uk.ts:589`), хоча поверхня `/pricing` у власному
  контракті зветься «тарифи». Один борг, три місця.
- **[борг]** Підписи `LegalLinks` («Приватність», «Умови», «Cookies»,
  «Оферта») лежать у локальному масиві `links` (`LegalLinks.tsx:15-20`), а
  не в `messages.legal` — той самий випадок, що `PresetSheet` в
  [контракті онбордингу](./2026-09-16-onboarding-design.md): літерали в
  об'єкті, не в JSX, тож лінт їх не бачить узагалі. `LegalPage.test.tsx:36-51`
  звіряє їх як рядки, тобто винос у каталог тест не зламає.
- **Кікери — англійською** («Privacy Policy», «Terms», «Cookie Policy»,
  «Public Offer»; `privacyDocument.ts:17`, `termsDocument.ts:12`,
  `cookiesDocument.ts:7`, `offerDocument.ts:12`). Це рішення про
  впізнаваність міжнародних назв, не дрейф; a11y-наслідок — у наступному
  розділі.
- **Версія й дата.** Номера версії немає. Дата одна на всі чотири
  документи: `LAST_UPDATED = EFFECTIVE_DATE = "31 липня 2026"`
  (`legalShared.ts:13-14`) — людський рядок, не ISO; у розмітці — просто
  `<p>`, без `<time dateTime>`. Змінюєш будь-який документ — піднімай
  обидві константи тим самим PR-ом; окремої дати на документ конструкція
  не передбачає.
- **Тон** — регістр сторони: «ми» для обіцянок, «ти» до користувача
  («як ти можеш керувати своїми правами», `privacyDocument.ts:19`).
  Коротке тире `–`, апостроф `ʼ` — правила 9–10 style-guide дотримані в
  тексті документів. Заголовки секцій без крапки.
- **Плейсхолдери** `[ПІБ]`, `[xxxxxxxxxx]`, `[буде внесено перед public
launch]` — не копі-борг, а відкриті юридичні знахідки `LEGAL-20260731-5-2`
  і `2-3`. Не «прибирати квадратні дужки» до рішення founder-а.

## Аналітика

Івентів для `/legal/*` **немає**: у `packages/shared/src/lib/analyticsEvents.ts`
жодного `legal_*`, у `core/legal/**` жодного `trackEvent`. Це узгоджено з
`cookiesDocument.ts:46`: автозбір кліків і переглядів вимкнений,
надсилаються лише явно визначені події. Нового стану з івентом ця
поверхня не вимагає; додавати перегляд юрдоків у PostHog — окреме
рішення про згоду, не дизайн-правка.

## Доступність

- **Заголовкова ієрархія:** `h1` (title) → `h2` × N (секції), без
  пропусків; `heading-order` пройшов би. `main#main tabIndex={-1}` — ціль
  для `SkipLink` оболонки.
- **Мова:** `html lang="uk"` (`index.html:2`). **[борг]** кікери
  англійською (`text-style-overline`, `LegalDocumentView.tsx:39-41`) без
  `lang="en"` на елементі — WCAG 3.1.2 «Мова частин»: скрінрідер читає
  «Privacy Policy» українською фонетикою. Виправлення — атрибут на `<p>`
  кікера або поле `eyebrowLang` у типі; вибір за власником.
- **Навігація:** `nav aria-label` на `LegalLinks` (`LegalLinks.tsx:28`);
  `aria-hidden` на декоративному `·` (`LegalDocumentView.tsx:81-83`);
  логотип із `aria-label`.
- **Контраст:** абзаци `text-muted` на `bg-panel` — токен підібраний на
  порозі AA (`eslint.web.js:175-181`), без `/N` на текстовому токені —
  правило `no-opacity-on-text-token` дотримане.
- **[борг]** `/legal/*` **не входить** у axe-матрицю: `SURFACES` у
  `tests/a11y/axe.spec.ts:184-207` має `/sign-in`, `/pricing`, `/welcome`,
  але жодного юридичного маршруту, і в `THEMED_SURFACES` (dark/hc,
  `:287-306`) теж. Найдовший текст продукту — єдина публічна поверхня
  без механічного a11y-гейту.
- **[борг]** Ledger-спека `WEB-LEGAL-001` іде на `/privacy`
  (`tests/ledger/user-story-ledger.spec.ts:46`), якого в
  `STANDALONE_ROUTE_PATHS` немає, — тобто перевіряє 404-сторінку й
  проходить, бо асертить лише відсутність fatal-помилок (`:223-229`).
  Юридичну сторінку вона не відкриває жодного разу; канонічний шлях —
  `/legal/privacy`.

## Чого не робити

- Не тягнути модульний акцент: юрдоки — про сторону договору, не про
  модуль, навіть коли посилання прийшло з `PhotoPrivacyNotice` Харчування.
- Не додавати `Button` заради «на головну» чи «до тарифів»: тут посилання,
  і вони вже є. Якщо кнопка таки з'явиться — `(variant, tone)`, легасі
  `primary` / `secondary` не існують.
- Не писати стилі у файлах `*Document.ts` і не додавати markdown у
  `body[]` — тип `LegalDocument` навмисно плоский.
- Не «лікувати» плейсхолдери контролера й реквізитів редакторською
  правкою — це рішення founder-а/юриста (`LEGAL-20260731-5-2`).
- Не змінювати перелік `*_PROCESSORS` без дзеркальної правки
  `docs/governance/security/llm-subprocessors.md` — AI-CONTEXT у
  `legalShared.ts:6-10`.
- Не переносити текст документів у `uk.core.ts` — він їде до першого
  екрана (той самий урок, що в контракті онбордингу).
- Не додавати банер згоди на cookies «для галочки» в цей компонент —
  згода належить `PrivacySection` і рішенню про opt-in
  (`LEGAL-20260731-4-1`).

## Поза скоупом

- **Юридичний зміст** — реквізити, explicit consent на health-дані,
  представник Art. 27, стеля відповідальності: десять знахідок
  `LEGAL-20260731-*` у [`findings.json`](../../../work/specs/audits/verification/findings.json),
  усі `open`; аудит-джерело — [`2026-07-31-legal-docs-beta-readiness.md`](../../../work/specs/audits/2026-07-31-legal-docs-beta-readiness.md).
- **Налаштування → «Дані та приватність»** (тумблери згод, декларації
  `uk.dataDisclosure.ts`, вказівники на пам'ять і видалення акаунта) —
  поверхня settings; тут лише факт, що `LegalLinks` стоїть у її футері.
- **`uk.privacy.ts`** — попри назву, це копі PIN-блокування й пам'яті AI
  для Налаштувань (`uk.privacy.ts:4`), не юрдоки.
- **Landing** (`apps/landing`): власні `/privacy` і `/data`
  (`apps/landing/src/pages/PrivacyPage.tsx`, `DataPage.tsx`, футер
  `SiteFooter.tsx:62-68`) з власною типографікою (`font-display uppercase`)
  — окрема Tailwind-4 поверхня, її контракт не тут.
- **Мобільний застосунок** — контур на паузі
  ([ADR-0094](../../../governance/adr/0094-mobile-web-first-freeze.md)).
- **Storybook**: історій для `core/legal/**` немає; story-coverage —
  review-only ([`storybook.md`](../storybook.md)).

## Верифікація

- `pnpm --filter @sergeant/db-schema build && pnpm --filter @sergeant/web exec vitest run src/core/legal src/core/app/StandaloneRoutes src/core/durability/AnonymousDataMigrationProvider`
  — `LegalPage.test.tsx` (h1 + чотири посилання на кожному з чотирьох
  маршрутів), `LegalDocumentView.test.tsx` (скрол-контейнер),
  `StandaloneRoutes.test.tsx:137-140` (усі чотири шляхи в реєстрі),
  `AnonymousDataMigrationProvider.test.tsx:326` (гейт не блокує
  `/legal/privacy`).
- `pnpm --filter @sergeant/web exec playwright test -c playwright.pwa-regression.config.ts`
  — `pwa-feedback-regressions.spec.ts` `@critical legal documents scroll
inside the fixed PWA shell` на `vite preview` без бекенду. Той самий
  спек іде в CI-джобі `critical-flow` через `pnpm --filter @sergeant/web e2e`.
- `pnpm lint` — `sergeant-design/ukrainian-copy` з allowlist для
  `src/core/legal` (`eslint.web.js:163`); `pnpm lint:ui-canon` тут нічого
  не рахує (кнопок немає), `cyrillicJsxAllowlist` стоїть на 299 і
  `LegalLinks` у ньому немає — бо його літерали лінт не бачить (див.
  § Копі).
- Рев'ю за цим документом: ролі тексту (`body` для абзаців, `title` для
  секцій — після закриття боргів), `max-w-prose`, стани з таблиці, копі з
  каталогу для хрому, `LAST_UPDATED` піднято разом із текстом,
  `*_PROCESSORS` ↔ `llm-subprocessors.md`.

## Підсумок боргів (2026-09-17)

| #   | [борг]                                                    | Де                                          |
| --- | --------------------------------------------------------- | ------------------------------------------- |
| 1   | Абзаци роллю `label` замість `body`                       | `LegalDocumentView.tsx:63`                  |
| 2   | `headline` на кожній із 8–16 секцій поверх `display`-h1   | `LegalDocumentView.tsx:62`                  |
| 3   | Немає `max-w-prose` на довгому тексті                     | `LegalDocumentView.tsx:28, 63`              |
| 4   | Англійський JSX-літерал + латинські терміни в хромі       | `LegalDocumentView.tsx:48`, `uk.ts:586-589` |
| 5   | Підписи `LegalLinks` поза каталогом                       | `LegalLinks.tsx:15-20`                      |
| 6   | Кікери англійською без `lang="en"`                        | `LegalDocumentView.tsx:39-41`               |
| 7   | `/legal/*` відсутні в axe-матриці (light і dark/hc)       | `tests/a11y/axe.spec.ts:184-207, 287-306`   |
| 8   | Ledger `WEB-LEGAL-001` іде на неіснуючий `/privacy` (404) | `tests/ledger/user-story-ledger.spec.ts:46` |
