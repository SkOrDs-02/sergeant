# Design System — Типографічна шкала

> **Last touched:** 2026-09-19 by @claude. **Next review:** 2027-03-25.
> **Status:** Active (v2 redesign foundation merged 2026-05)

Цей документ охоплює типографічну шкалу, семантичні утиліти та правила ієрархії тексту.

Повний index → [`../design-system.md`](../design-system.md).

---

## 3. Типографічна шкала

### Семантичні `.text-style-*` ютиліті (tier-1, fluid)

**Вісім канонічних ролей** (D8-sweep, дизайн-аудит цикл 5) — це
**єдине правильне джерело істини** для типографіки. Кожна утиліта
зашиває `font-size` (fluid через `clamp()`), `line-height`,
`font-weight` і `letter-spacing` як один атомарний контракт. Розміри
плавно зростають від 320 px до 1280 px вьюпорту — без
media-query-стрибків, без drift-у між кейсами. Шкала була інвентарною
(12 слотів, де кілька пар відрізнялись лише на крок розміру); тепер
вона модульна — роль ≠ розмір, і кожна роль має рівно одне втілення.

**Дизайн-конвенція — 12px floor.** Жоден семантичний слот не опускається
нижче 12px (caption / overline). `text-2xs` (10px) зареєстрований у preset-і,
але зарезервований виключно для chart axis-ticks; у будь-якому іншому
продуктовому UI — deprecated, замінюй на `.text-style-caption`. Це не
`text-style-*` слот.

Реєстр живе у [`packages/design-tokens/tailwind-preset.js`](../../../../packages/design-tokens/tailwind-preset.js)
→ `plugins.semanticTypography`. Семантичні утиліти замість ручних
`text-* font-* tracking-*` комбо і заборона `text-[Npx]` / `text-[Nrem]` —
дизайн-конвенція, що тримається tokens + review (колишні lint-правила
`prefer-text-style` / `no-arbitrary-text-size` retired
[ADR-0081](../../../governance/adr/0081-repository-simplification.md)).

| Утиліта                | Розмір (clamp)    | Lh   | Weight | Tracking | Роль                                        |
| ---------------------- | ----------------- | ---- | ------ | -------- | ------------------------------------------- |
| `.text-style-display`  | 40 → 64 px        | 1    | 800    | -0.012em | Найбільше число / heading екрана            |
| `.text-style-headline` | 26 → 36 px        | 1.15 | 700    | -0.02em  | Page H1, hero-стат                          |
| `.text-style-title`    | 18 → 22 px        | 1.3  | 600    | -0.01em  | Заголовок секції / картки                   |
| `.text-style-body`     | 15 → 16 px        | 1.55 | 400    | 0        | Основний текст                              |
| `.text-style-label`    | 13 → 14 px        | 1.4  | 500    | 0.005em  | Мітки, кнопки, вторинний текст              |
| `.text-style-caption`  | **12 px** (floor) | 1.4  | 400    | 0.005em  | Мета, таймстемпи                            |
| `.text-style-overline` | **12 px** (floor) | 1.4  | 600    | 0.005em  | Кікер (службовий рядок) — без капсу, див. ↓ |
| `.text-style-code`     | 13 → 14 px / mono | 1.5  | 500    | 0        | Mono-дані, inline-код                       |

Точні `clamp()`: display `clamp(2.5rem, 2rem + 2.5vw, 4rem)`, headline
`clamp(1.625rem, 1.446rem + 0.893vw, 2.25rem)`, title
`clamp(1.125rem, 1.054rem + 0.357vw, 1.375rem)`, body
`clamp(0.9375rem, 0.920rem + 0.089vw, 1rem)`, label і code
`clamp(0.8125rem, 0.795rem + 0.089vw, 0.875rem)`.

**Трекінг display — −0.012em, не −0.03em.** Калібрування під кирилицю
(рішення власника 2026-08-05): у кирилиці помітно більше вертикальних
штрихів на слово, тож сильніше стиснення дає «частокіл».

