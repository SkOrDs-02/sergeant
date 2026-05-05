# i18n readiness — Sergeant web

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Active

## Контекст

Сергеант поки **UA-only** і не приймає англомовних beta-юзерів. Запускати повний `i18next` / `lingui` runtime до того, як з'явиться продукт-вимога — це expensive yak-shave: ~20–30 годин на migration, плюс recurring cost кожного нового рядка.

Натомість ми робимо **lightweight foundation**, що готує ґрунт для майбутнього runtime-i18n за один крок:

1. Винести всі hardcoded UA-strings із production-коду в `apps/web/src/shared/i18n/uk.ts` (constants-каталог).
2. У day-to-day коді посилатися на `messages.<group>.<key>` замість inline-літералів.
3. Коли (й якщо) з'явиться product-вимога — заміна `messages.x.y` на `t('x.y')` буде однорядковою для кожного use-site.

Цей doc — checklist готовності й operational guide.

Roadmap-довідник: [`docs/diagnostics/2026-05-03-web-deep-dive`](../diagnostics/2026-05-03-web-deep-dive/00-overview.md) item **#18** (score 0.67).

## Foundation (готово — round 10–14)

- ✅ Створено `apps/web/src/shared/i18n/uk.ts` з 6 групами:
  `messages.auth.*`, `messages.sync.*`, `messages.validation.*`,
  `messages.actions.*`, `messages.empty.*`, `messages.errors.generic.*`,
  `messages.toast.*` (round 14: розширено до 6 груп, ~80 ключів).
- ✅ `translateAuthError` (`apps/web/src/core/auth/AuthContext.tsx`)
  переведено на `messages.auth.*`. Існуючі тести (`AuthContext.test.tsx`
  — 22 кейси) лишаються зеленими — string-rendering ідентичний.
