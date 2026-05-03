# ADR-0007: Tailwind colour-opacity scale + WCAG-AA `-strong` tier

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`AGENTS.md`](../../AGENTS.md) — hard rules #8 (`valid-tailwind-opacity`) і #9 (`no-low-contrast-text-on-fill`).
  - [`packages/design-tokens/tailwind-preset.js`](../../packages/design-tokens/tailwind-preset.js) — реєстрація `theme.opacity` + `-strong` шейдів.
  - [`packages/eslint-plugin-sergeant-design/index.js`](../../packages/eslint-plugin-sergeant-design/index.js) — правила `valid-tailwind-opacity` та `no-low-contrast-text-on-fill`.
  - [`docs/design/brandbook.md`](../design/brandbook.md) — секція WCAG-AA `-strong` Tier (per-family contrast table, decision matrix).
  - [`docs/design/brand-palette-wcag-aa-proposal.md`](../design/brand-palette-wcag-aa-proposal.md).
  - PR-historія: [#814](https://github.com/Skords-01/Sergeant/pull/814) (opacity-scale fix), [#854](https://github.com/Skords-01/Sergeant/pull/854) / [#855](https://github.com/Skords-01/Sergeant/pull/855) / [#857](https://github.com/Skords-01/Sergeant/pull/857) (strong-tier rollout).

---

## 0. TL;DR

Дві зв'язані, але окремі гарантії на колір у Tailwind-classNames:

1. **Opacity-scale (`<color>/<N>`)** працює тільки для зареєстрованих `N` у `theme.opacity`. Дозволені кроки: `0, 5, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100`. Будь-який інший крок (`/7`, `/9`, `/12`, `/18`, …) Tailwind тихо викидає, утиліта НЕ генерується, `dark:` / `hover:` варіант проваджується через декларацію — і ти бачиш баг лише при візуальному QA.
2. **`-strong`-tier** — окремі компаньйони `bg-{family}-strong` / `text-{family}-strong` (типово `-700`, для `nutrition` — `-800`), які гарантовано клірять WCAG 2.1 AA 4.5 : 1 проти `text-white` (5.0–6.6 : 1). Saturated `-500`-шейди brand-палітри регресують до 2.4–2.8 : 1 → банально нечитабельно body-розміром.

Обидві гарантії — **hard-rule + ESLint-error** (`valid-tailwind-opacity`, `no-low-contrast-text-on-fill`). Drift зловлений у CI до merge.

---

## ADR-7.1 — Чому opacity-scale потрібно явно реєструвати

### Status

accepted.

### Context

Tailwind v3 у режимі JIT генерує утиліту `<color>/<N>` тільки якщо `N` присутній у `theme.opacity`. Дефолтна шкала Tailwind — кратні 5: `0, 5, 10, 15, 20, ..., 100`. Sergeant-preset додатково реєструє `8` (явно — для «barely there» 8 % фону панелі: dark-mode module bento, primary/danger row highlight, routine surface tint).

Реальний баг ([#814](https://github.com/Skords-01/Sergeant/pull/814)):

```tsx
// 🐛 Баг
<div className="bg-routine-surface/40 dark:bg-routine/12" />
```

`/12` НЕ зареєстрований. JIT не згенерував `bg-routine/12` → у dark-mode `dark:bg-routine/12` нічого не визначає, фон лишається `bg-routine-surface/40` (light-mode), хоча візуально дизайн чекав saturated routine-tint.

Симптом: «у dark-mode routine-картки виглядають вицвілими». Знайшли через QA, не через ESLint — бо ESLint правила тоді не існувало. Постфактум — додали `valid-tailwind-opacity`.

### Decision

1. **Шкала opacity-step-ів зареєстрована централізовано** у `packages/design-tokens/tailwind-preset.js`:
   ```
   0, 5, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100
   ```
   Defaults Tailwind v3 + один кастомний `8`. Явний `8` — це Sergeant-конвенція «barely there»; альтернативи (`/5` → надто прозоро, `/10` → надто помітно) не підходили для саме цього кейсу.
2. **Список дозволених кроків продубльований у ESLint-плагіні** (`ALLOWED_TAILWIND_OPACITY_STEPS` у `packages/eslint-plugin-sergeant-design/index.js`). ESLint-правило `valid-tailwind-opacity` (`error`) ловить будь-який інший крок:
   ```tsx
   <div className="bg-routine/12" />
   //                          ^^ ❌ error: '12' is not a registered opacity step.
   //                                Allowed: 0, 5, 8, 10, 15, 20, 25, 30, ..., 100.
   ```
3. **Для додавання нового step-а** — обов'язкова двостороння зміна:
   - `theme.opacity` у preset-і (інакше Tailwind не згенерує утиліту).
   - `ALLOWED_TAILWIND_OPACITY_STEPS` у ESLint-плагіні (інакше CI зламає валідне використання).

   Mismatch — ловиться unit-тестом плагіна (`packages/eslint-plugin-sergeant-design/__tests__/valid-tailwind-opacity.test.mjs`), що читає preset і порівнює дві шкали. Розсихання (drift) — СI-error.

### Consequences

**Позитивні:**

- Невалідний step не доживає до prod — CI ламає merge.
- Двостороння перевірка (preset ↔ ESLint) гарантує, що `valid` у lint-і == `generated` у Tailwind.
- Розширення scale свідоме й документоване — нові step-и потребують аргументу «чому існуючі (`/5`/`/10`/`/15`) не підходять».

**Негативні:**

- Розсихання при змінах preset-у (новий step додано без оновлення ESLint) — теоретично можливе, але закрите тестом плагіна.
- Кастомний `8` — нестандартний крок; мобільний `apps/mobile` через NativeWind+preset також його успадковує, але тільки якщо preset правильно підвантажено (див. `apps/mobile/tailwind.config.js` → `presets: [nativewindPreset, sergeantPreset]`).

### Alternatives considered

1. **Дозволити будь-який step (Tailwind v4 default).** Tailwind v4 знімає це обмеження. Sergeant поки на v3, міграція на v4 — окремий ADR. Поки v3 — хочемо явну шкалу + lint.
2. **Прибрати кастомний `8` і використовувати `/10` замість «barely there».** Тестували на dark-mode bento — `/10` виглядав надто яскраво (виділяв саме картки замість м'якої підкладки). `/8` — точно той тон, який фронт-дизайн очікував.

---

## ADR-7.2 — Чому потрібен окремий `-strong`-tier

### Status

accepted.

### Context

Saturated brand colors (`brand`/`accent`/`success`/`warning`/`danger`/`info`/`finyk`/`fizruk`/`routine`/`nutrition`) у нас живуть на `-500`-шейді. Це чудово для:

- Soft fills (`bg-{family}-soft` / `bg-{family}/15`) — фон + темний текст того ж сімейства.
- Module tile background у dark-mode — там фон уже темний, і `-500` проти темного дає 5.4 : 1.

Але саме `-500` поверх `text-white` (наприклад, primary CTA `<button class="bg-brand text-white">`) дає контраст лише ~2.4–2.8 : 1, що **failing WCAG 2.1 AA**. Тестовано на дев-tools axe-core у smoke-e2e ([CI-job `a11y`](../../.github/workflows/ci.yml)) — стартував masive list of failures.

Реальний прецедент — світла кнопка primary CTA (Hub onboarding wizard, ManualExpenseSheet save, Recipe save) виглядала «фірмово зелена», але юзери з помірною короткозорістю (а їх ~30 % за our analytics survey 2026-Q1) не могли прочитати лейбл. Bug-reports підтвердили проблему.

### Decision

1. **Кожне saturated brand-family має `-strong` companion** (типово `-700`; для `nutrition` — `-800`, бо лаймовий лежить на жовтій частині спектру і `-700` все ще регресує до ~3.8 : 1):

   | Family    | Saturated (`bg-{family}` = `-500`) | `-strong`             | Hex       | vs `text-white` |
   | --------- | ---------------------------------- | --------------------- | --------- | --------------- |
   | brand     | `#10b981`                          | `bg-brand-strong`     | `#047857` | 5.48 : 1        |
   | success   | `#10b981`                          | `bg-success-strong`   | `#047857` | 5.48 : 1        |
   | warning   | `#f59e0b`                          | `bg-warning-strong`   | `#b45309` | 5.02 : 1        |
   | danger    | `#ef4444`                          | `bg-danger-strong`    | `#b91c1c` | 6.47 : 1        |
   | info      | `#0ea5e9`                          | `bg-info-strong`      | `#0369a1` | 5.93 : 1        |
   | finyk     | `#10b981`                          | `bg-finyk-strong`     | `#047857` | 5.48 : 1        |
   | fizruk    | `#14b8a6`                          | `bg-fizruk-strong`    | `#0f766e` | 5.47 : 1        |
   | routine   | `#f97066`                          | `bg-routine-strong`   | `#c23a3a` | 5.30 : 1        |
   | nutrition | `#92cc17`                          | `bg-nutrition-strong` | `#466212` | 6.96 : 1        |

   Повна таблиця — у `docs/design/brandbook.md` → "WCAG-AA `-strong` Tier".

2. **ESLint `no-low-contrast-text-on-fill` (`error`)** ловить порушення:

   ```tsx
   // ❌ EsLint error
   <button className="bg-brand text-white">…</button>
   <span className="bg-fizruk text-white">…</span>

   // ✅ Pass
   <button className="bg-brand-strong text-white">…</button>
   ```

3. **Деякі поєднання навмисно дозволені** (whitelist):
   - `bg-{family}-strong text-white` — канонічний фікс.
   - `bg-{family}-{700,800,900}` — explicit darker shades, контраст уже OK.
   - `bg-{family}/N` — opacity-tinted soft wash; foreground — `text-{family}-strong`, не `text-white`.
   - `bg-[#hex] text-white` — arbitrary value; deliberate one-off opt-out (lint не може обчислити контраст без розпарсу hex; не намагаємось).
   - `dark:bg-{family} text-white` — на темних поверхнях `-500` проти white вже clears 5.4 : 1; `-strong` тут regress-ить.
   - `hover:bg-{family} text-white` — hover-only saturated bg якщо base state ОК.

4. **Decision matrix** для primitives зафіксована у `brandbook.md` — кожен Button / Badge / Tabs / Stat / Banner / Segmented / SectionHeading / FormField має визначений map "tier per role".

### Consequences

**Позитивні:**

- WCAG 2.1 AA 4.5 : 1 hard-enforced для тексту на solid brand-fills.
- Фронт-дизайн отримав explicit пару (`-500` для tinted/soft, `-strong` для solid) замість «як вийде».
- Decision matrix робить вибір детермінованим: дизайнер не вирішує `bg-brand` vs `bg-brand-700` ad-hoc — є канон.

**Негативні:**

- Whitelist із 6+ exceptions у ESLint-правилі — потенційно false-negatives (наприклад, новий compound utility `aria-pressed:bg-brand text-white` поки не покривається). Ловитимемо через axe-core a11y-job у smoke-e2e як другий рівень захисту.
- Розсихання palette ↔ ESLint — той самий ризик, що і в ADR-7.1; закритий unit-тестом плагіна, який читає token-список з `tailwind-preset.js`.

### Alternatives considered

1. **Замінити `-500` на `-700` у brand-tokens (одне джерело).**
   Відхилено: `-500` потрібен для tinted-fills (`bg-brand/15`) і dark-mode (там контраст ОК). Втрачаємо палітру.

2. **Динамічно вираховувати контраст у runtime (CSS `color-contrast()`).**
   `color-contrast()` — Level 5 spec, не підтримується у production-браузерах (Safari TP only). Не варіант.

3. **Покладатися лише на axe-core у CI замість ESLint.**
   axe-core ловить тільки render-time-кейси, які реально виконані під час тесту. ESLint ловить **усі** входження classNames у вихідниках, навіть у unreached компонентах. Обидва шари важливі.

---

## ADR-7.3 — Розсихання palette ↔ ESLint

### Status

accepted.

### Context

`packages/design-tokens/tailwind-preset.js` і `packages/eslint-plugin-sergeant-design/index.js` — два різні файли в різних пакетах. Якщо одне змінили, інше можуть не оновити, і отримуємо drift:

- `theme.opacity` додав `7`, а ESLint про нього не знає → `bg-brand/7` працює у браузері, але CI ламає на ESLint.
- ESLint додав `12`, а preset не знає → `bg-brand/12` не генерується Tailwind-ом, але CI пропускає.

### Decision

**Unit-тест плагіна** (`packages/eslint-plugin-sergeant-design/__tests__/valid-tailwind-opacity.test.mjs`) імпортує preset і порівнює `Object.keys(preset.theme.opacity)` з `ALLOWED_TAILWIND_OPACITY_STEPS`. Mismatch — fail. Цей тест запускається `pnpm lint:plugins` → CI-job `check`.

Той самий принцип для `-strong` — є unit-тест, що `bg-{family}-strong` розв'язується preset-ом для кожного `family` зі списку у `no-low-contrast-text-on-fill`.

### Consequences

**Позитивні:**

- Drift неможливий — або CI зелений з обома consist, або червоний.
- Додавання нового token-а — два файли + один тестовий запуск, ~5 хв.

**Негативні:**

- Тести плагіна — `node --test` замість Vitest (плагін на чистому Node). Невелика когнітивна різниця для контриб'юторів. Терпимо: `node --test` simpler, не потребує bundler-а для ESLint-плагіна, і вже описаний в module ownership map (`packages/eslint-plugin-sergeant-design/**` → `node --test`).

### Alternatives considered

— **Витягнути scale в окремий JSON, який імпортується обома пакетами.** Логічно, але потребує 3-го пакета (`@sergeant/design-rules`) або monorepo-shared utility. Овергіл для двох констант. Тест простіший.

---

## Implementation status

- ✅ `theme.opacity` — `0,5,8,10,15,…,100` у `tailwind-preset.js`.
- ✅ `bg-{family}-strong` / `text-{family}-strong` для всіх 10 saturated families у `tailwind-preset.js` + `tokens.js`.
- ✅ ESLint `valid-tailwind-opacity` (`error`).
- ✅ ESLint `no-low-contrast-text-on-fill` (`error`).
- ✅ `brandbook.md` → WCAG-AA `-strong` Tier (per-family table + decision matrix).
- ✅ `brand-palette-wcag-aa-proposal.md` — історія міграції (#854/#855/#857).
- ✅ Unit-тести drift palette ↔ ESLint у `packages/eslint-plugin-sergeant-design/__tests__/`.

## Open questions

- **Tailwind v4 міграція.** v4 знімає вимогу реєструвати opacity-step-и (підтримує arbitrary). Наша шкала перетворюється на «recommendation» замість «hard-rule», ESLint правило стає optional. Якщо мігруємо на v4 — ADR-7.1 переходить у `superseded`.
- **Mobile (NativeWind 2.x).** NativeWind 2 переводить Tailwind classnames у React Native style-об'єкти; `bg-{family}-strong` працює, але ESLint правил саме для `apps/mobile/**` поки не виконуємо (плагін run-ається тільки на web). При наступній mobile-frontend reset-фазі винести правила на mobile.
