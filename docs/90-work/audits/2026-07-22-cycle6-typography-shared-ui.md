# Цикл 6, стадія 1 — сирі Tailwind-розміри в `shared/components/ui`

> **Last touched:** 2026-07-24 by @Skords-01. **Next review:** 2026-10-22.
> **Status:** Reference — звіт про виконання наряду циклу 6; baseline скорингу —
> [`2026-07-21-design-audit.md`](./2026-07-21-design-audit.md).

> Наряд: `cycle-6-task-for-claude-code.md` (Claude Design).
> Стек: dev `localhost:5175`, demo-дані, Chromium/Playwright, піксель-дифф fullPage,
> computed-проби ролей, axe-core. Метод — `design-audit-sergeant-web.md § Уроки`.

## Результат одним рядком

**0 сирих `text-<size>` у текстових ролях `shared/components/ui`.** 114 вживань →
80 переведено на семантичні ролі, 34 лишились свідомо (гліфи / гліф-пропорційні
шкали / focus-only / коментарі), кожне позначене. Канон 8 ролей записано в Hard Rule #16.

## «2 випадки text-[NNpx]» — насправді нуль реальних

Обидва — не код: `DesignShowcase/sections/Typography.tsx:132` це навчальний
`bad: <code>text-[14px]</code>` (колонка «як НЕ треба» в do/don't-таблиці —
ламати не можна), і `SectionHeading.tsx:39` це JSDoc-коментар. Жодного
className-вживання `text-[NNpx]` у коді немає. Не чіпав.

## Лічильник

|                                                                               | К-сть |
| ----------------------------------------------------------------------------- | ----- |
| Усього сирих `text-<size>` у прод shared/ui (до)                              | 114   |
| → переведено в ролі                                                           | 80    |
| → лишено як **гліф** (емодзі/іконка/роздільник) + `/* icon-size, not type */` | 8     |
| → лишено як **гліф-пропорційне** (символ під розмір контейнера) + коментар    | 14    |
| → лишено `focus:`-only (a11y skip-link, немає focus-варіанта ролі)            | 1     |
| → лишки в коментарях/docstring (не className)                                 | 11    |
| **Залишок у текстових ролях**                                                 | **0** |

Гліф-пропорційні (свідомо НЕ ролі): `Avatar` ініціали, `ProgressRing`/`ProgressCircle`
центральне число, `StreakFlame` лічильник — розмір символа масштабується з діаметром
контейнера, як іконка; втискання у фіксовану роль зламало б пропорцію. Це розширення
правила наряду «іконкові обгортки не чіпати», задокументоване в Hard Rule #16.

## Ключові рішення (за роллю, не за пікселем — урок Р1)

- **Button / Tabs / Segmented / menu-item / chip** → `label` (усі size-варіанти). Текст
  кнопки = роль label незалежно від розміру контролю. ⚠ **Наслідок:** `Button` lg/xl
  текст був 16px → став 13.9px (label); вага збережена (`font-bold` перекриває вагу
  ролі — перевірено computed: `text-style-label font-semibold` = 13.9px/**600**). md/sm
  без змін (14→13.9px). Потрібна дизайн-звірка: чи великі CTA мали б лишити 16px.
- **Input / Select / DateField / textarea** текст контролю → `body`.
- **Stat**: sm→`title`, md/lg→`headline` (число-статистика).
- **Card / Modal / Sheet / dialog title** → `title`; тіла/описи → `body`; hint/meta → `caption`.
- **SectionHeading**: роль дає РОЗМІР, casing/tracking/weight лишаються шарами (патерн,
  що вже був у `2xs`). xs/sm→caption, md→label, lg/xl→`title`. ⚠ lg(18)/xl(20)
  **колапсують** в один `title` — наслідок закритої 8-ролевої шкали (розрив title 22 →
  headline 26). Виношу як знахідку: xl-call-sites, що хочуть 26px+, мали б брати headline.
- **EmptyState**: title (text-base/xl) → `title`, описи → `body`/`caption`, eyebrow → `overline`.

## Гейти

- **Лічильник:** 0 сирих у текст-ролях (скрипт-перевірка). ✅
- **typecheck:** чисто. ✅
- **lint:** 0 errors (18 warnings — pre-existing `no-non-null-assertion` в AccentColorPicker). ✅
- **Тести:** `SectionHeading`/`Stat`/`Badge` — оновлені assertions на нові ролі; 29/29 passed.
  (`Stat.test` `text-3xl`→`text-style-headline`; SectionHeading xs→caption, md→label;
  Badge sm/md→caption). ✅
- **8 ролей генеруються** (computed-проба): display 64/800 · headline 34.6/700 · title
  21.4/600 · body 15.9/400 · label 13.9/500 · caption 12/400 · overline 12/600 UPPER. ✅
- **axe** (WCAG 2.0/2.1 A+AA, hub/finyk/settings × light/dark): 0 порушень на всіх
  стабільних станах. ⚠ dark/finyk мигтить (1 з 4 прогонів) — вузли в
  `modules/finyk/components/budgets/MonthlyPlanCard.tsx` (`text-xs text-subtle`, сирий
  клас, **поза скоупом stage-1**, присутній 2× і на origin/main — pre-existing F9-клас
  боргу reseed-стану, не регресія цього циклу).

## Піксель-дифф (fullPage, light+dark, 9 екранів)

settings/chat 0.00–0.03% (мало shared/ui-тексту в кадрі). finyk/insights/routine 1.9–3.2%
— зсуви від line-height ролей (fullPage амплітудить reflow). **hub 17% / nutrition-dark 21%**
— НЕ типографіка: content-dynamism між прогонами (привітання «Доброї ночі»→«Доброго дня»
за часом доби; adaptive-bento переставив картки — Їжа піднялась із «активний сигнал»;
інші FTUX/nudge-картки). Типографіка (заголовки, числа, ваги) на before/after візуально
стабільна.

**Урок циклу підтверджено:** перший after-прогін routine дав 59% — це була
**skeleton-фаза** (сторінка не долоадилась під CPU-навантаженням від паралельних тестів).
Перезнятий чисто → 2.76%. Baseline і after — лише з розвантаженого dev-сервера.

## Не в скоупі (stage 2+)

`core/**` та модульні поверхні (≈решта з ~1040 сирих розмірів) — окремі наряди.
Знахідки на майбутнє: (1) Button lg/xl 16→14 — рішення по великих CTA; (2) SectionHeading
lg/xl колапс — чи потрібен headline для великих секційних заголовків; (3) MonthlyPlanCard
`text-subtle` контраст на темному (F9-клас) — при stage-2 finyk.
