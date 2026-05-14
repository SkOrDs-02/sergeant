# Page Audit — Fizruk module Part 2 (Progress, Measurements, Programs, Body)

> **Last validated:** 2026-05-13 by Devin (child session).
> **Status:** Active
> **Auditor:** child Devin session (parent: <https://app.devin.ai/sessions/7d63e4e64e644012afe8c886eab9fc40>)
> **Scope slug:** `07-fizruk-part2`
> **Pages in scope:**
>
> - `apps/web/src/modules/fizruk/pages/Progress.tsx`
> - `apps/web/src/modules/fizruk/pages/Measurements.tsx`
> - `apps/web/src/modules/fizruk/pages/Programs.tsx`
> - `apps/web/src/modules/fizruk/pages/Body.tsx`
> - `apps/web/src/modules/fizruk/pages/Body/{CollapsibleTrendCard,JournalEntryCard,JournalSection,ScoreButton}.tsx`
> - `apps/web/src/modules/fizruk/pages/Body/{storage,trendUtils}.ts`

## Summary

Cтатичний аудит Fizruk Part 2 виявив **6 high-severity** і **22 medium-severity** проблем плюс набір low-severity нітів. Ключові теми:

1. **Sensitive PII (зріст, вага, обхвати, % жиру) приймається без жодних діапазон-валідацій** — `Measurements.tsx` зберігає будь-яке число у SQLite-кеш та dual-write pipeline; `Body.tsx` валідує `weightKg`/`sleepHours`, але не калібрує решту.
2. **Domain invariant violation:** week-bucketing і today-day-index у Progress/Programs використовують локальний таймзон браузера, а не Europe/Kyiv — рекорди й розклад дрейфують для юзерів за межами UA.
3. **Hard-rule-blocker tests gap:** жодна з 4 сторінок не має unit-тестів. Цілі формули (Epley 1RM, weekly muscle volume, deltas) живуть на page-рівні без покриття.
4. **A11y regressions:** кілька інтерактивних елементів нижче WCAG 2.5.5 touch-target floor (PR filter pills, "Видалити", inline iconless buttons), а більшість кастомних `<button>` без `focus-visible:`-індикатора.
5. **Tailwind / token bypass:** chart-кольори вшиті як `rgb(…)` props (немає dark-mode варіанту), `text-2xs` подекуди використовується для primary-content (Programs schedule metadata).
6. **Module size pressure:** `Progress.tsx` 591 LOC і `Body.tsx` 514 LOC — обидва близько до Hard Rule #18 (`max-lines: 600`).

- Critical: **0**
- High: **6**
- Medium: **25**
- Low: **19**
- **Total: 50**

---

## Findings

### F1 — Progress page рахує тиждень у локальному таймзоні замість Europe/Kyiv [severity: high] [perspective: bug]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L17–L23

**Description.**
`weekStartMs` будує week-bucket через `new Date(d)` + `getDay()` + `setHours(0,0,0,0)` — це native JS, прив'язаний до системного таймзона браузера. Domain invariants ([`docs/architecture/domain-invariants.md`](../architecture/domain-invariants.md)) явно фіксують **Europe/Kyiv** як єдиний правильний таймзон для day-keys і week-bucket-ів.

```ts
function weekStartMs(d: number | string | Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // ❌ local timezone
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x.getTime();
}
```

**Why it matters.**
Для юзера в UTC+3 (наприклад в подорожі) тренування 23:30 субботи буде віднесене до **наступного** тижня в Kyiv, але до **поточного** локально. PR Board, weekly volume bars і "останнє тренування" розбіжаться з тим, що показує Workouts page (де теж є аналогічна логіка). Це silent regression, який не ловиться unit-тестом, бо тест-середовище — UTC.

**Recommendation.**
Винести `weekStartMs` у `@sergeant/fizruk-domain/lib` (поряд із `weeklyVolumeSeriesNow`) із параметризованим Kyiv-конвертером, як це вже зроблено для day-keys. Або реюзати existing `weeklyVolumeSeriesNow` без локальної копії week-aggregator-у в page-компоненті.

---

### F2 — `Programs` обчислює `todayDayIndex` у локальному часі [severity: high] [perspective: bug]

**Page:** `Programs`
**File:** `apps/web/src/modules/fizruk/pages/Programs.tsx`
**Lines:** L39

**Description.**

```ts
const todayDayIndex = (new Date().getDay() + 6) % 7;
```

Цей вираз визначає, який день тижня "сьогодні" — і саме від нього залежить, чи показати кнопку "Розпочати сьогодні", чи "Сьогодні відпочинок". `new Date().getDay()` використовує локальний таймзон браузера. Об 23:00 у п'ятницю за Kyiv (UTC+3 влітку), для юзера в UTC бачить вже субботу — і отримує не той session.

**Why it matters.**
Користувач у іншому таймзоні бачить підсвічений неправильний день у graph-strip (L104–L124), а кнопка стартує сесію, яка не належить до поточного дня програми. Збиває звичку та progression-логіку.

**Recommendation.**
Імпортувати helper з домену: `import { kyivDayIndex } from "@sergeant/shared/time"` (за аналогією з [`computeRecoveryBy`](../../packages/fizruk-domain/src/lib/recoveryCompute.ts), яка вже Kyiv-aware). Інакше cross-timezone smoke у Playwright (`process.env.TZ`) має флагнути цей drift як CI-gate.

---

### F3 — Measurements зберігає замір без жодних діапазон-валідацій (sensitive PII) [severity: high] [perspective: security]

**Page:** `Measurements`
**File:** `apps/web/src/modules/fizruk/pages/Measurements.tsx`
**Lines:** L162–L180

**Description.**

```tsx
onClick={() => {
  const payload: Record<string, number> = {};
  for (const f of MEASURE_FIELDS) {
    const v = (form[f.id] || "").trim();
    if (v) payload[f.id] = Number(v.replace(",", "."));
  }
  addEntry(payload);
  ...
}}
```

Жодних `min/max`/`Number.isFinite` гард-ів. На відміну від `Body.tsx` (де `bodyFormSchema` обмежує weight 20–300, sleep 0–24), 14 полів MEASURE_FIELDS (включаючи `bodyFatPct`, `neckCm`, `waistCm`, біцепси, стегна) приймають будь-яке число або NaN. `Number("abc")` = NaN → `payload.weightKg = NaN` → запис у SQLite через dual-write.

**Why it matters.**

1. NaN-записи отруюють SQLite cache і будь-який downstream chart, що читає `weightKg` (Body, Progress, Nutrition's "поточна вага", Profile biometrics). `Number.isFinite` guards ловлять NaN на read-side, але `toFixed` / `toLocaleString` дадуть "NaN".
2. Юзер може зберегти 99999 кг або -50% жиру і не отримати жодного попередження. Чутливі PII (sensitive health data) зберігаються без sanity-чеку, що порушує "always validate sensitive PII on write" patern.
3. Прямо протирічить підходу `Body.tsx`, де ті ж самі `weightKg`/`sleepHours` валідуються zod-схемою. Two sources of truth для діапазонів ваги.

**Recommendation.**

```ts
// MEASURE_FIELDS extended with min/max + zod schema:
const measurementSchema = z.object({
  weightKg: z.number().min(20).max(300).optional(),
  bodyFatPct: z.number().min(2).max(70).optional(),
  neckCm: z.number().min(20).max(80).optional(),
  // … similar for all 14 fields
});
// в onClick:
const parsed = measurementSchema.safeParse(payload);
if (!parsed.success) {
  /* show toast with messages.validation.measurement_outOfRange */
}
```

Витягти діапазони у `MEASURE_FIELDS` як `{ id, label, unit, min, max }`, тоді `<input min={f.min} max={f.max}>` дає native browser hint + zod дублює як runtime gate.

---

### F4 — Measurements дозволяє зберегти повністю порожню форму [severity: high] [perspective: bug]

**Page:** `Measurements`
**File:** `apps/web/src/modules/fizruk/pages/Measurements.tsx`
**Lines:** L166–L176

**Description.**
Якщо юзер натиснув "Зберегти замір" без жодного заповненого поля, `payload = {}` і `addEntry({})` створює entry з тільки `id` + `at`. Цей entry попадає у `entries`, рендерить пустий рядок у "Історія" з summary "—", а у `latest` стає поточним (хоча в ньому 0 заповнених полів). Counter `stats.filledLatest` = 0 — все ще зберігає пустий timestamp і збиває weekly delta computation.

**Why it matters.**
Smoke-test risk: tap-mistake на кнопку (велика, на повну ширину `py-4`) → пустий запис → у `Body.tsx` `meas.latest` тепер вказує на entry без weightKg → дельта між latest і prev обчислюється з невірних точок. Користувач думає що "сьогоднішній" замір зафіксувався, але насправді дані пусті.

**Recommendation.**

```ts
if (Object.keys(payload).length === 0) {
  toast.warn(messages.measurements.atLeastOneFieldRequired);
  return;
}
addEntry(payload);
```

Або disable submit-кнопки, якщо немає жодного непорожнього поля у `form`.

---

### F5 — Жоден з 4 page-файлів не має unit-тестів [severity: high] [perspective: test]

**Pages:** `Progress`, `Measurements`, `Programs`, `Body` + усі 4 sub-компоненти у `Body/`
**Files:** `apps/web/src/modules/fizruk/pages/*.tsx`, `apps/web/src/modules/fizruk/pages/Body/*.tsx`
**Lines:** _(missing)_

**Description.**
`find apps/web/src/modules/fizruk/pages -name "*.test.*"` повертає 0 файлів. У scope є:

- Progress: 591 LOC, формули Epley 1RM PR detection, weekly muscle volume aggregation (за 4-тижневим вікном), weight/fat trend extraction, wellbeing chart data.
- Measurements: form-engine `Number(v.replace(",", "."))`, deltas calculation, `stats.filledLatest`.
- Programs: `todayDayIndex` mod-math, schedule filter, activate/deactivate program flow.
- Body: `bodyFormSchema` zod-валідація, conditional trend rendering (4 charts кожна з `recentWith`), submit-success timer.
- Body/storage.ts: `readTrendOpen`, `readPersistedOpen` localStorage gates.
- Body/trendUtils.ts: `firstValidValue`, `lastValidValue` (зі `!`-assertion-ом — F25).

Тільки support hooks мають тести (`useDailyLog.test.tsx`, `useWorkouts.test.tsx`, `usePushupActivity.test.tsx`), але саме wiring зі сторінкою не покритий.

**Why it matters.**
PR detection (Epley 1RM) — це канонічна формула для прогресу strength. Її silent regression (наприклад, swap між `weightKg` та `reps`) проявиться тільки тоді, коли користувач помітить дивні цифри на Progress. weekly muscle volume normalisation (`1.0` для primary, `0.55` для secondary, `/1000` для kg-reps tonnage, `/240` для time, complex distance formula) у L98–L120 — це алгоритмічно складна логіка без жодного reproducer.

**Recommendation.**

1. Додати `Progress.test.tsx` з MSW + RTL: mount with mock workouts (strength sets, time, distance variants); assert PR list ordering + muscle bar heights.
2. Додати `Measurements.test.tsx`: empty form submit, NaN handling, delta calc with mixed `bicep L/R` fields, `Number(v.replace(",", "."))` for both `1.5` and `1,5` locales.
3. Додати `Programs.test.tsx`: cycle through 7 days, verify "Розпочати сьогодні" shows for each schedule.day; with `Object.defineProperty(Date.prototype, 'getDay', ...)` mock.
4. Додати `Body.test.tsx`: zod-validation для weight (20/300 boundary), sleep (0/24), submit-success timer cleanup on unmount.

---

### F6 — Програма стартує сесію через non-null assertion на можливо-відсутній sessionKey [severity: high] [perspective: bug]

**Page:** `Programs`
**File:** `apps/web/src/modules/fizruk/pages/Programs.tsx`
**Lines:** L142–L146

**Description.**

```tsx
onClick={() => {
  const session = prog.sessions[todaySession.sessionKey];
  onStartWorkout(session!, prog);
}}
```

`prog.sessions` має тип `Record<string, ProgramSessionDef>`. З `noUncheckedIndexedAccess: true` (Hard Rule #19) індекс-аксес повертає `ProgramSessionDef | undefined`. Non-null `!` приховує цей факт. Якщо `BUILTIN_PROGRAMS` містить schedule entry з `sessionKey: "leg-day"` але `sessions["leg-day"]` відсутній (data-drift у домені), runtime крашиться у дочірньому компоненті, який очікує `ProgramSessionDef` як non-null.

**Why it matters.**
Hard Rule #19 (`noUncheckedIndexedAccess`) свідомо increased strictness специфічно для таких випадків. `!` тут — це робота у мінус (стирає сигнал, який strict-flag дає). Якщо `BUILTIN_PROGRAMS` редагується (наприклад, прибрали ключ `sessions["push"]`, але забули прибрати з `schedule`), build не впаде, але runtime крашне.

**Recommendation.**

```tsx
const session = prog.sessions[todaySession.sessionKey];
if (!session) {
  // log to Sentry — silent data drift between schedule and sessions
  return;
}
onStartWorkout(session, prog);
```

Краще ще на рівні domain — додати `pnpm test` тест у `packages/fizruk-domain/src/lib/trainingPrograms.test.ts`, який ітерує `BUILTIN_PROGRAMS` і assert-ить, що кожен `schedule[i].sessionKey` присутній у `sessions`.

---

### F7 — PR filter pills нижче WCAG 2.5.5 touch-target floor [severity: medium] [perspective: a11y]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L484–L511

**Description.**

```tsx
<button
  className={cn(
    "shrink-0 px-3 h-7 rounded-full text-xs font-semibold transition-colors border",
    ...
  )}
>
```

`h-7` = 28px у Tailwind. Apple HIG / WCAG 2.5.5 вимагають ≥44×44px для coarse pointer. `apps/web/AGENTS.md § Touch targets` явно вимагає `touch-target` або `min-h-[44px] min-w-[44px]`. На цих пілюлях немає ні того, ні іншого.

**Why it matters.**
Mobile-first PWA (`apps/web` тарґетить Capacitor), і ці пілюлі — primary filter для "Рекорди (PR)". Користувач з товстими пальцями має шанс mis-tap на сусідню групу мʼязів. Hard-rule-блокер для нового UI, але цей файл уникнув "Active" — initiative gap.

**Recommendation.**
Замінити `h-7` на `min-h-[44px]` (бажано — використати `Button` компонент з варіантом `xs`, який вже інкапсулює правило). Або додати `data-compact` як explicit opt-out і задокументувати у comment, чому це OK для filter-strip.

---

### F8 — Inline кнопка "Видалити" в Measurements історії — крихітна, без touch-target + без confirmation [severity: medium] [perspective: a11y]

**Page:** `Measurements`
**File:** `apps/web/src/modules/fizruk/pages/Measurements.tsx`
**Lines:** L249–L254

**Description.**

```tsx
<button
  className="text-xs text-danger/80 hover:text-danger"
  onClick={() => handleDelete(e.id)}
>
  Видалити
</button>
```

Touch target — лише `text-xs` = 12px з default line-height, тобто ≈16px висота. Немає `touch-target`. Destructive action без двостадійного confirm — Undo через toast (`showUndoToast`) є, але miss-tap mid-scroll на mobile дуже легкий.

**Why it matters.**
Сторінка з PII — кожне видалення це втрата даних. Хоча Undo toast існує (good), він автоматично зникає за 4–6 секунд (стандарт). Якщо юзер не помітив, дані пропали назавжди (немає server-side restore).

**Recommendation.**
Або (a) explicit confirm-modal на mobile, або (b) `touch-target` + іконка `Trash` як у `JournalEntryCard.tsx:78–94` (там вже правильно). Гомогенно з рештою модуля.

---

### F9 — Chart-кольори в Progress та Body вшиті як `rgb(…)` props, бай-пас design-token system [severity: medium] [perspective: tailwind]

**Pages:** `Progress`, `Body`
**Files:** `apps/web/src/modules/fizruk/pages/Progress.tsx`, `apps/web/src/modules/fizruk/pages/Body.tsx`
**Lines:** Progress L389,L404; Body L446,L455,L464,L473

**Description.**

```tsx
// Progress:
<MiniLineChart data={weightTrend} unit="кг" color="rgb(22 163 74)" metricLabel="вагу тіла" />
<MiniLineChart data={fatTrend} unit="%" color="rgb(234 179 8)" metricLabel="відсоток жиру" />

// Body:
{ storageKey: "weight", color: "rgb(22 163 74)", ... },
{ storageKey: "sleep",  color: "rgb(99 102 241)", ... },
{ storageKey: "energy", color: "rgb(245 158 11)", ... },
{ storageKey: "mood",   color: "rgb(236 72 153)", ... },
```

Hard Rule #11 (`no arbitrary hex in className`) сюди формально не дотягується — `color` це prop, не className. Але це token-system bypass: жодного `dark:`-варіанту немає, кольори не походять з `packages/design-tokens/`. Для світлої теми Tailwind колір success/brand — інший RGB, ніж тут вшито.

**Why it matters.**
`success-strong` (Tailwind token) у dark-mode інший RGB, ніж `rgb(22 163 74)`. Наслідок: на dark-theme лінія тренду має один зелений, кнопка `bg-success-strong` поруч — інший. Візуальна неузгодженість, регресія мадж-системи.

**Recommendation.**
`MiniLineChart` має приймати `tone: "success" | "warning" | "info" | "fizruk"` і resolve-ити CSS custom-property (через `currentColor` або `style={{ color: "var(--color-success-strong)" }}`). Або всі 6 chart-точок render-яться через `text-success` / `stroke-current` Tailwind-utility. Це закриє dark-mode drift одночасно для weight/fat/sleep/energy/mood.

---

### F10 — `text-2xs` (10px) на primary-content metadata у Programs (Hard Rule #16) [severity: medium] [perspective: rule]

**Page:** `Programs`
**File:** `apps/web/src/modules/fizruk/pages/Programs.tsx`
**Lines:** L221–L234

**Description.**

```tsx
<div className="flex items-center gap-3 mb-2 text-2xs text-subtle">
  <span>
    Відпочинок:{" "}
    <span className="font-semibold text-text">{session.defaultRestSec}с</span>
  </span>
  <span>
    Прогресія:{" "}
    <span className="font-semibold text-text">+{session.progressionKg} кг</span>
  </span>
</div>
```

`text-2xs` = 10px (per `packages/design-tokens/tailwind-preset.js:446`). Hard Rule #16 ([12px floor](../governance/rules/16-typography-scale-12px-floor.md)) дозволяє 10px **лише для chart axis ticks і decorative metadata badges**. Тут "Відпочинок: 120с / Прогресія: +2.5 кг" — це primary workout-config information, який юзер має прочитати, щоб зрозуміти, як працює програма.

**Why it matters.**
Лит-rule fires on the lint-side (`sergeant-design/...`-родина), і автор міг пропустити, бо badges поряд (`text-2xs` для "День 1") виглядають legitimate. Але змішування decorative і primary в одному visual chunk — це type-system drift, який точно треба ловити в audit.

**Recommendation.**
Підняти ці два рядки до `text-xs` (12px, `text-style-caption`). Якщо потрібно зекономити простір — використати ico-spec формат (іконка ⏱ замість слова "Відпочинок").

---

### F11 — Програма-buttons (Активувати / Розпочати / Зупинити / Деталі) без `focus-visible:`-індикатора [severity: medium] [perspective: a11y]

**Page:** `Programs`
**File:** `apps/web/src/modules/fizruk/pages/Programs.tsx`
**Lines:** L128–L174

**Description.**
Усі inline-кнопки на activator-rib (4 типи) використовують bespoke `className="... rounded-xl bg-success-strong text-white ..."` без `focus-ring` utility або `focus-visible:` ringу. Default browser focus outline працює, але:

1. Hover-стилі переписують color (`hover:bg-panelHi`) — тому focus-only outline теряється на фокусі без hover.
2. `apps/web/AGENTS.md` явно фіксує Hard Rule #14: focus-visible не focus.
3. Імпорт `Button` (L3) використовується **тільки 1 раз** (header "Зупинити" L54) — решта — raw `<button>`. Inconsistent.

**Why it matters.**
Keyboard / screen-reader users втрачають affordance, який саме Hard Rule #14 і вимагає виправити. Програми — основний CTA модуля.

**Recommendation.**
Замінити raw `<button>` на `<Button variant="primary" size="md" tone="success">Активувати</Button>` — `Button.tsx` вже інкапсулює `focus-visible:`-ring і `min-h-[44px]`. Це закриває F11 + F12 одночасно.

---

### F12 — Measurements submit-button без `focus-visible:`-ring + emoji-icon без `aria-label` [severity: medium] [perspective: a11y]

**Page:** `Measurements`
**File:** `apps/web/src/modules/fizruk/pages/Measurements.tsx`
**Lines:** L162–L180

**Description.**
"Зберегти замір" — raw `<button>` з `className="w-full py-4 rounded-full font-bold text-base bg-fizruk-strong text-white ..."` — жодного focus-ring/focus-visible: класу. Зовнішнє wikihow-посилання L72 — `<a target="_blank" rel="noreferrer">`. Inline `<svg>` на L79–L91 без `aria-hidden`, SVG-text doesn't have `role="img" aria-label="…"`, тому screen-reader зачитує SVG-path як артефакт.

**Why it matters.**
Same as F11 — keyboard-users не бачать focus state. `<a>`-картка з SVG-іконкою на початку screen-reader має зачитувати "Як правильно робити заміри (зовнішнє посилання)" — натомість зачитає шум.

**Recommendation.**
`<button className="focus-ring …">` + `<svg aria-hidden="true">` + `<a … aria-label="Як правильно робити заміри · зовнішнє посилання у wikihow">`.

---

### F13 — Measurements input-и без явної прив'язки `<label>` ↔ `<input>` [severity: medium] [perspective: a11y]

**Page:** `Measurements`
**File:** `apps/web/src/modules/fizruk/pages/Measurements.tsx`
**Lines:** L137–L160

**Description.**
14 полів вимірів рендеряться у циклі. Заголовок кожного поля — `<SectionHeading as="div">{f.label} · {f.unit}</SectionHeading>`. `<input>` не має `id`, `aria-label`, `aria-labelledby`. WCAG 1.3.1 / 3.3.2 — асоціація label↔input для form-полів.

**Why it matters.**
Screen-reader юзер при tabbing-у через 14 полів чує лише `inputMode="decimal"` + placeholder "—" — повна сліпота до того, що це "Шия (см)" чи "Талія (см)". Зі специфічної категорії "вимірюйте свою талію" — це особливо guardian-sensitive (тіло, голос вголос). Безбар'єрність зламана.

**Recommendation.**

```tsx
<SectionHeading
  as="label"
  htmlFor={`measure-${f.id}`}
  size="xs"
  variant="fizruk"
>
  {f.label} · {f.unit}
</SectionHeading>
<input id={`measure-${f.id}`} ... />
```

Або як у `Body.tsx:281–296` — `<Label htmlFor>` + `<input id>` — там цей патерн уже правильний.

---

### F14 — ScoreButton groups не семантично `radiogroup`/`radio` [severity: medium] [perspective: a11y]

**Page:** `Body` (sub: `Body/ScoreButton.tsx`)
**File:** `apps/web/src/modules/fizruk/pages/Body.tsx`, `apps/web/src/modules/fizruk/pages/Body/ScoreButton.tsx`
**Lines:** Body L345–L365, L377–L391; ScoreButton L33–L55

**Description.**

```tsx
<div className="flex gap-1.5" role="group" aria-label="Рівень енергії">
  {[1,2,3,4,5].map((v) => <ScoreButton ... />)}
</div>
```

Поведінка classic radio-group: 5 mutex варіантів, можна toggleнути назад до null. ARIA-pattern для такого випадку — `role="radiogroup"` + `role="radio"` + `aria-checked`. Зараз — `role="group"` + `<button aria-pressed>`. Screen-reader читає "Рівень енергії, group" + "1, button, pressed" замість "Рівень енергії, radio group, Виснажений, 1 of 5, not selected".

**Why it matters.**
WCAG 4.1.2 (Name/Role/Value). Якщо юзер натиснув ↓ Arrow keys у `radiogroup` — це нативно зрухнеться між radio items. У button-group це не працює — треба Tab через кожну кнопку.

**Recommendation.**
Замінити `<button>` на real `<input type="radio">` з custom label-style (як native form), або переписати ScoreButton на:

```tsx
<button role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} ...>
```

- keyboard nav на `<div role="radiogroup" onKeyDown={…}>`.

---

### F15 — Per-PR card button у Progress без `focus-visible:`-індикатора [severity: medium] [perspective: a11y]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L538–L581

**Description.**
PR-card як `<button className="w-full text-left border border-line rounded-2xl p-3 bg-bg hover:bg-panelHi transition-colors">`. Only hover. Активний focus-ring відсутній. У PR-board може бути 20+ записів — keyboard-юзер не бачить, де він зараз.

**Why it matters.**
Те саме що F11 + WCAG 2.4.7 Focus visible.

**Recommendation.**
Додати `focus-ring` utility. `<button className="focus-ring w-full text-left ...">` — це one-liner, який автоматично підтягне правильний focus-color через CSS var.

---

### F16 — Програма "сьогодні відпочинок" / day-strip без screen-reader summary [severity: medium] [perspective: a11y]

**Page:** `Programs`
**File:** `apps/web/src/modules/fizruk/pages/Programs.tsx`
**Lines:** L103–L125

**Description.**
7 `<div>` на activator-rib рендерять Пн/Вт/.../Нд з кольоровим bg для днів-сесій. Screen-reader зачитує "Пн Вт Ср ..." без жодного контексту, який день має тренування і який — відпочинок.

**Why it matters.**
Critical info — "Push-Pull-Legs", "Upper-Lower", FullBody-3x — інкапсульована тільки візуально.

**Recommendation.**

```tsx
<div
  role="img"
  aria-label={`Розклад програми: ${prog.schedule.map((s) => DAY_LABELS_FULL[s.day - 1]).join(", ")}; інші дні — відпочинок`}
>
  {/* visual day strip */}
</div>
```

Або winning solution: native `<dl>` зі `<dt>День</dt><dd>сесія</dd>`.

---

### F17 — Programs day-strip використовує `text-2xs` (10px) для primary scheduling content [severity: medium] [perspective: rule]

**Page:** `Programs`
**File:** `apps/web/src/modules/fizruk/pages/Programs.tsx`
**Lines:** L113

**Description.**

```tsx
className={cn("flex-1 text-center rounded py-1 text-2xs font-bold transition-colors", ...)}
```

День тижня — інформативний UI, не decorative timestamp. Hard Rule #16 — primary text ≥12px.

**Recommendation.**
`text-xs` (12px) + `py-2` (для компенсації висоти ribbon-у).

---

### F18 — Progress PR filter втрачає state на back-nav та не reset-ить на стейл group [severity: medium] [perspective: ux]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L228, L463–L467

**Description.**
`useState("all")` для `prFilter`. При `onNavigate("exercise/...")` page unmount-иться, при поверненні — фільтр reset-ається на `"all"`. OK для простого case, але:

1. Якщо юзер відфільтрував `prFilter="chest"`, видалив усі chest-сети у Workouts, повернувся — фільтр все ще `"chest"`, але `muscleGroups` тепер не містить `chest`. UI показує `EmptyState "Немає PR для цієї групи мʼязів"` без auto-fallback на `"all"`.
2. Persist filter в URL search-params (наприклад `?prFilter=chest`) дав би shareable deep-link + back-button preservation.

**Why it matters.**
Onboarding-friendliness: новий user натискає filter, потім гортає Workouts, повертається — стан незрозумілий ("чому пусто?").

**Recommendation.**

```tsx
useEffect(() => {
  if (prFilter !== "all" && !muscleGroups.includes(prFilter)) {
    setPrFilter("all");
  }
}, [prFilter, muscleGroups]);
```

Або зберігати у `searchParams` через `useSearchParams` (react-router v6).

---

### F19 — `meas.delta(field)` викликається 3–4 рази у тому ж рендері без memoization [severity: medium] [perspective: perf]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L333–L376

**Description.**

```tsx
sublabel={
  meas.delta("weightKg") == null ? (
    "Немає порівняння"
  ) : (
    <span className={cn(..., meas.delta("weightKg")! > 0 ? "text-warning" : "text-success",)}>
      {meas.delta("weightKg")! > 0 ? "+" : ""}
      {meas.delta("weightKg")!.toFixed(1)} кг
    </span>
  )
}
```

4 виклики `meas.delta("weightKg")` плюс 3 non-null `!` assertion-и для одного значення. Той же patern на L360–L372 для `bodyFatPct`. Кожен виклик ре-обчислює `Number(latest?.[field])` та `Number(prev?.[field])` — micro-overhead, але показниковий.

**Why it matters.**
Не критично, але це знакова "code smell" для review-checklist-у. Якщо колись `delta` стане expensive (наприклад, normalize-кваліфікатор), регресія тут невидима.

**Recommendation.**

```tsx
const weightDelta = meas.delta("weightKg");
// ...
sublabel={
  weightDelta == null ? "Немає порівняння" : (
    <span className={cn(..., weightDelta > 0 ? "text-warning" : "text-success")}>
      {weightDelta > 0 ? "+" : ""}{weightDelta.toFixed(1)} кг
    </span>
  )
}
```

---

### F20 — Progress page близько до Hard Rule #18 (591 / 600 LOC) [severity: medium] [perspective: rule]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L1–L591

**Description.**
591 LOC — за 9 рядків від `max-lines: 600` Hard Rule #18 ([active initiative](../governance/rules/18-module-size-discipline-600.md)). Один компонент `Progress` робить:

1. Header + quickStats (header strip, L235–L258).
2. Weekly volume chart wrapper.
3. Cross-module pushup activity card (L277–L319).
4. Weight + fat stat-cards + trend charts (L322–L408).
5. Wellbeing chart (L411–L417).
6. Muscle volume bars (L421–L453).
7. PR Board with group filter (L455–L587 — третина файлу в одному IIFE).

**Why it matters.**
Будь-який bugfix на одній з 7 секцій тепер вимагає скролити крізь весь файл. Hard Rule #18 спеціально для цього. Активна ініціатива з burn-down.

**Recommendation.**
Витягти у `Progress/` директорію:

- `Progress/QuickStatsHeader.tsx`
- `Progress/PushupActivityCard.tsx`
- `Progress/WeightFatCards.tsx`
- `Progress/MuscleVolumeBars.tsx`
- `Progress/PrBoard.tsx`

Як це вже зроблено для `Body/` (4 sub-компоненти).

---

### F21 — Body page близько до 600 LOC порога; рендер-функція ~280 LOC [severity: medium] [perspective: rule]

**Page:** `Body`
**File:** `apps/web/src/modules/fizruk/pages/Body.tsx`
**Lines:** L1–L514

**Description.**
514 LOC. Один компонент:

1. Header (L239–L272).
2. Form з 4 sub-полями (L274–L434).
3. RecoveryFocusCard.
4. 4 collapsible trend cards (data-driven array L438–L502).
5. Журнал (через `JournalSection`).

Sub-компоненти витягнуті (good), але render-функція компонент-а самого все ще ~280 LOC.

**Why it matters.**
Less urgent ніж Progress, але тренд негативний.

**Recommendation.**
Витягти `BodyEntryForm` як окремий компонент (state-encapsulation з `useApiForm` всередині нього). Поточний `Body.tsx` зведеться до ~200 LOC.

---

### F22 — `MiniLineChart` має той самий `aria-label="Графік тренду"` для всіх інстансів [severity: medium] [perspective: a11y]

**Page:** consumed by `Progress`, `Body`
**File:** `apps/web/src/modules/fizruk/components/MiniLineChart.tsx`
**Lines:** L142

**Description.**

```tsx
<svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Графік тренду">
```

Static aria-label. На Body page 4 чарти підряд — screen-reader зачитує "Графік тренду", "Графік тренду", "Графік тренду", "Графік тренду". Нерозрізнимо.

**Why it matters.**
WCAG 1.1.1 — alternative text має бути descriptive.

**Recommendation.**
Прийняти `ariaLabel` prop (як уже зроблено для `CollapsibleTrendCard`) і прокинути в SVG — `aria-label={\`Графік тренду: \${metricLabel}, остання точка \${lastValid.value} \${unit}\`}`.

---

### F23 — `MiniLineChart` axis-text `fontSize="9"` нижче 10px floor [severity: medium] [perspective: rule]

**Page:** consumed by `Progress`, `Body`
**File:** `apps/web/src/modules/fizruk/components/MiniLineChart.tsx`
**Lines:** L167, L210

**Description.**
SVG `<text fontSize="9">` — 9px. Hard Rule #16 floor — 10px для chart axis ticks (sole-exception). 9px знятий з token-scale (Rule #16: "`text-3xs` (9px) was retired").

**Why it matters.**
Rule #16 явно retired 9px. Цей фолбек обходить guard через SVG attribute (не className), але дух правила порушений. На high-DPI mobile (320px ширина) 9px text стає нечитабельний.

**Recommendation.**
`fontSize="10"`. Лінт-правило для SVG (`sergeant-design/svg-min-fontsize`) ще не існує — кандидат на новий ESLint rule.

---

### F24 — `JournalEntryCard` пише per-entry-id key у localStorage, без cleanup на delete [severity: medium] [perspective: bug]

**Page:** `Body` (sub: `Body/JournalEntryCard.tsx`, `Body/storage.ts`)
**File:** `apps/web/src/modules/fizruk/pages/Body/JournalEntryCard.tsx`
**Lines:** L17, L23–L29

**Description.**

```ts
const storageKey = JOURNAL_ENTRY_OPEN_PREFIX + entry.id;
// → "fizruk:body:journal-entry-open:dl_xxxx"
```

При кожному toggle `writePersistedOpen` зберігає `"1"`/`"0"` під цей ключ. Коли entry видаляється (`handleDeleteJournalEntry` у `Body.tsx`), localStorage-ключ **не cleanup-иться**. Через місяці юзер накопичує сотні orphan-ключів.

**Why it matters.**
LocalStorage budget ~5MB. На mobile (Capacitor) це shared з усіма іншими модулями. Slow degradation, але реальна. Також — `safeReadStringLS` синхронний → page-render блокується через все більший LS index.

**Recommendation.**

```ts
// в Body.tsx handleDeleteJournalEntry:
safeRemoveLS(JOURNAL_ENTRY_OPEN_PREFIX + id);
deleteEntry(id);
```

Або раз на boot сканувати ключі з префіксом і чистити сироти.

---

### F25 — `Body/trendUtils.ts` використовує non-null `!` всупереч Hard Rule #19 [severity: medium] [perspective: ts]

**Page:** `Body` (sub: `Body/trendUtils.ts`)
**File:** `apps/web/src/modules/fizruk/pages/Body/trendUtils.ts`
**Lines:** L5, L15

**Description.**

```ts
export function lastValidValue<T extends { value: number | null }>(
  data: readonly T[],
): number | null {
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i]!.value; // ❌ non-null assertion
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
```

`data[i]` з `noUncheckedIndexedAccess: true` повертає `T | undefined`. `!` стирає сигнал TS. Якщо `data.length` зміниться між input і loop (concurrent mutation іншим компонентом-споживачем readonly-array — малоймовірно, але) — `undefined.value` крашне.

**Why it matters.**
Hard Rule #19 — `active-initiative` (allowlisted but counted). Кожний `!` має бути виправданим.

**Recommendation.**

```ts
for (let i = data.length - 1; i >= 0; i--) {
  const point = data[i];
  if (!point) continue;
  const v = point.value;
  ...
}
```

Або `for (const point of [...data].reverse())`.

---

### F26 — `MEASURE_FIELDS` typed loose; `MeasurementEntry` index signature пропускає stray keys [severity: medium] [perspective: ts]

**Page:** `Measurements`
**File:** `apps/web/src/modules/fizruk/hooks/useMeasurements.ts`
**Lines:** L27–L52

**Description.**

```ts
export interface MeasurementEntry {
  id: string;
  at: string;
  [field: string]: number | string | undefined;
}
```

Хоча існує `MeasurementFieldId` union, `MeasurementEntry` все ще index-signature. Користувач (Measurements.tsx) працює з `e[f.id]` де `f.id` — `string`. `noUncheckedIndexedAccess` returns `number | string | undefined`. Якщо хтось випадково запише entry з полем `"weight"` (без `Kg`) — TS не зафіксує.

**Why it matters.**
Type drift — два surface-и (Body uses `weightKg: number | null` strict; Measurements uses index-signature) для **тієї ж самої** ваги. Saving entry through Measurements хоче `weightKg`, але немає constraint, що це той самий ключ. Domain invariant зламаний на типи-рівні.

**Recommendation.**

```ts
export interface MeasurementEntry {
  id: string;
  at: string;
  weightKg?: number;
  bodyFatPct?: number;
  neckCm?: number;
  // ... explicit 14 fields, no index signature
}
```

Або `type MeasurementEntry = { id: string; at: string } & Partial<Record<MeasurementFieldId, number>>;`.

---

### F27 — JournalEntryCard 2-digit year ambiguous [severity: medium] [perspective: a11y]

**Page:** `Body` (sub)
**File:** `apps/web/src/modules/fizruk/pages/Body/JournalEntryCard.tsx`
**Lines:** L31–L36

**Description.**

```ts
const dateLabel = new Date(entry.at).toLocaleDateString("uk-UA", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "2-digit",
});
```

Year `"2-digit"` → "Пн, 13 трав 26". Screen-reader зачитає "twenty-six". Українською = "двадцять шостого" — ambiguous-26.

**Why it matters.**
WCAG 3.1.4 — abbreviations should be expandable. Для users, які скажуть, "це 1926 чи 2026?". І для history-журналу де 2025 vs 2026 щодо ваги critical.

**Recommendation.**
`year: "numeric"` (full year) — coast: +2 chars per entry, але clear.

---

### F28 — CollapsibleTrendCard / JournalSection не слухають `storage` events між табами [severity: medium] [perspective: bug]

**Page:** `Body` (sub)
**Files:** `apps/web/src/modules/fizruk/pages/Body/CollapsibleTrendCard.tsx`, `apps/web/src/modules/fizruk/pages/Body/JournalSection.tsx`
**Lines:** CollapsibleTrendCard L26, JournalSection L22

**Description.**
`useState<boolean>(() => readTrendOpen(storageKey))` читається тільки на mount. Якщо юзер відкрив Body у двох табах, toggle-нув у табі A → tab B залишається з stale state. localStorage `storage` event не привʼязаний.

**Why it matters.**
Не data-loss, але UX-inconsistency на PWA standalone-window + browser-tab.

**Recommendation.**

```ts
useEffect(() => {
  const onStorage = (e: StorageEvent) => {
    if (e.key === TREND_STORAGE_PREFIX + storageKey) {
      setOpen(e.newValue === "1");
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}, [storageKey]);
```

---

### F29 — Body page: dual source-of-truth для "вага" [severity: medium] [perspective: bug]

**Page:** `Body` + `Measurements`
**Files:** `apps/web/src/modules/fizruk/hooks/useDailyLog.ts` L86–L88, `apps/web/src/modules/fizruk/hooks/useMeasurements.ts` (no biometrics mirror)
**Lines:** see referenced

**Description.**
`useDailyLog.addEntry` дзеркалить `weightKg` у Profile biometrics (LWW write-on-newer). `useMeasurements.addEntry` дзеркалить тільки у `triggerFizrukDualWrite` (SQLite mirror) — **не** дзеркалить у biometrics. Якщо юзер додав weight через Measurements, Nutrition's "Поточна вага" та Profile **не оновляться**. Якщо потім через Body — оновиться. Інконсистентна канонічність для тієї самої метрики.

**Why it matters.**
Domain invariant violation у живій формі — "single canonical weight" фікція. Особливо неприємно, бо Measurements має `weightKg` як перше поле (L38), а Body має його ж як перше — і поведінка різна.

**Recommendation.**
У `useMeasurements.addEntry` (після персисту):

```ts
if (typeof entry.weightKg === "number") {
  mirrorWeightToBiometrics(entry.weightKg, e.at);
}
```

Або consolidate weight-data у єдиний канал — Body daily-log є primary, а Measurements не приймає `weightKg`/`bodyFatPct` (тільки обхвати). Це redesign-question — викинути в окремий ADR.

---

### F30 — `weightTrend` / `fatTrend` у Progress використовують `localeCompare` для дат [severity: medium] [perspective: bug]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L57, L71

**Description.**

```ts
[...(entries || [])].sort((a, b) => a.at.localeCompare(b.at)).slice(-8);
```

`entries[i].at` — ISO-8601 string. `localeCompare` працює, але не оптимальний для ISO. На теорії — `"2026-05-13T10:00:00Z".localeCompare("2026-05-13T11:00:00Z")` == `<0`. Practical bug-risk низький, але `Date.parse()` був би clearer + faster.

**Why it matters.**
Не критично. Code-smell.

**Recommendation.**
`.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))`.

---

### F31 — Programs `BUILTIN_PROGRAMS` не покрита тестом на schedule↔sessions integrity [severity: medium] [perspective: test]

**Page:** `Programs` (domain dep)
**File:** `packages/fizruk-domain/src/lib/trainingPrograms.ts` (source) ↔ `Programs.tsx` (consumer)
**Lines:** Programs.tsx L66–L70, L142–L146

**Description.**
F6 описав, що `prog.sessions[todaySession.sessionKey]` може дати `undefined`. У домені немає тесту, що для кожного `prog ∈ BUILTIN_PROGRAMS` і кожного `entry ∈ prog.schedule`, `prog.sessions[entry.sessionKey]` defined. Це integrity invariant, який легко авторити на boot.

**Recommendation.**
`packages/fizruk-domain/src/lib/trainingPrograms.test.ts`:

```ts
it.each(BUILTIN_PROGRAMS)(
  "%s: schedule keys all present in sessions",
  (prog) => {
    for (const e of prog.schedule) {
      expect(prog.sessions[e.sessionKey]).toBeDefined();
    }
  },
);
```

---

### F32 — Progress `quickStats` залежить від `prs.length` замість `prs` [severity: low] [perspective: perf]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L200

**Description.**

```ts
}, [workouts, prs.length]);
```

Це working-as-intended — депенденсі на `prs.length` дає stable identity. Але якщо `prs` array identity змінилася (тому що `useMemo` ре-ран на новому `workouts`), а `prs.length` той самий — `quickStats` НЕ ре-ран, що добре. Однак `eslint-plugin-react-hooks` зазвичай скаржиться на нестандартні dep-и.

**Recommendation.**
Або сприйняти ESLint warning, або memo окремий `prsCount`:

```ts
const prsCount = prs.length;
const quickStats = useMemo(() => {...}, [workouts, prsCount]);
```

---

### F33 — Body submit-button: success-state has same bg-class as default [severity: low] [perspective: bug]

**Page:** `Body`
**File:** `apps/web/src/modules/fizruk/pages/Body.tsx`
**Lines:** L420–L432

**Description.**

```tsx
className={cn(
  "focus-ring w-full py-3 rounded-xl text-style-label transition-[background-color,box-shadow,opacity,transform]",
  submitSuccess
    ? "bg-success-strong text-white"
    : "bg-success-strong text-white active:scale-[0.98]",
  isSubmitting && "opacity-60",
)}
```

Both branches set `bg-success-strong text-white` — different only by `active:scale-[0.98]`. Confusing ternary — `submitSuccess` визуально позначається тільки текстом "Записано ✓". На code-review здається, що автор хотів іншу палітру для success, забув.

**Recommendation.**

```tsx
className={cn("focus-ring ... bg-success-strong text-white", !submitSuccess && "active:scale-[0.98]", isSubmitting && "opacity-60")}
```

Або справді ввести success-color (наприклад `bg-success` плюс checkmark-shimmer).

---

### F34 — Body submit-success "Записано ✓" — emoji-checkmark без screen-reader announce [severity: low] [perspective: a11y]

**Page:** `Body`
**File:** `apps/web/src/modules/fizruk/pages/Body.tsx`
**Lines:** L431

**Description.**

```tsx
{
  submitSuccess ? "Записано ✓" : "Записати";
}
```

Текст у кнопці змінюється, але screen-reader без `aria-live` не зачитує цей перехід. Юзер не дізнається, що submit пройшов.

**Recommendation.**

```tsx
<span aria-live="polite">{submitSuccess ? "Записано" : ""}</span>
<button>{submitSuccess ? "Записано ✓" : "Записати"}</button>
```

---

### F35 — Progress chart-секції без `prefers-reduced-motion` opt-out [severity: low] [perspective: ux]

**Page:** `Progress`, `Body`
**Files:** `Progress.tsx`, `Body/CollapsibleTrendCard.tsx`, `Body/JournalSection.tsx`
**Lines:** Progress various; CollapsibleTrendCard L82; JournalSection L57

**Description.**
`transition-transform` на rotate-chevron і `transition-colors`/`transition-[…]` на кнопках. Animation budget (Hard Rule #17 — max 2 concurrent, 3 tiers) не вимагає reduced-motion explicit, але best-practice — `motion-safe:transition-transform`.

**Recommendation.**

```tsx
className={cn("motion-safe:transition-transform", open ? "rotate-180" : "rotate-0")}
```

---

### F36 — Progress page muscle-volume bars: `Math.max(6, ...)` magic number [severity: low] [perspective: code-quality]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L444–L446

**Description.**

```tsx
style={{ width: `${Math.max(6, (m.value / weeklyByMuscle.max) * 100)}%` }}
```

Magic `6` — мінімум 6% ширини, щоб найменший bar був видимий. Не задокументовано.

**Recommendation.**

```ts
const MIN_BAR_WIDTH_PCT = 6;
// + comment: "ensures smallest bar remains visible / tap-able"
```

---

### F37 — Progress quote "Останнє: 13 трав · N PR" не plural-aware [severity: low] [perspective: i18n]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L240, L246, L248, L253

**Description.**

```tsx
`Останнє: ${quickStats.latestWorkoutAt} · ${quickStats.prsCount} PR`;
```

"1 PR" / "2 PR" / "5 PR" — без правильного українського pluralization. У PR-count "Рекорди (PR) · {prs.length}" — таж сама проблема (L473).

**Recommendation.**
Використати `Intl.PluralRules` або `messages.fizruk.pr.count(prsCount)` функцію:

```ts
function prLabel(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} рекорд`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20))
    return `${n} рекорди`;
  return `${n} рекордів`;
}
```

Так само для "Заміри" (L252).

---

### F38 — Measurements у "Останній замір" відображає всі 14 полів, включно з порожніми [severity: low] [perspective: ux]

**Page:** `Measurements`
**File:** `apps/web/src/modules/fizruk/pages/Measurements.tsx`
**Lines:** L198–L226

**Description.**
Цикл по `MEASURE_FIELDS` показує всі 14 полів навіть якщо у `latest` заповнено лише `weightKg` + `waistCm`. Решта 12 показуються як "—". Шум.

**Recommendation.**
Фільтрувати: `MEASURE_FIELDS.filter((f) => latest[f.id] != null && latest[f.id] !== "")`. Або згрупувати "—" поля під "Інше" з click-to-expand.

---

### F39 — Progress emoji icons без `role="img"` / `aria-label` [severity: low] [perspective: a11y]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L283, L468

**Description.**
`<div className="...">💪</div>` (L283) — flexed-biceps emoji як icon без `role="img"`. Screen reader: "flexed biceps emoji". Те саме для `🥇🥈🥉` (L468 — MEDALS-array).

**Recommendation.**

```tsx
<div role="img" aria-label="Відтискання">💪</div>
<span role="img" aria-label={`Ранг ${globalRank + 1}`}>{MEDALS[globalRank]}</span>
```

---

### F40 — Programs ProgramDetails: vague placeholder `"Вправи з програми відсутні в каталозі — додайте вправи з відповідними ID вручну"` [severity: low] [perspective: ux]

**Page:** `Programs`
**File:** `apps/web/src/modules/fizruk/pages/Programs.tsx`
**Lines:** L247–L251

**Description.**
Якщо `BUILTIN_PROGRAMS` має sessionKey, що містить exerciseIds, які відсутні в каталозі (data drift або dual-track-deletion), користувачу пропонується "додати вправи з відповідними ID вручну" — без розкриття ID і без CTA.

**Recommendation.**
Або показати missing IDs (`session.exerciseIds.filter(id => !exercises.find(...)).join(", ")`), або інкапсулювати у дев-only debug-mode.

---

### F41 — Lifecycle marker (Hard Rule #10) — None of the page files explicitly declare `@scaffolded`/`@deprecated` tags [severity: low] [perspective: lifecycle]

**Pages:** all 4 + Body/ subdir
**Files:** as above
**Lines:** _(missing)_

**Description.**
За Rule #10 default `Active` коли тег відсутній, тому це не violation. Але оскільки модуль активно мігрує (dual-write pipeline, SQLite-mirror), деякі secondary шляхи (наприклад, чисто-LS journal у `useDailyLog`) — кандидати на `@deprecated` marker з expiry, щоб слідкувати burn-down.

**Recommendation.**
Якщо `useDailyLog` мігрує на server-side, додати JSDoc `@deprecated AI-LEGACY: expires 2026-08-13 — migrate to backend dailyLog endpoint`.

---

### F42 — Programs: import `Button` used лише 1 раз з 5 кнопок [severity: low] [perspective: code-quality]

**Page:** `Programs`
**File:** `apps/web/src/modules/fizruk/pages/Programs.tsx`
**Lines:** L3, L54, L130–L174

**Description.**
Inconsistent — header "Зупинити" через `<Button variant="secondary">`, решта raw `<button>`. Це duplication of focus-ring + min-h-[44px] логіки, яка в Button інкапсульована.

**Recommendation.**
Замінити всі raw кнопки на `<Button>` з відповідними варіантами. Окремий PR (із F11).

---

### F43 — Programs `Стайл` mixing: success accent у fizruk-module subtree (Rule #12 boundary) [severity: low] [perspective: tailwind]

**Page:** `Programs`
**File:** `apps/web/src/modules/fizruk/pages/Programs.tsx`
**Lines:** L116, L131, L215

**Description.**

```tsx
"bg-success-strong text-white"  // Програми L131, L116
<span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-fizruk/10 text-success border border-success/20">
```

Hard Rule #12 — module-accent containment — означає не використовувати foreign accents. `success` — semantic token (не foreign), але змішування `bg-fizruk/10 + text-success + border-success/20` в одному badge — кольоровий мікс. Це не порушує lint-rule напряму (success дозволений), але візуально conflicts.

**Recommendation.**
Або уніфікувати на `fizruk-strong` (брендовий зелений), або на `success-strong`. Не змішувати в одному badge `fizruk/10 + success`.

---

### F44 — Progress group filter pills: `aria-pressed` відсутній [severity: low] [perspective: a11y]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L484–L511

**Description.**
Toggle-кнопки, які активуються/деактивуються (між "all" і "chest"). За ARIA-pattern — `aria-pressed={prFilter === g}`. У ScoreButton (Body) це правильно (`aria-pressed={selected}`).

**Recommendation.**

```tsx
<button aria-pressed={prFilter === "all"} ...>Всі</button>
<button aria-pressed={prFilter === g} ...>{musclesUk[g] || g}</button>
```

---

### F45 — Measurements input-и: maxLength не задано, можна ввести довжину 100+ символів [severity: low] [perspective: security]

**Page:** `Measurements`
**File:** `apps/web/src/modules/fizruk/pages/Measurements.tsx`
**Lines:** L147–L158

**Description.**

```tsx
<input className={inp} inputMode="decimal" placeholder="—" value={form[f.id] ?? ""} onChange={...} />
```

Жодного `maxLength`, `min`, `max`, `step`. Можна вставити arbitrary text. NaN guards downstream — але user-experience збіває з пантелику.

**Recommendation.**

```tsx
<input ... type="number" min={f.min} max={f.max} step="0.1" maxLength={6} />
```

Native browser validation + zod runtime (F3).

---

### F46 — Body form keyboard / а11y: `aria-busy` під час submit не виставляється [severity: low] [perspective: a11y]

**Page:** `Body`
**File:** `apps/web/src/modules/fizruk/pages/Body.tsx`
**Lines:** L278

**Description.**
`<form onSubmit={submit} noValidate>` — на час `isSubmitting` `<input disabled>` робиться (L291, L319), але form-level `aria-busy` немає. Для screen-reader-юзерів, які ввели note і чекають submit — нема SR-індикації.

**Recommendation.**
`<form aria-busy={isSubmitting} onSubmit={submit} noValidate>`

---

### F47 — Measurements wikihow.com link — external link warning відсутній [severity: low] [perspective: security]

**Page:** `Measurements`
**File:** `apps/web/src/modules/fizruk/pages/Measurements.tsx`
**Lines:** L72–L101

**Description.**

```tsx
<a href="https://www.wikihow.com/Take-Body-Measurements" target="_blank" rel="noreferrer">
```

Зовнішнє посилання без візуального external-link icon і без `aria-label` "відкриється у новому вікні". Користувач не очікує контекст-switch.

**Recommendation.**

```tsx
<a href="..." target="_blank" rel="noopener noreferrer"
   aria-label="Як правильно робити заміри · wikihow.com · відкриється у новому вікні">
  {...}
  <ExternalLinkIcon className="w-3 h-3 inline-block ml-1" aria-hidden />
</a>
```

(also: `rel="noopener noreferrer"` — best-practice explicit, though `noreferrer` implies `noopener` in modern browsers.)

---

### F48 — Body file 18-line JSDoc-comment block в L20–L39 описує діффи а не код [severity: low] [perspective: code-quality]

**Page:** `Body`
**File:** `apps/web/src/modules/fizruk/pages/Body.tsx`
**Lines:** L20–L39

**Description.**

```ts
/**
 * Trend cards on this page used to be always-expanded, which meant four
 * ~180px-tall charts stacked one after another — on mobile Safari that
 * pushed the useful summary + input form far off-screen. The user asked
 * for them to be collapsible, so each chart card is now wrapped in
 * `CollapsibleTrendCard`:
 *  ...
 */
```

`apps/web/AGENTS.md` (root + `Code Comments`) — "Comments must describe code in general, NOT the bug you're fixing or the previous behavior". Цей блок розповідає історію PR.

**Recommendation.**
Видалити блок або переписати:

```ts
/** Body page — Fizruk daily-log entry form + 4 collapsible trend cards + journal section. */
```

Історичні мотиви — у PR description / changelog.

---

### F49 — Progress comment-block L223–L227 про backup/CSV — orphan коментар [severity: low] [perspective: code-quality]

**Page:** `Progress`
**File:** `apps/web/src/modules/fizruk/pages/Progress.tsx`
**Lines:** L223–L227

**Description.**

```ts
// Backup / CSV / "Скинути всі дані" controls used to live in this
// page's "Дані" card. They were duplicated by the hub-wide Settings
// screen (single source of truth for cross-module backup), so the
// page now focuses on analytics only — the user explicitly flagged
// the duplicated buttons as confusing on round-12.
```

Same issue as F48 — diff-history in comment.

**Recommendation.**
Видалити; історія — у PR опис.

---

### F50 — Body / Progress: emoji-text у chart `metricLabel` користувача [severity: low] [perspective: i18n]

**Page:** `Progress`, `Body`
**Files:** Progress L390, L405; Body L447, L456, L465, L474
**Lines:** as above

**Description.**

```tsx
metricLabel = "вагу тіла"; // accusative case
metricLabel = "вагу"; // Body uses just "вагу"
```

Inconsistent casing/case Body vs Progress. Some accusative, some nominative ("сон"). Coverage gap у l10n / strings library.

**Recommendation.**
Винести у `messages.fizruk.charts.weightAccusative` (та аналогічно для решти) — single source of truth.

---

## Per-page coverage matrix

| Page                        | sec | a11y | perf | ux  | bug | rule | ts  | tw  | i18n | test | ai  | lifecycle |
| --------------------------- | --- | ---- | ---- | --- | --- | ---- | --- | --- | ---- | ---- | --- | --------- |
| `Progress`                  | X   | 4    | 1    | 1   | 2   | 1    | X   | 1   | 1    | 1    | X   | X         |
| `Measurements`              | 2   | 3    | X    | 1   | 1   | X    | 1   | X   | X    | 1\*  | X   | X         |
| `Programs`                  | X   | 3    | X    | 1   | 2   | 2    | X   | 1   | X    | 1    | X   | X         |
| `Body`                      | X   | 3    | X    | X   | 2   | 1    | X   | 1   | 1    | 1\*  | X   | 1         |
| `Body/CollapsibleTrendCard` | X   | X    | X    | X   | 1   | X    | X   | X   | X    | 1\*  | X   | X         |
| `Body/JournalEntryCard`     | X   | 1    | X    | X   | 1   | X    | X   | X   | X    | 1\*  | X   | X         |
| `Body/JournalSection`       | X   | X    | X    | X   | 1   | X    | X   | X   | X    | 1\*  | X   | X         |
| `Body/ScoreButton`          | X   | 1    | X    | X   | X   | X    | X   | X   | X    | X    | X   | X         |
| `Body/storage.ts`           | X   | X    | X    | X   | 1   | X    | X   | X   | X    | X    | X   | X         |
| `Body/trendUtils.ts`        | X   | X    | X    | X   | X   | X    | 1   | X   | X    | X    | X   | X         |

> `X` = перспектива перевірена, findings немає. Число = кількість findings цієї перспективи на сторінці (агреговано вище у F1–F50). `1*` — same finding F5 (zero unit tests) розповсюджується на всі page-файли; рахується один раз у Progress, у решті позначено зірочкою для повноти. `lifecycle` для Body — F41 (рекомендація додати AI-LEGACY marker для `useDailyLog` migration).