**Overline — без `uppercase` і без широкого трекінгу** (рішення власника
2026-08-06, `mockups/product/kickers.html`). Капс у кирилиці стирає
силует слова, а трекінг `0.08em` існував лише заради капсу. Роль
службового рядка тепер несуть колір і 2px смужка у `SectionHeading`, не
форма літер. Ім'я `overline` лишили навмисно (рядок НАД заголовком ≠
«великі літери»).

**Два розмірні варіанти — лише для компонентів, не для сторінкового
коду** (це не дев'ята роль, як bold у body):

- `.text-style-label-lg` — 16 px фіксовано, та сама вага/трекінг, що в
  `label`. Призначення — великий CTA (`Button lg/xl`).
- `.text-style-headline-fixed` — 26 px фіксовано (= підлога плинного
  `headline`). Призначення — число в контейнері фіксованого розміру
  (кільце прогресу 96 px), де плинна роль переповнює контейнер на
  планшеті й десктопі. Не «спрощуй» його назад у плинний `headline`.

**Злиті в D8-sweep (куди мігрувати старі імена):** `hero` → `headline`
(значення були ідентичні), `display-hero` → `display`, `title-lg` /
`subtitle` → `title`, `body-lg` → `body`, `body-sm` / `body-strong` →
`label`. Жодна з цих утиліт **не зареєстрована**: `.text-style-hero`
у preset-і згадується лише застарілим коментарем над `.text-style-title`
(«Back-compat alias…»), самого правила немає. Пишеш старе ім'я — клас
мовчки не застосується.

**Роль + `font-*` на одному вузлі.** Ролі реєструються через
`addUtilities`, тобто мають ту саму специфічність, що й `font-semibold`,
і в зібраному CSS стоять вище — тож `text-style-caption font-semibold`
дає 600, а не 400. Роль програє явній вазі передбачувано. Перевірку
прив'язано до порядку в білді (AI-DANGER у preset-і) — переміряй, перш
ніж спиратись.

### Line-height & letter-spacing — за роллю, а не за розміром

- **Display / headline** — `line-height: 1` / `1.15`, негативний
  `letter-spacing` (-0.012em / -0.02em). Великі літери "слипаються" і
  виглядають композиційніше.
- **Title** — `line-height: 1.3`, легкий негативний трекінг (-0.01em).
- **Body** — `line-height: 1.55` (loose), трекінг 0. Це найважливіше —
  body для довгого читання має «дихати», навіть на mobile.
- **Label / caption / overline** — `line-height: 1.4`, мінімальний
  позитивний трекінг (0.005em) для читабельності на дрібних розмірах.
  Overline відрізняється від caption лише вагою (600 проти 400).
- **Code** — `line-height: 1.5`, monospace.

### Font-feature defaults

На рівні `html` (`apps/web/src/styles/base.css`) глобально вмикаються
OpenType-фічі:

```css
font-feature-settings:
  "kern" 1,
  /* кернінг          */ "liga" 1,
  /* common ligatures */ "calt" 1,
  /* contextual alts  */ "ss01" 1; /* stylistic set 01 */
font-kerning: normal;
text-rendering: optimizeLegibility;
```

Родина — **Manrope Variable** (v2 redesign 2026-05; `fontFamily.sans` і
`.display` у preset-і, DM Sans Variable лишається у fallback-стеку, mono —
JetBrains Mono Variable). `ss01` у base.css так і шипиться — під Manrope,
не під DM Sans, як писав старий коментар.

Це підв'язує всі екрани до однакових базових гліфів. Якщо потрібно
відключити для специфічного блоку (наприклад, ASCII-арт або суворо
літеральні гліфи) — `font-feature-settings: normal` на елементі.

### Tabular nums — `.tnum`

Числові колонки (таблиці, статистики, hero-цифри) **обов'язково**
вмикають `font-variant-numeric: tabular-nums` — інакше пропорційний
шрифт стрибає на ±2 px у пропорційних 5/6/7. Утиліта:

```html
<td class="tnum text-right">12 400</td>
```

`.tnum` живе в `tailwind-preset.js` поряд з `.text-style-*`.
Старий `.tabular-nums` (визначений у `apps/web/src/styles/base.css`)
лишається back-compat-аліасом.

### Legacy `.text-*` шкала (tier-2) — видалена

Другої шкали більше немає. `.text-display` / `.text-display-stat` /
`.text-display-hero` / `.text-h1…h3` / `.text-body` / `.text-body-sm` /
`.text-caption` / `.text-eyebrow` / `.text-meta` / `.text-micro` жили в
`apps/web/src/styles/utilities.css` паралельно до `.text-style-*` — два
«display hero», два caption і два набори заголовків означали, що однакова
роль на різних екранах отримувала різний розмір. У D8-sweep (цикл 5) усі
31 вживання переведено на ролі вище; на місці шкали в `utilities.css`
лишився лише tombstone-коментар («Legacy типографічна шкала — ВИДАЛЕНА»).
Правила `sergeant-design/prefer-text-style` теж більше немає (retired
ADR-0081), тож повернення legacy-класу механічно не ловиться — лише
review; механічно гейтиться тільки 12px-floor
(`scripts/check-design-conventions.mjs`).

Вага:

- `font-medium` (500) — секундарний акцент
- `font-semibold` (600) — дефолт заголовків
- `font-bold` (700) — hero, promo, large stat values
- `font-black` (900) — лише для великих цифр / промо

Числа завжди з `tabular-nums` у таблицях / статистиках.

### Заборонено: arbitrary `text-[Npx]` / `text-[Nrem]`

Ad-hoc `text-[12px]` / `text-[40px]` / `text-[2.5rem]` обходять
`text-style-*` — це призводить до vertical-rhythm-дрифту і регресій типу 8 px підпису
поверх трояндового фону (нижче WCAG-комфорту). Дизайн-конвенція — tokens +
review (колишнє lint-правило `no-arbitrary-text-size` retired ADR-0081):
будь-яке `text-[N(px|rem|em)]` — знахідка для design-review.

DS-примітиви, які власне визначають raw-px-токени (`Button`, `Input`,
`Badge`, `Stat`, `SectionHeading`, `Label`, `Toast`, `Skeleton`, `Tabs`,
`Segmented`, `Card`), звільнено від конвенції, бо вони — джерело істини
для самих утиліт.

### Довгий текст

Компонента `Prose` в `apps/web/src` **немає** (і в barrel
`@shared/components/ui` теж). Довгий текст набирається ролями напряму —
`.text-style-body` для абзаців, `.text-style-caption text-muted` для
підписів — а ширину рядка обмежує Tailwind `max-w-prose` на самому
елементі (так робить, наприклад, `core/DesignShowcase`). Окремого токена
`--max-line-length` немає.

### Do / Don't — гайдлайни ієрархії

- ✅ **Do** — використовуй один `display` або `headline` на екран.
  Hero — це фокусна точка; два хедлайни змагаються між собою.
- ✅ **Do** — `body` для абзаців; `label` — для вторинного тексту,
  підпису під полем чи secondary description (колишній `body-sm`).
- ✅ **Do** — `overline` як кікер (вага 600 + колір + 2px смужка
  `SectionHeading`), не як body і не через `uppercase`.
- ❌ **Don't** — не пар `text-style-display` з `text-style-label`
  в одному hero. Дисплейний розмір потребує `body` як супутника
  (контраст у вазі і ритмі).
- ❌ **Don't** — не пиши старі імена (`title-lg`, `subtitle`, `body-lg`,
  `body-sm`, `hero`, `display-hero`) — вони не зареєстровані, клас мовчки
  не спрацює.
- ❌ **Don't** — `text-2xs` (10 px) — це не "тиха caption". Це чарт-axis
  або декоративний бейдж. Для будь-якого тексту, який користувач
  має прочитати, щоб діяти — мінімум `caption` (12 px).
- ❌ **Don't** — не комбінуй `text-style-overline` з body-розмірним
  фоном (наприклад, на `bg-finyk-soft` з 12 px без weight 600 текст
  «втопиться» — overline передбачає контрастний weight).
