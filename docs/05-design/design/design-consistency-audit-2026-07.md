# Design-consistency audit (2026-07)

> **Last touched:** 2026-07-26 by @it+v0agent. **Next review:** 2027-02-27.
> **Status:** Resolved — all findings fixed (A–I) or dismissed (H). Button orthogonality (G) landed with byte-identical legacy aliases.

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

## Частина 1b — Виправлено в цій сесії (structural, узгоджено з власником)

### E. Дубльована radius-шкала — **консолідовано**

У preset паралельно жили іменовані `CONTROL/CARD/HERO` (12/16/24 px) і v2
`r-md`/`r-lg`/`r-xl`/`r-2xl` (12/14/18/24 px). `r-md`=CONTROL і `r-2xl`=HERO
дублювали ритм точно; `r-lg`/`r-xl` (14/18) — off-rhythm значення без слота.
Додатковий латентний баг: кастомні ключі робили класи `rounded-r-*`, які
**затіняли нативні Tailwind per-corner** утиліти `rounded-r-{size}`.

- **Fix:** v2-namespace видалено з `tailwind-preset.js` і `Card`
  (`CardRadius` = `md | lg | xl`). Усі ~30 call-site-ів (14 className +
  16 `radius="r-*"` пропів + `glass`-дефолт) зведено на канонічну шкалу:
  `r-md→rounded-xl`, `r-lg`/`r-xl→rounded-2xl` (CARD), `r-2xl→rounded-3xl`
  (HERO). Візуальні дельти ≤2px (14→16, 18→16), решта — точні збіги.

### F. Enforcement radius — **аудит попередньої сесії тут помилявся + docs-fix**

Попередній аудит стверджував, що правило radius «existed only as prose,
not enforced», і рахував «63/66 порушень». Перевірка:

- Правило `sergeant-design/no-rounded-lg` **реально існує** і ввімкнене як
  **`"error"`** у `eslint.web.js:162` (для packages — `off`).
- «66» — це `rounded-lg` **+ `rounded-md`** разом. `rounded-md` — легітимний
  **Marker tier**, не порушення.
- Реальних `rounded-lg` поза винятками (tokens / `index.css` / тести) — **21**,
  переважно DesignShowcase/UiAuditPage-демо (самі демонструють правило) та
  задокументовані `eslint-disable`.

- **Fix:** `radius-rhythm.md` § «Як це enforce-иться» переписано (правило вже
  є, «lint поки немає» видалено), правило 3 уточнено, застарілі `bg-brand-500`
  приклади → `bg-accent`, і додано історичну нотатку про видалення v2-шкали.

### I. Застарілий Card-тест — **новий, не з попереднього аудиту**

`Card.test.tsx` пінив `dark:shadow-glow-inset-emerald` для finyk-hero, але
код (після emerald→teal ребренду finyk-акценту) віддає `-teal`. Тест падав
**ще до цієї сесії** (перевірено `git stash`) — pre-existing rebrand-борг.

- **Fix:** ас��ерт оновлено на `dark:shadow-glow-inset-teal` (код був
  правильний, застарів лише тест).

### G. Неортогональний `Button` — **зроблено ортогональним**

`ButtonVariant` кодував роль+емфазу в одному рядку (`finyk`, `finyk-soft`,
`primary-ink`, …), плюс дубль-механізм через `module` prop — 15 злитих
варіантів. `Badge` (`variant × tone`) і `Card` (`module × prominence`) вже
ортогональні; `Button` випадав.

- **Fix:** додано канонічну ортогональну модель — `variant`
  (`ButtonEmphasis`: `solid|soft|outline|ghost`) × `tone` (`ButtonTone`:
  `neutral|finyk|fizruk|routine|nutrition|danger|success|ink`). Внутрішній
  `variants`-record (15 класів) лишився джерелом істини; новий
  `resolveStyleKey` збирає і канонічний, і легасі-шлях, і `module` prop в
  один style-key. Усі 15 flat-варіантів + `module` — deprecated-аліаси
  (`@removeBy 2026-12-01`) з **байт-ідентичним** виводом.
- **Гарантія безпеки:** 19 нових equivalence-тестів пінять, що кожен
  legacy-alias === його `(variant, tone)`-еквівалент (`toBe` на className).
  Тому всі 433 call-site у 148 файлах не потребують змін. Мігровано лише
  stories як довідковий приклад.

---

## Частина 2 — Відкладено (потребує рішення; НЕ чіпав)

_Немає активних пунктів — усі знахідки або виправлені, або зняті._

### H. Канонічний шар — **знято: канон уже оголо��ено**

Перевірка спростувала передумову аудиту. Канон **вже явно оголошено**:
`redesign-v2/README.md` (рядок 44) прямо каже — _«Канонічний контракт для
нового UI-коду — `design-system.md`»_, а v2-редизайн (glass / mesh /
ink-strong) — це **міграційний шар поверх нього**, не заміна. Тобто
stone/`ink` — і є поточна ідентичність; emerald/teal-згадки, які фіксились у
A–D та I, — це саме застарілі попередні версії.

- **Залишковий борг (не блокер):** `CardVariant` deprecated з
  `@removeBy 2026-09-01` — тримати в полі зору до дедлайну. Окремий розділ
  «Canonical layer» **не потрібен** — дублював би `redesign-v2/README.md`.

---

## Зведення

| #   | Пункт                               | Стан                 | Blast radius             |
| --- | ----------------------------------- | -------------------- | ------------------------ |
| A   | Celebration grey→green градієнт     | ✅ Fixed             | 1 рядок                  |
| B   | SectionHeading застарілий коментар  | ✅ Fixed             | коментар                 |
| C   | AppLock ad-hoc `z-[200]`            | ✅ Fixed             | 1 рядок                  |
| D   | orphan emerald `glow`/`focus-ring`  | ✅ Fixed             | 2 токени                 |
| E   | Дубльована radius-шкала             | ✅ Fixed             | ~30 call-sites           |
| F   | Radius enforcement + docs-fix       | ✅ Fixed             | doc                      |
| I   | Застарілий Card-тест (emerald→teal) | ✅ Fixed             | 1 ассерт                 |
| G   | Button не ортогональний             | ✅ Fixed             | Button + tests + stories |
| H   | Канонічний шар                      | ✅ Знято (вже канон) | —                        |
| I   | Застарілий Card-тест (emerald→teal) | ✅ Fixed             | 1 ассерт                 |
