# Глибокий аудит дизайн-системи — 2026-08-04

> **Last touched:** 2026-08-04 by @claude. **Next review:** 2026-11-02.
> **Status:** Active — знахідки актуальні на дату аудиту; частину виправлено в PR цієї гілки (див. § Виправлення).

> **Що це.** Повний аудит дизайн-системи Sergeant і її дотримання в продукті:
> покриття токенів/компонентів, коректність у чотирьох темах (light / dark /
> system / hc), стан механічного enforcement після ADR-0081, parity web ↔
> mobile. Виконано 10-агентним воркфло у 2 фази: 7 паралельних аудиторів по
> зрізах → адверсарна верифікація кожної high/medium знахідки (верифікатори
> відкривали цитовані файли і намагалися спростувати claim).
>
> **Підсумок верифікації:** 64 унікальні знахідки; 46 high/medium → **37
> підтверджено, 9 скориговано (суть вірна, деталі уточнені), 0 спростовано**;
> 18 low залишено без верифікації (позначені).

---

## 1. Загальний вердикт

Архітектура дизайн-системи **здорова**: raw-токени → Tailwind-пресет →
4-скоупні CSS-змінні (`:root` / `.dark` / `html.hc` / `html.hc.dark`) →
web-only overrides; UI-кіт ~60 компонентів із сильною гігієною stories/tests;
opacity-дисципліна в продукті — взірцева (0 порушень на ~1130 суфіксів).

Але аудит виявив **чотири системні проблеми**, кожна з яких породжує цілі
сім'ї конкретних багів:

1. **Міграції палітри 2026-05→07 (emerald→teal, teal→cyan, brand→stone,
   «Чорнило») не заметені до кінця.** Хвіст: `--c-accent` без `.dark`-фліпа,
   застарілі hero-градієнти, сирі stock-Tailwind hex-и в theme.css, мертві
   emerald-утиліти, повністю розсинхронізований mobile.
2. **Enforcement-вакуум після ADR-0081.** Обіцяний заміщувальний шар
   (Storybook + visual regression) не існує — ADR-0082 видалив VRT; при цьому
   ціле кільце Active-доків досі подає retired-правила як «enforced (error)».
3. **Теми light/dark/hc не наскрізні.** Чарти малюють статичні hex-и і не
   реагують на теми взагалі; hc-скоупи порушують власний контракт файлу
   («кожен новий семантичний токен МУСИТЬ мати hc-override»); axe-сьют ганяє
   лише світлу тему.
4. **«Інверсія покриття» в компонентній бібліотеці.** Відполіровані shared-
   примітиви (ProgressBar, Switch-патерни, ConfirmDialog) мають нуль або мало
   споживачів, тоді як продуктовий код ручно клонує ті самі примітиви — в
   одному випадку з реальною a11y-регресією на деструктивних AI-діях.

---

## 2. Знахідки: токен-шар (light/dark/hc parity)

