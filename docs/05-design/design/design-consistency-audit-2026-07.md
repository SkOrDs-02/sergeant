# Design-consistency audit (2026-07)

> **Last touched:** 2026-07-26 by @it+v0agent. **Next review:** 2026-10-24.
> **Status:** Active (in progress) — safe fixes landed, structural items pending decision.

> **Аудиторія:** дизайн-система maintainers, ревʼюери design-token PR-ів.
> **Ціль:** зафіксувати результати повторної перевірки аудиту попередньої
> сесії, розділити знахідки на **виправлені** та **відкладені (потребують
> продуктового рішення)**, і не втратити trace, коли зʼясувалося, що частина
> тверджень попереднього аудиту була неточною.

Цей документ — **живий audit trail**, не контракт. Канонічні контракти —
[`design-system.md`](./design-system.md) і [`radius-rhythm.md`](./radius-rhythm.md).
Коли всі пункти закриються — документ переїде в [`archive/`](./archive/README.md).

---

## Метод

Кожне твердження попереднього аудиту звірене з реальним кодом (`grep` по
call-site-ах + читання `packages/design-tokens/tailwind-preset.js`,
`tokens.js` і компонентів). Нижче — тільки перевірені факти, з нотатками
там, де реальність відрізнялася від початкового аудиту.

---

## Частина 1 — Виправлено в цій сесії (safe / механічні)

Жоден із цих пунктів не змінює продуктову поведінку — це прибирання
міграційних артефактів після stone-/teal-ребренду. `tsc --noEmit` чистий;
38 контракт-тестів `Button`/`SectionHeading` зелені; `design:check-md` OK.

### A. `CelebrationModal.tsx` — cross-temperature градієнт у `default`

`MODULE_GRADIENTS.default` був `from-brand-500/20 to-emerald-500/10`. Після
stone-ребренду `brand-500` — це **сірий** stone, тож пара читалась як
grey→green (різнотемпературний градієнт, порушує color-guideline). Решта
рядків — однорідні (teal→teal, coral→orange).

- **Fix:** нормалізовано до `from-teal-500/20 to-teal-400/10` (однорідна
  teal-пара, як у сусідніх рядків).

### B. `SectionHeading.tsx` — застарілий коментар бреше про токен

Коментар над варіантом `accent` стверджував «`text-brand-strong`
(= emerald-700), clears 5.23:1». Реально `brand.strong` = **stone-800**
(`#292524`) після design-audit M1. Код правильний — брехав лише коментар.

- **Fix:** коментар оновлено на актуальний stone-800 / hub-ink опис.

### C. `AppLock.tsx` — ad-hoc `z-[200]`

Оверлей використовував сирий `z-[200]`, порушуючи власне правило «ніколи
ad-hoc z-index». `zTier.modal` === `200`, тож заміна 1:1.

- **Fix:** `z-[200]` → `z-modal` (семантичний тир).

### D. `shadow-glow` + `focus-ring` fallback — orphan emerald

`boxShadow.glow` був захардкоджений `rgba(16, 185, 129, …)` (emerald), хоча
shell більше не emerald. `focus-ring` fallback — той самий orphan emerald.

- **Fix:** `glow` тепер тягне `var(--focus-ring-color, …)` (tracks активний
  акцент/тему), fallback обох приведено до teal.
- **Не чіпав:** `pulse-ok` (`rgba(16,185,129)`) — це семантичний
  **success/OK** статус, де зелений доречний; це не hub-identity.

---

## Частина 2 — Відкладено (потребує рішення; НЕ чіпав)

### E. Дубльована radius-шкала в token-preset

У preset паралельно живуть іменовані `CONTROL/CARD/HERO` (12/16/24 px) і v2
`r-lg`/`r-xl`/`r-2xl` (14/18/24 px). `r-2xl` (24) дублює HERO; значення
14/18 не мають семантичного слота. Це прямо суперечить канонічному рішенню в
[`radius-rhythm.md`](./radius-rhythm.md) («шару семантичних аліасів немає,
іменувати треба на рівні компонента»).

- **Питання до рішення:** прибрати іменований/v2-шар і лишити тільки
  Tailwind-примітиви (`rounded-sm/md/xl/2xl/3xl`), як велить radius-rhythm?
  Це зачепить ~12 v2 call-site-ів.

### F. Enforcement radius — **аудит попередньої сесії тут помилявся**

Попередній аудит стверджував, що правило radius «existed only as prose,
not enforced», і рахував «63/66 порушень». Перевірка:

- Правило `sergeant-design/no-rounded-lg` **реально існує** і ввімкнене як
  **`"error"`** у `eslint.web.js:162` (для packages — `off`).
- «66» — це `rounded-lg` **+ `rounded-md`** разом. `rounded-md` — легітимний
  **Marker tier**, не порушення.
- Реальних `rounded-lg` поза винятками (tokens / `index.css` / тести) — **21**,
  і серед них DesignShowcase/UiAuditPage-демо (самі демонструють правило) та
  задокументовані `eslint-disable` з посиланням на `docs/tech-debt/frontend.md`.
- **Розбіжність у доках:** `radius-rhythm.md` § «Як це enforce-иться» досі
  каже «Lint-правила поки немає» — застаріло, правило вже є. Maturity-matrix
  у [`design/README.md`](./README.md) вже коректно згадує `no-rounded-lg`.

- **Питання до рішення:** (1) оновити `radius-rhythm.md`, прибравши хибний
  «lint поки немає» абзац; (2) чи проганяти залишкові справжні `rounded-lg`
  борг-рядки (реально одиниці), чи лишити задокументовані disable-и.

### G. Неортогональний `Button` — 15 злитих варіантів

`ButtonVariant` кодує роль+емфазу в одному рядку (`finyk`, `finyk-soft`,
`primary-ink`, …), плюс дубль-механізм через `module` prop. `Badge` вже
ортогональний (`variant × tone`); `Card` вже має orthogonal-модель
(`module` × `prominence`) з legacy-мапінгом.

- **Питання до рішення:** перевести `Button` на `variant × tone` з
  legacy-варіантами як deprecated-аліасами? Це API-зміна з широким blast
  radius (усі call-site-и Button) — саме тому відкладено на обговорення.

### H. Канонічний шар + міграційний борг у документації

`design-system.md` не називає явно, який із трьох редизайн-шарів
канонічний; бріф попередньої сесії згадував неіснуючий `modules/strategy/`.
`CardVariant` deprecated з `@removeBy 2026-09-01` (дата близько).

- **Питання до рішення:** додати розділ «Canonical layer» + таблицю
  deprecation з `@removeBy`; вирішити долю `CardVariant` до дедлайну.

---

## Зведення

| #   | Пункт                                | Стан               | Blast radius          |
| --- | ------------------------------------ | ------------------ | --------------------- |
| A   | Celebration grey→green градієнт      | ✅ Fixed           | 1 рядок               |
| B   | SectionHeading застарілий коментар   | ✅ Fixed           | коментар              |
| C   | AppLock ad-hoc `z-[200]`             | ✅ Fixed           | 1 рядок               |
| D   | orphan emerald `glow`/`focus-ring`   | ✅ Fixed           | 2 токени              |
| E   | Дубльована radius-шкала              | ⏸ Pending decision | ~12 call-sites        |
| F   | Radius enforcement (аудит помилявся) | ⏸ Docs-fix pending | doc + одиниці         |
| G   | Button не ортогональний              | ⏸ Pending decision | усі Button call-sites |
| H   | Канонічний шар / deprecation-борг    | ⏸ Pending decision | docs + Card           |
