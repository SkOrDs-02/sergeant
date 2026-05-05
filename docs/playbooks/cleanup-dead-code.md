# Playbook: Прибирання dead code

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Active

**Trigger:** «Видали X і всі його використання» / видалення застарілого модуля, компонента, утиліти або feature flag.

## Owner surface

- Primary surface: будь-яка директорія під `apps/` або `packages/`, що містить мертвий символ
- Coupled surface: `apps/web/src/shared/lib/api/queryKeys.ts`, `packages/api-client`, `docs/`
- Governing skill: `sergeant-monorepo-boundaries`

---

## Step 0. Перевір, що файл — не scaffolding

> Додано 2026-04-29 у відповідь на PR [#1143](https://github.com/Skords-01/Sergeant/pull/1143). Див. AGENTS.md → Hard Rule #10.
> Також див. Hard Rule #15 — читай governance перед кодом; оновлюй docs разом із кодом.

Перш ніж видаляти **будь-що**, що позначене `pnpm knip`, перевір, чи має файл lifecycle-маркер:

```bash
# 1. Використовуй marker-aware wrapper замість сирого knip
pnpm dead-code:files

# 2. Для кожного кандидата подивись JSDoc lifecycle-теги в перших ~30 рядках
head -30 <file> | grep -E '@scaffolded|@deprecated|@experimental'

# 3. Подивись git log — чи додано як feat(...)? Коли? Ким?
git log --follow --oneline -- <file>
```

Файл, який:

- Має JSDoc-блок `@scaffolded` → **не чіпай**, навіть якщо knip каже «нуль імпортерів». Це навмисна попередньо-проведена інфраструктура.
- Має `@deprecated` із майбутньою датою `@removeBy` → залиш до тієї дати, потім видали (разом зі споживачами).
- Доданий нещодавнім `feat(...)` комітом (< 90 днів) і не має маркера → **додай маркер, не видаляй**. Автор скоріш за все просто забув маркер. Відкрий follow-up і спитай у власника, доводити до використання чи видаляти.
- Не має маркера, не має нещодавнього автора, не має споживачів **і** `git log --follow` показує що файл не торкали > 12 місяців → можна видаляти.

---

## Steps

### 1. Знайди всі references

```bash
# Шукай по всьому monorepo за іменем символу/файла
grep -rn "<symbol_or_filename>" --include="*.{ts,tsx,js,jsx,mjs,cjs,json,md}" .

# Перевір ре-експорти і barrel-файли
grep -rn "from.*<module_path>" .
```

Склади список усіх файлів, які імпортують, посилаються або тестують ціль.

### 2. Видали реалізацію

Видали source-файл(и) або конкретний експорт/функцію. Якщо ціль живе всередині більшого файла — видаляй тільки релевантний код, не рефактори решту.

### 3. Видали всі імпорти і використання

Пройди списком references зі step 1 і прибери:

- `import` / `require` statements
- Call sites і JSX usages
- Type references
- Re-exports із barrel/index файлів

### 4. Видали пов'язані тести і fixtures

Видали test-файли (`*.test.ts`, `*.test.tsx`), що тестували виключно прибраний код. Якщо тест-файл покриває кілька речей — видаляй тільки релевантні `describe` / `it` блоки.

### 5. Перевір feature flags

Якщо прибраний код був за feature flag:

- Видали запис прапорця з `FLAG_REGISTRY` у `apps/web/src/core/lib/featureFlags.ts`
- Видали всі call sites `useFlag("flag_name")` / `getFlag("flag_name")`
- Онови `docs/feature-flags.md`, якщо існує

### 6. Перевір згадки в документації

Шукай у docs згадки про прибраний код:

```bash
grep -rn "<symbol_or_filename>" docs/ README.md CONTRIBUTING.md AGENTS.md
```

Онови або прибери застарілі references.

### 7. Перевір React Query key factories

Якщо прибраний код використовував React Query — переконайся, що відповідну key factory у `apps/web/src/shared/lib/api/queryKeys.ts` теж прибрано (AGENTS.md правило #2).

### 8. Перевір зміни API contract

Якщо прибраний код мав API endpoint або поле відповіді:

- Онови типи в `packages/api-client/src/endpoints/*` (AGENTS.md правило #3)
- Додай або онови тест, який підтверджує, що поля/ендпоінта більше немає
- Якщо потрібна міграція — створи послідовний `NNN_*.sql` у `apps/server/src/migrations/` (AGENTS.md правило #4)

### 9. Перевір

```bash
pnpm lint          # має бути зеленим
pnpm typecheck     # має бути зеленим
pnpm test          # має бути зеленим
pnpm build         # має успішно пройти
```

### 10. Створи PR

- Гілка: `devin/<unix-ts>-chore-remove-<thing>`
- Commit: `chore(<scope>): remove <thing>` (Conventional Commits — AGENTS.md правило #5)
- Опис PR має містити:
  - Підсумок видалених файлів/рядків
  - Чому код мертвий (не використовується, замінено на X, флаг graduated)
  - Підтвердження, що всі references прибрано (paste grep-output, що показує нуль збігів)

---

## Verification

- [ ] `grep -rn "<symbol>"` повертає нуль збігів по monorepo
- [ ] `pnpm lint` — зелено
- [ ] `pnpm typecheck` — зелено
- [ ] `pnpm test` — зелено (виключаючи відомі flaky mobile-тести згідно з AGENTS.md)
- [ ] `pnpm build` — успішний
- [ ] Жодних осиротілих query key factories у `queryKeys.ts`
- [ ] Жодних осиротілих типів API client у `packages/api-client`
- [ ] Документацію оновлено (де доречно)

## Tools

- **Knip** (`pnpm knip`) — автоматичне виявлення dead code / невикористаних експортів. Запускай до і після, щоб підтвердити повноту прибирання. Knip — єдиний dead-code інструмент після initiative 0009 PR 4.2 (#TBD); `depcheck` і `ts-prune` виведено з обігу заради єдиного джерела істини.
- **`pnpm dead-code:files`** — wrapper над `knip`, що поважає `@scaffolded` lifecycle-маркери (Hard Rule #10). Використовуй замість сирого `knip` під час triage файлів для видалення.

## Notes

- Завжди видаляй окремим PR — не змішуй із feature-роботою (AGENTS.md soft rule).
- Якщо видаляєш файл — спочатку переконайся, що він не імпортується динамічно (шукай `import()` вирази).
- Якщо є сумніви — `pnpm check` (повний CI-набір) — це остаточна верифікація.