| #   | Sev  | Знахідка                                                                                                                                                                                                                                                                                                                              | Докази                                           |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| T1  | high | `--c-accent` не має `.dark`-override → `text-accent`/`bg-accent` (107 вживань у 50 файлах) рендерять teal-700 (~3.4:1) на темному ink; сусідній `--c-ring` явно флипнутий на teal-400 саме з цієї причини                                                                                                                             | `theme.css:174` vs `:542`                        |
| T2  | high | Світлі `--hero-grad-fizruk`/`--hero-grad-nutrition` закінчуються tier-400 під `text-hero-ink` (≈1.7–2.2:1) — та сама вада, яку для routine виміряли, виправили і закрили регрес-тестом; фікс покрив лише routine                                                                                                                      | `theme.css:985-1003`                             |
| T3  | high | `celebrationColors` у tokens.js декларує пару light=amber-700 / dark=amber-400 і стверджує, що theme.css її дзеркалить; фактично `--c-celebration` визначений один раз як amber-400 (1.66:1 на білому — значення, яке tokens.js сам документує як недопустиме для light); InsightCard посилається на неіснуючий `bg-celebration-soft` | `tokens.js:240-248`, `theme.css:321`             |
| T4  | med  | `--focus-ring-color` темізований у :root/hc/hc.dark, але не в `.dark`; utilities.css досі тримає emerald-fallback; `focus-ring-enhanced` читає ніде не визначений `--shadow-focus-ring`                                                                                                                                               | `theme.css:407,749,815`, `utilities.css:38`      |
| T5  | med  | Сирі hex-сироти міграцій: `--shadow-nutrition-nav` світить stock-lime #84cc16 замість брендового #92cc17; `--gradient-card-fizruk-dark` досі teal (fizruk переїхав на cyan); `--shadow-fab` — teal у light/hc, але emerald у .dark/hc.dark (hue стрибає з темою)                                                                      | `theme.css:139,157-161`                          |
| T6  | med  | hc-скоупи піднімають `-soft`/`-soft-border`, але ніколи `-soft-hover` (hover на hc СВІТЛІШАЄ; в hc.dark для routine hover — no-op) і не мають overrides для `--c-muted-v2`/`--c-subtle-v2` (≈2.9:1 проти власного контракту hc ≥7:1)                                                                                                  | `theme.css:741-809` vs `:271-295`                |
| T7  | med  | hc-шар ніколи не переозначує статусні трійки `--c-success/-warning/-danger/-info` і `--c-accent` (лишаються -500 → ≈2.2:1 на hc-ivory), порушуючи власний контракт файлу                                                                                                                                                              | `theme.css:196-199`                              |
| T8  | low  | Мертвий шар: `--c-success…--c-info` ніде не читаються; пресет-утиліти `page-warm`, `hero-emerald`, `card-emerald`, `celebration-glow`, `glow-*-emerald` тощо — без споживачів (хвіст emerald-міграції)                                                                                                                                | grep по apps/**, packages/**                     |
| T9  | low  | Застарілі SSOT-коментарі: tokens.js про `-strong` («-700 для більшості» — фактично 3 з 4 модулів на -800), mobile.js «accent = emerald», пресет вказує на index.css замість theme.css, tokens.test.js описує неіснуючу шкалу amber                                                                                                    | `tokens.js:180-189` та ін.                       |
| T10 | low  | Контраст-тести покривають light+ink і `-soft`-пари в 4 скоупах — але жодної hc/hc.dark-комбінації поза `-soft`; AAA-заяви hc-коментарів ніколи не перевіряються машинно                                                                                                                                                               | `contrast.test.js`, `theme.softContrast.test.ts` |

## 3. Знахідки: теми в продукті

| #   | Sev  | Знахідка                                                                                                                                                                                                                                                                                                                                                                      | Докази                                            |
| --- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| TH1 | high | Весь fizruk-чарт-стек малює SVG статичними JS-hex (`chartSeries.*` з moduleColors, `statusColors.*`) — чарти не реагують на теми: dark отримує light-tier cyan-700 (~3.3:1 на ink замість задизайненого cyan-400 ~9.7:1), light — emerald-500 лінії 1RM ~2.2:1 (нижче 3:1 graphics-мінімуму); hc не міняє нічого. Теमо-реактивний патерн уже існує (`ProgressRing.tsx:80-83`) | `chartTheme.ts:39-60`, `WeeklyVolumeChart.tsx`    |
| TH2 | high | Tailwind-утиліти `chart-{module}` — заморожені статичні hex світлого tier, тоді як однойменні `--c-chart-{module}` CSS-vars фліпаються по темах; коментар theme.css стверджує дзеркальність, але sync — comment-only (жоден тест не читає `--c-chart`). Наслідок: heat-клітинка RoutineCard у dark ≈1.3:1 — фактично невидима                                                 | `tailwind-preset.js:266-269`, `theme.css:351-355` |
| TH3 | high | Browser/OS chrome ігнорує in-app тему: index.html шле pre-«Чорнило» значення (#fdf9f3/#171412 замість актуальних #f2ecdf/#0d1512), ключовані лише на `prefers-color-scheme`; юзер із dark-вибором в апці на light-OS отримує кремовий статус-бар над ink-інтерфейсом; manifest — статичний stale-cream; runtime-код мету не оновлює                                           | `index.html:33-42`, `theme.css:79,475`            |
| TH4 | high | Градієнти слайдів weekly-digest досі на `brand-*`, але brand у 2026-07 перемапили на нейтральний stone → intro/finyk слайди рендеряться сіро-teal/сіро-indigo (втрачена модульна ідентичність), `text-white` ≈2.5:1 на stone-400 середині; градієнти тягнуть чужі hue (indigo, rose) зі стокового Tailwind                                                                    | `core/stories/constants.ts:16-28`                 |
| TH5 | high | Саморобний перемикач PushNotificationToggle нечитабельний у dark: трек `bg-primary` фліпається в майже-білий, білий knob → ~1.09:1 — позиція вимкнено/увімкнено невидима; shared Switch вже розв'язав цю проблему і тут не використаний                                                                                                                                       | `PushNotificationToggle.tsx:70,80`                |
| TH6 | med  | FirstRunHintBanner: `dark:text-bg` поверх статичної `-strong`-заливки валить гліф з ~7:1 до ~2.7:1 у dark (інверсія належить голим акцентам, не `-strong`-tier); всі 3 варіанти                                                                                                                                                                                               | `FirstRunHintBanner.tsx:43,48,53`                 |
| TH7 | med  | BodyAtlas: heat-ramp м'язів інтерполює статичні THEME_HEX (emerald→amber→red-500) і глянець із literal #ffffff/#000000 — поверхня ігнорує теми, на відміну від власного ж cold-muscle fill через CSS-var                                                                                                                                                                      | `BodyAtlas.tsx:98-100,51-54`                      |
| TH8 | low  | components.css: `.fab` на `bg-brand-500` (тепер stone-сірий, споживачів нема — латентна пастка), `.hover-glow` — hardcoded emerald rgba                                                                                                                                                                                                                                       | `components.css:173-178,97-99`                    |
| TH9 | low  | Tailwind-v4 preflight-шим ставить універсальний default border-color = статичний `--color-gray-200`, який не фліпається в dark                                                                                                                                                                                                                                                | `base.css:8-16`                                   |

## 4. Знахідки: компонентна бібліотека

| #   | Sev  | Знахідка                                                                                                                                                                                                                                              | Докази                                               |
| --- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| K1  | high | Три паралельні confirm-діалоги; той, що гейтить деструктивні AI-дії (DestructiveConfirmModal) — без focus trap, без Escape, без scroll lock, на відміну від канонічного shared ConfirmDialog (useDialogFocusTrap + useBodyScrollLock, 20+ споживачів) | `ConfirmDialog.tsx:16-61` vs DestructiveConfirmModal |
| K2  | high | «Інверсія бібліотеки»: shared ProgressBar (зі stories+tests) — нуль продакшн-споживачів, при цьому ≥4 ad-hoc `role="progressbar"` живуть у core/modules                                                                                               | `ui/index.ts:146` + grep                             |
| K3  | med  | Шість shared-компонентів без жодного споживача: AccentColorPicker, MacroBarRow, Prose, OptimizedImage, PageTransition, ProgressBar (MacroBarRow і OptimizedImage навіть не експортовані з index.ts)                                                   | grep по apps/**, packages/**                         |
| K4  | med  | DesignShowcase демонструє лише ~25 із ~60 компонентів: нема Toast, Tabs, Segmented, DataState, DataTable, Banner, Slider, ThemeSwitcher, CommandPalette та ін.                                                                                        | import-sweep 72 файлів showcase                      |
| K5  | med  | Showcase-«proposals» демо — самодостатні форки компонентів, які вже шипнуті в shared/ui (WheelPicker, DateScrubber, KeyboardAccessory): showcase демонструє форк, що тихо розходиться з реальним артефактом                                           | `proposals/*Demo.tsx`                                |
| K6  | med  | ~14 файлів у core/modules ручно збирають `role="dialog"` chrome (backdrop, panel, portal, scroll lock) замість shared Modal/Sheet; патерн — «hooks реюзають, chrome дублюють»; нема shared Drawer/full-screen-overlay shell                           | rg role="dialog"                                     |
| K7  | med  | SubTabs — повністю generic tablist-примітив, застряглий у modules/nutrition, перекривається з shared Segmented/Tabs (дрейф визнаний у docstring Segmented); активний таб 40px — під 44px-floor без pointer-coarse обробки                             | `SubTabs.tsx:7-55`                                   |
| K8  | med  | Прогалини stories/tests: DateScrubber і MorphChevron — нуль тестів; 11 компонентів без .stories.tsx (SwipeToAction, VirtualList, MaskedAmount, KeyboardAccessory — пріоритетні)                                                                       | листинг ui/                                          |
| K9  | low  | FirstEntryCelebrationModal ручно клонує конфеті-систему shared CelebrationModal (який уже вміє per-module theming)                                                                                                                                    | `FirstEntryCelebrationModal.tsx:170-210`             |
| K10 | low  | Критично відсутніх примітивів НЕМА (Tooltip/Toast/Skeleton/Spinner існують і адоптовані); залишок — мікро-спінери-диви і ~24 native `title=` (інертні на touch)                                                                                       | grep                                                 |

## 5. Знахідки: enforcement і документація

| #   | Sev  | Знахідка                                                                                                                                                                                                                                                                                                                                                                             | Докази                           |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| E1  | high | **Enforcement-вакуум**: ADR-0081 обіцяв, що візуальні регресії ловитимуться «Storybook, browser/a11y checks і людське review», але ADR-0082 видалив visual-regression workflow, а Storybook CI перевіряє лише що білд компілюється → opacity-шкала, `-strong`, hex-бан, module-accent containment, focus-visible, story-coverage і 12px-floor мають **нуль** механічного enforcement | ADR-0081:32, ADR-0082            |
| E2  | high | storybook.md (Active) стверджує, що `require-stories-for-ui-components` бігає на severity error у кожному PR — правило видалене з плагіна                                                                                                                                                                                                                                            | `storybook.md:9,111,116`         |
| E3  | high | apps/web/AGENTS.md подає retired #8/#9/#11/#12/#14 як чинні Hard Rules — файл авто-інжектиться в кожну агентну сесію по apps/web                                                                                                                                                                                                                                                     | `apps/web/AGENTS.md:34-35`       |
| E4  | med  | onboarding.md (крок 5 обов'язкового startup-flow) веде агентів дебажити CI-фейли чотирьох правил, яких не існує                                                                                                                                                                                                                                                                      | `onboarding.md:38-41`            |
| E5  | med  | Скіли/плейбуки цитують retired-номери і розходяться між собою: sergeant-web-ui «#11–13», design-reviewer «#8, #9, #11-14, #16, #17», плейбук «#8, #9, #11-17»                                                                                                                                                                                                                        | SKILL.md:26 та ін.               |
| E6  | med  | Типографічний floor суперечить сам собі: скіл каже «мінімум 12px, text-2xs deprecated», пресет шипить text-2xs (10px) з коментарем «Floor», 23 вживання в 16 non-showcase файлах, правило `no-arbitrary-text-size` видалене                                                                                                                                                          | `tailwind-preset.js:741,749`     |
| E7  | med  | Єдина автоматична перевірка 44×44 (Playwright mobile-ui-audit) не запускається жодним CI-workflow — enforcement лишається CSS-safety-net + локальний тест                                                                                                                                                                                                                            | `mobile-ui-audit.spec.ts:89,156` |
| E8  | med  | README design-tokens: цитує retired #8/#9, приписує tokens.js «шрифти, spacing» (живуть у пресеті), мертве посилання, хибна заява «unregistered opacity silently dropped» (на Tailwind v4 arbitrary alpha компілюється)                                                                                                                                                              | `README.md:9,31,35-36`           |
| E9  | low  | Плагін: 20/20 правил збігаються з README, 18 реально підключені; `no-legacy-telegram-parse-mode` — dead weight (ніде не enabled, guarded-код не існує)                                                                                                                                                                                                                               | `index.js:2636-2656`             |
| E10 | low  | docs/05-design досі декларують error-level ESLint enforcement module-accent і hex-бану (видалені правила)                                                                                                                                                                                                                                                                            | `module-accent.md:117,126,147`   |

**Позитив зрізу:** hard-rules registry (JSON + per-rule файли + матриця) чисто
вичищений від retired-номерів; вцілілі інваріантні правила реально підключені
й бігають у CI; opacity-дисципліна в коді ідеальна (0 порушень).

## 6. Знахідки: типографіка і продуктові конвенції

| #   | Sev  | Знахідка                                                                                                                                                                                                                 | Докази                                       |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| P1  | high | InjurySection (4×) і StrategyPage (4×) стилізують текст неіснуючим у Sergeant shadcn-токеном `text-muted-foreground` — Tailwind не емить CSS, де-емфаза тихо не рендериться                                              | `InjurySection.tsx:57,69,117,139`            |
| P2  | med  | 11 deprecated `text-2xs` у shipped-коді модулів (fizruk 7, nutrition 2, routine 2) + 4 у digest-слайдах; жодне — не «chart-tick» виняток брендбуку; badge-className дубльований verbatim у 2 файлах                      | `WorkoutTemplatesSection.tsx:342,354` та ін. |
| P3  | med  | HabitHeatmap: sub-12px через inline `style={{fontSize:10}}` (невидимо для className-сканів) + 8 inline-style об'єктів статичної розмітки                                                                                 | `HabitHeatmap.tsx:251-374`                   |
| P4  | med  | PrivacyLockBanner (hub-банер app-wide локу; копі покриває finyk І fizruk дані) пофарбований finyk-акцентом — порушення правила «hub — нейтральний батько»                                                                | `PrivacyLockBanner.tsx:24-25`                |
| P5  | med  | ~27% типографіки — сира шкала замість семантичної: 389 `text-xs` + 108 `text-sm` проти 1316 `.text-style-*`; концентрація в nutrition (Recipes/DailyPlan — 41 сайт)                                                      | rg-каунти                                    |
| P6  | med  | DesignShowcase — еталонна поверхня — несе 132 із 155 `text-2xs` і єдині sub-12px arbitrary (text-[9px]×2, text-[10px]×1): поверхня, що вчить конвенцій, демонструє заборонене                                            | per-dir tally                                |
| P7  | low  | 44px-floor захардкоджений 176 разів (`min-h-[44px]`×133 + `min-w-[44px]`×43) попри зареєстрований `min-h-touch-target` і `touch-target`-утиліти (44 вживання) — одноточковий ретюн неможливий                            | rg-каунти                                    |
| P8  | low  | Кілька off-rhythm радіусів/спейсингу (`rounded-[22px]`, `rounded-[15px]`, `py-[3px]`) повз шкалу CONTROL(12)/CARD(16)/HERO(24)                                                                                           | цитовані файли                               |
| P9  | low  | Module-accent containment — **чистий** (нуль крос-модульних протікань); 3 сайти беруть сирі palette-класи власної сім'ї замість семантичних токенів (один міняє інтент: hover:bg-cyan-900 замість fizruk-hover=cyan-600) | `BodyEntryForm.tsx:408`                      |
| P10 | low  | QuickAddChips: bracket-arbitrary alpha для значень із зареєстрованими степами                                                                                                                                            | grep                                         |

## 7. Знахідки: a11y і touch targets

| #   | Sev  | Знахідка                                                                                                                                                                                                                                                | Докази                                             |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A1  | high | Блокувальний axe-сьют ганяє всі 18+5 поверхонь **лише в світлій темі** — dark і спеціально-a11y-шний hc шипляться повністю неаудитовані на runtime-контраст                                                                                             | `axe.spec.ts:87-110`, `playwright.config.ts:26-30` |
| A2  | med  | KeyboardShortcutsModal і CelebrationModal — на legacy `useFocusTrap` замість канонічного `useDialogFocusTrap`: без inert/aria-hidden фону (SR virtual-cursor leak — та сама вада, яку канонічний хук документує як WCAG 4.1.2/1.3.1 фейл із QA Batch 5) | `KeyboardShortcutsModalUI.tsx:91`                  |
| A3  | med  | Три оверлеї без iOS-safe body scroll lock: KeyboardShortcutsModal і CelebrationModal — взагалі без лока, CommandPaletteUI — на голому overflow:hidden (патерн, який власна документація ConfirmDialog називає зламаним на iOS)                          | цитовані файли                                     |
| A4  | low  | CelebrationModal + FirstEntryCelebrationModal кличуть `navigator.vibrate` напряму повз reduced-motion guard shared-haptic шару                                                                                                                          | `CelebrationModal.tsx:168-169`                     |
| A5  | low  | TransactionFilters: data-compact відновлює лише висоту (`pointer-coarse:min-h-[44px]`) — короткий чип «Всі» може бути вужчим за 44px                                                                                                                    | `TransactionFilters.tsx:95-118`                    |
| A6  | low  | WaterHistorySheet: data-compact на неінтерактивному div — мертвий атрибут (safety-net таргетить лише button/role=button/tab/menuitem/option)                                                                                                            | `WaterHistorySheet.tsx:100`                        |
| A7  | low  | Блокуються лише serious/critical axe-порушення; moderate-хвіст (landmarks/headings) тихо деградує в анотації і може рости непомітно                                                                                                                     | `axe.spec.ts:136-138`                              |

**Позитив зрізу:** 44px-контракт у Button/IconButton + global safety-net —
міцний; покриття axe по маршрутах широке (23 поверхні).

## 8. Знахідки: mobile parity

| #   | Sev  | Знахідка                                                                                                                                                                                                                                                                 | Докази                                           |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| M1  | high | Shared-пресет посилається на `--c-*-soft`/`--c-brand-soft*`/`-soft-fg` vars, яких apps/mobile/global.css **ніколи не визначає** — 19 mobile-сайтів (Card, Badge, Tabs, SearchResultItem, InlineAiRail) referencing токени без джерела значень: тіни тихо не резолвляться | `tailwind-preset.js:243,301` + grep              |
| M2  | high | Mobile заморожений на pre-2026-07 emerald: `--c-accent` досі emerald-500, finyk-surface-dark emerald (web: teal-700), nutrition-surface-dark lime-500 (web: lime-400 задля AA), module-блок на stock-lime; mobile.js accent із застарілим AI-NOTE «web = emerald»        | `global.css` vs `theme.css:174,643,649`          |
| M3  | high | mobile.js експортує dark-only cool blue-gray палітру (bg #0b0d10), яка не збігається ні з web-light, ні з web-dark; 23 файли споживають її статично, хоча апка тепер light+dark → на світлій темі near-white текст/іконки майже невидимі                                 | `mobile.js:55-65`, `ColorSchemeBridge.tsx:32-38` |
| M4  | med  | Nutrition шипить **дві конфліктні макро-палітри**: Dashboard MACRO_DEFS — старі off-brand hex (blue/yellow/green-500), DailyPlanMacros — коректний chartHex (cyan/coral/lime-700); один модуль — два різні кольорові коди тих самих величин                              | `tokens.js:373-383` vs MACRO_DEFS                |
| M5  | med  | Web — 4-режимна тема (light/dark/system/hc), mobile — 3-режимна: жодного hc-еквівалента ніде в apps/mobile → a11y-режим, на який юзер покладається на web, тихо зникає на mobile                                                                                         | `useTheme.ts:36` vs `ColorSchemeBridge.tsx:32`   |
| M6  | med  | Типографіка mobile: у global.css визначена та сама legacy-шкала, яку web видалив у D8-sweep (нуль споживачів), `.text-style-*` — нуль споживачів, натомість 469× text-xs + 140 sub-12px arbitrary + 18× text-2xs — жодної floor-дисципліни                               | `global.css` + rg                                |
| M7  | med  | mobile-shell: статус-бар/сплеш темізуються **один раз** в initNativeShell() (guard `initialized`) — перемикання теми в рантаймі лишає stale статус-бар до рестарту; Android-сплеш без values-night → dark-юзери завжди ловлять кремовий флеш                             | `mobile-shell/src/index.ts:251,346-359`          |
| M8  | low  | Touch targets mobile: примітиви сильні (Button 44px+ всі розміри, hitSlop 8; ListItem 48px+), але глобального safety-net нема; Tabs sm = 36px; ad-hoc Pressables без min-h/hitSlop                                                                                       | `Button.tsx:112-135`, Tabs                       |

---

## 9. Виправлення в цьому PR

_Заповнюється після завершення фікс-воркфло і QA — див. фінальний diff PR._

Автофіксабельний пул (виконує фікс-воркфло: 6 фіксерів з непересічними
зонами + QA): T1–T7 і hex-сироти (токен-шар + hc-overrides + контраст-тести),
TH2 (var-backed chart-утиліти з static fallback), TH3 (мета theme-color +
manifest + runtime-оновлення в useTheme), TH4 (регідрація градієнтів слайдів),
TH5/TH6 (Switch, -strong пілюлі), K1 (fold деструктивного confirm на shared
ConfirmDialog), E2–E8 (розсинхрон доків ↔ ADR-0081), P1–P4 і дрібні P7–P10,
A1 (dark+hc axe-паси для підмножини поверхонь), A2–A6, M1–M2 (порт var-блоків
і re-sync палітри mobile), M4, часткові M3/M8.

## 10. Бек-лог (потребує рішень, не автофікс)

1. **Відновити механічний enforcement** (E1): мінімум — дешевий grep/AST-скрипт
   у lint-ланцюг на: сирий hex у className, `focus:` замість `focus-visible:`,
   `text-2xs` поза showcase/чарт-виключеннями; або чесно записати в ADR-0081,
   що конвенції — review-only. Рішення founder-а: скрипт чи чесний запис.
2. **Тема-реактивні чарти** (TH1, TH7): міграція chartTheme.ts/BodyAtlas на
   `--c-chart-*`-патерн (ProgressRing як зразок; для heat-ramp — per-theme
   tiers як у routine-heatmap Wave-2b).
3. **Доля 6 компонентів-сиріт** (K3): MacroBarRow/AccentColorPicker виглядають
   як фічі, що не долетіли — підтвердити з founder-ом; Prose/OptimizedImage/
   PageTransition — кандидати на видалення через Knip-baseline.
4. **Shared OverlayShell/Drawer** (K6): загальний shell (portal +
   useDialogFocusTrap + useBodyScrollLock + useHistoryDismiss) для ~14
   hand-rolled діалогів; DeleteAccountDialog → shared Modal.
5. **SubTabs → shared** (K7): промоушн як `bar`-варіант Segmented.
6. **DesignShowcase**: розширити покриття (K4) або явно зафіксувати скоуп
   «tokens + overlays only»; переписати proposal-форки на реальні компоненти
   (K5); замести 132 text-2xs (P6).
7. **44px у CI** (E7): додати mobile-ui-audit (або хоча б touch-target spec)
   у critical-flow lane.
8. **Mobile-стратегія тем** (M3, M5–M7): рішення — чи mobile наздоганяє
   4-режимну модель (hc), чи фіксується 3-режимна; theme-aware mobile.js або
   деприкейт його поверхневих кольорів; семантична типографіка на mobile;
   values-night сплеш + runtime-ресінк статус-бару в mobile-shell.
9. **Ratchet сирої типографіки** (P5): правило «торкнувся файлу — мігруй»,
   старт із 3 nutrition-файлів (41 сайт ≈ 8% боргу).
10. **Контраст-тести як брама** (T10): розширити theme.softContrast.test.ts
    на hc ≥7:1-пари, accent/celebration vs bg, hover≠resting — частково
    закривається в цьому PR, решта — за паттерном.

## 11. Покриття і обмеження аудиту

- Аудитори читали повністю: пакет design-tokens, всі 4 скоупи theme.css,
  index.css/utilities/components/base, UI-кіт (листинг + ~15 глибоких
  відкриттів), showcase-імпорти (72 файли), плагін ESLint (індекс + wiring),
  ADR-0081/0082, CI-workflows, axe/mobile-ui сьюти, mobile global.css +
  theme-міст, mobile-shell init. Grep-звірки — по всьому монорепо.
- НЕ покрито: повний обхід усіх ~70 ui-файлів построково, apps/landing,
  Storybook-рендер кожної story, динамічні прогони (тести/білди не
  запускалися — статичний аналіз), візуальна перевірка в браузері.
- Метод: 7 аудиторів → дедуп → 3 адверсарні верифікатори (кожна high/medium
  знахідка перевірена по цитованих файлах; вердикти confirmed/adjusted/refuted;
  refuted — нуль, що свідчить про високу точність першого проходу).