- ✅ Структура каталогу типізована (`MessageCatalog`).
- ✅ **Round 14 — Phase 1 ↦ Phase 3 закрито в одному PR (item #18 повний обсяг):**
  - Sync error-toast (`useSyncErrorToast.ts`) — 5 рядків мігровано
    на `messages.sync.*` (4 нових ключі).
  - Zod-validation — 7 форм (AuthPage, ResetPasswordPage,
    ChangePasswordSection, WaitlistForm, Body, AddBudgetForm,
    TagsSection) переведено на `messages.validation.*` (~22 рядки,
    20 нових ключів). Тести пройдено без зміни assertions.
  - ESLint rule `sergeant-design/no-cyrillic-jsx-literal` додано в
    warn-режимі з allowlist на 239 файлів
    (`apps/web/eslint.i18n-allowlist.json`). Burndown — зменшувати
    allowlist у наступних PR-ах; коли `[]` — promote до `error`.
  - Unit tests rule-у: 13 кейсів (file scoping, allowlist behaviour,
    JSX text vs JSX attribute, MemberExpression skip, template-literal
    skip).

## Покрокова міграція (статус по фазах)

### Phase 1 — Sync + zod-validation (✅ closed round 14)

**`messages.sync.*`** — джерело: `apps/web/src/core/cloudSync/**`.
Закрито у round 14 — `useSyncErrorToast.userFacingSyncErrorMessage`
повністю на `messages.sync.error*` + `messages.sync.retryCta`.

**`messages.validation.*`** — джерело: zod-схеми у
`apps/web/src/core/**/*.ts(x)?` та `apps/web/src/modules/**/forms/**`.
Закрито 7 форм у round 14. Якщо в наступному PR-і додаєш zod-схему
з UA-message — додай новий ключ у `validation.*` (іменування — за
**призначенням**, не за рядком).

Recipe для нового рядка:

```bash
rg -n "z\.string\(\)\.min\([0-9]+, *\"[А-Я]" apps/web/src --type=ts
```

Кожне zod `.email("...")`, `.min(N, "...")`, etc. — переносити рядок
у `messages.validation.<key>` і відфайлити з allowlist той файл,
якщо він уже в JSON.

### Phase 2 — Catalog skeleton + UI strings (foundation closed; burndown ongoing)

`messages.actions.*`, `messages.empty.*`, `messages.errors.generic.*`,
`messages.toast.*` створено в round 14 з типовими ключами (save, cancel,
nothingYet, network-error, saved, etc). Подальші round-и мігрують
inline-літерали в JSX → ці групи; кожна міграція знімає файл з
allowlist-у.

**Tooling — `i18n-burndown` codemod** (round 15+):
[`scripts/codemods/i18n-burndown/`](../../scripts/codemods/i18n-burndown/README.md)
— AST-кодомод, який бере allowlist-файл, шукає JSX-text + JSX-attribute
UA-літерали, мапить їх до існуючих ключів каталогу і переписує лише ті
файли, де **усі** літерали зматчилися (інакше пропускає, щоб не
залишати half-migrated компонент). Mapping будується рантайм-парсингом
`apps/web/src/shared/i18n/uk.ts` — нічого hand-maintain. Idempotent;
безпечно re-run-ити після додавання нових ключів. Dry-run за
замовчанням, `--write` застосовує і вибиває fully-migrated шляхи з
JSON-у allowlist.

```bash
node scripts/codemods/i18n-burndown/script.mjs              # dry run
node scripts/codemods/i18n-burndown/script.mjs --write      # apply
node scripts/codemods/i18n-burndown/script.mjs --filter=foo # subset
```

### Phase 3 — ESLint rule `no-cyrillic-jsx-literal` (✅ landed round 14, warn-mode)

Імплементація — `packages/eslint-plugin-sergeant-design/index.js`
(пошук `noCyrillicJsxLiteral`). Покриває:

- JSXText nodes з `/[\u0400-\u04FF]/`.
- JSXAttribute string-literal values (e.g. `title="Закрити"`).

Виключає: tests (`*.test.tsx`, `__tests__/`), stories (`*.stories.tsx`),
сам каталог (`apps/web/src/shared/i18n/**`), MemberExpression-references
(`messages.x.y`), template literals (next-round scope), та файли з
allowlist у `apps/web/eslint.i18n-allowlist.json`.

Round-14 baseline: 239 файлів у allowlist. Кожен наступний PR
скорочує цей файл (одне-два видалення на PR). Після `[]` — promote
до `"error"` у `eslint.config.js`.

### Phase 4 — Runtime swap (тільки коли є product-вимога)

Якщо/коли з'явиться англомовний MVP:

1. Додати `i18next` + `react-i18next` як залежності `@sergeant/web`.
2. Створити `apps/web/src/shared/i18n/en.ts` (mirror структури `uk.ts`, всі value-strings перекласти).
3. Замінити `messages.x.y` на `t('x.y')` через codemod (jscodeshift або перетворення у IDE).
4. Локально вибрати локаль через `i18n.changeLanguage(...)`.

Час: ~4–6 годин для swap, бо foundation вже готовий.

## Coverage tracking

Round 14 (item #18 повний обсяг) — Phase 1+2+3 закриті, далі — burndown
allowlist-у через follow-up PR-и. Перевірити фактичну кількість файлів,
які ще тримають inline-кирилицю в JSX:

```bash
jq 'length' apps/web/eslint.i18n-allowlist.json
# → 233 (post round-15 codemod)
```

Або через ESLint warning count (eslint-rule безпосередньо):

```bash
cd apps/web && npx eslint . -f json 2>/dev/null \
  | jq '[.[] | .messages[] | select(.ruleId == "sergeant-design/no-cyrillic-jsx-literal")] | length'
# Поточна сесія: 0 (всі inline-сайти allow-листі)
```

Burndown plan (один файл за PR ↦ кілька десятків PR; з round-15 — пачки через codemod):

| Round | Allowlist size | Comment                                                             |
| ----- | -------------- | ------------------------------------------------------------------- |
| 10    | n/a            | Foundation only (catalog created, auth migrated)                    |
| 14    | 239            | Phase 1+2+3 закрито; rule в warn-mode + allowlist                   |
| 15    | 233            | `i18n-burndown` codemod landed; 6 файлів мігровано (7 replacements) |
| 16–25 | ~100           | Settings panels + showcase sections мігровані                       |
| 25–40 | 0              | Promote rule до `"error"`                                           |

Сирий мір по проекту (всі UA-strings, не тільки JSX-літерали; для
референсу — НЕ closure-метрика):

```bash
rg -n --glob='apps/web/src/**' --glob='!apps/web/src/shared/i18n/**' \
  --glob='!apps/web/src/**/*.test.{ts,tsx}' \
  --glob='!apps/web/src/**/__tests__/**' \
  '[\u0400-\u04FF]' | wc -l
```

(Тести не рахуємо — вони залишаються із hardcoded UA-asserts назавжди.)

## Не робити поки нема вимоги

- ❌ Не додавати `i18next` runtime раніше Phase 4. Foundation-каталог достатній.
- ❌ Не перекладати `uk.ts` на англійську "про запас" — це створить divergence.
- ❌ Не міняти UA-asserts у тестах.

## Hard rule references

Коли мігруєш string у `uk.ts`:

1. Зберігай **точну** UA-копію (включно з пробілами, крапкою, тонкими апострофами `ʼ`).
2. Існуючі тести мають продовжити проходити без змін у assertion-strings — це гарантує, що міграція — це rename, не behavior-change.
3. Якщо рядок має параметри (template-literal) — додай як function `messages.x.y = (n) => "...${n}..."` замість const-string.

## Owners

Власник цього файлу й каталогу — `@Skords-01`. Ревью обов'язкове на будь-яку нову Phase.
