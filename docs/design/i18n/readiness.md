# i18n readiness — Sergeant web

> **Last touched:** 2026-09-19 by @claude. **Next review:** 2027-04-27.
> **Status:** Active

> **Стан на 2026-09-16 — читай перед фазами нижче.** Фази 1–3 описані
> вірно, але (а) каталог давно не «`uk.ts` на 6 груп»: це агрегатор над
> `uk.core.ts` і десятьма модульними файлами, ~32 групи / ~1300 ключів, з
> вимогою, щоб eager-поверхні імпортували лише `uk.core`
> ([`uk.core.eagerImports.test.ts`](../../../apps/web/src/shared/i18n/uk.core.eagerImports.test.ts));
> (б) **Phase 4 частково приземлилась, але не за планом нижче**: без
> `i18next` — власний `getMessages(lang)` в `index.ts`, часткова `en.ts`
> (~30 груп) і `useLocale` (`?lang=en` → `localStorage["sergeant:locale"]`).
> Механічної перевірки паритету EN ↔ UK немає і не буде: **рішення
> власника 2026-09-16 — EN заморожено як фундамент** (S10-R2 закрито);
> (в) allowlist — **300** файлів, не 283, правило живе в `eslint.web.js`,
> не в `eslint.config.js`, і з 2026-09-16 число тримає храповик
> `cyrillicJsxAllowlist` у `check-ui-canon-ratchet.mjs` (стеля 300, лише
> вниз). Зведення — [`README.md`](./README.md).

## Контекст

Сергеант UA-first; англомовних beta-юзерів не набирає, EN-локаль часткова (див. вище). Запускати повний `i18next` / `lingui` runtime до того, як з'явиться продукт-вимога — це expensive yak-shave: ~20–30 годин на migration, плюс recurring cost кожного нового рядка.

Натомість ми робимо **lightweight foundation**, що готує ґрунт для майбутнього runtime-i18n за один крок:

1. Винести всі hardcoded UA-strings із production-коду в `apps/web/src/shared/i18n/uk.ts` (constants-каталог).
2. У day-to-day коді посилатися на `messages.<group>.<key>` замість inline-літералів.
3. Коли (й якщо) з'явиться product-вимога — заміна `messages.x.y` на `t('x.y')` буде однорядковою для кожного use-site.

Цей doc — checklist готовності й operational guide.

Roadmap-довідник: [`docs/work/specs/audits/2026-05-03-web-deep-dive`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-03-web-deep-dive/00-overview.md) item **#18** (score 0.67).

## Foundation (готово — round 10–14)

- ✅ Створено `apps/web/src/shared/i18n/uk.ts` — на round 14 із 7 групами
  (`auth`, `sync`, `validation`, `actions`, `empty`, `errors.generic`,
  `toast`, ~80 ключів). Станом на 2026-09-16 файл — агрегатор: групи
  ядра переїхали в `uk.core.ts`, модульні — у `uk.<module>.ts`.
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
    warn-режимі з allowlist на 300 файлів (станом на 2026-09-16; 283 на 2026-08-08, round-14 baseline був 239)
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
[`scripts/codemods/i18n-burndown/`](../../../scripts/codemods/i18n-burndown/) (README — рівнем вище, [`scripts/codemods/README.md`](../../../scripts/codemods/README.md))
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

Round-14 baseline: 239 файлів у allowlist; поточний стан — 300 (регрес, див. таблицю нижче), і з 2026-09-16 це стеля храповика
`cyrillicJsxAllowlist` (`pnpm lint:ui-canon`): дописати файл можна, лише прибравши інший. Кожен наступний PR
скорочує цей файл (одне-два видалення на PR) і опускає стелю через `--update`. Після `[]` — promote
до `"error"` у `eslint.web.js` (правило й allowlist підключені там, рядок
`sergeant-design/no-cyrillic-jsx-literal: ["warn", { allowlist }]`, скоуп
`apps/web/**/*.{ts,tsx,js,jsx}`).

### Phase 4 — Runtime swap (частково приземлилась, без `i18next`)

План був: `i18next` + `react-i18next`, дзеркальна `en.ts`, codemod
`messages.x.y` → `t('x.y')`, `i18n.changeLanguage(...)`. **Фактично
зроблено інакше** (ініціатива 0010, EN-foundation):

1. `apps/web/src/shared/i18n/index.ts` — `Locale = "uk" | "en"`,
   `SUPPORTED_LOCALES`, `parseLocale`, `getMessages(lang)`: EN накладається
   поверх UK неглибоким merge-ем, незакриті ключі лишаються українськими.
2. `en.ts` (~30 груп: auth, sync, validation, actions, status, nav, empty,
   errors, toast, hub, onboarding, paywall, legal, whatsNew …) плюс
   `en.pricing.ts`, `en.nutritionTdee.ts`. Модульні каталоги (finyk, fizruk,
   nutrition, routine) англійської не мають.
3. `useLocale.ts` — `?lang=` → `localStorage["sergeant:locale"]` → `uk`;
   `setLocale`. Споживачів — вісім поверхонь (PricingPage, HubReports,
   екрани Їжі); решта продукту читає `messages` напряму, тобто завжди UA.
4. Codemod `messages.x.y → t()` не робився і не потрібен: `getMessages`
   повертає той самий типізований обʼєкт.

Рішення власника 2026-09-16: EN — **лише foundation**, заморожено.
`lint:i18n-parity` не пишеться, переклад не доробляється, перемикач мови в
UI не показується. Натомість allowlist кирилиці тримає храповик
`cyrillicJsxAllowlist` (стеля 300), щоб каталог не розмивався далі. S10-R2
у `tech-debt/frontend.md` закрито цим рішенням.

## Coverage tracking

Round 14 (item #18 повний обсяг) — Phase 1+2+3 закриті, далі — burndown
allowlist-у через follow-up PR-и. Перевірити фактичну кількість файлів,
які ще тримають inline-кирилицю в JSX:

```bash
jq 'length' apps/web/eslint.i18n-allowlist.json
# → 300 (2026-09-16; 283 на 2026-08-08 — росло, коли нові екрани заходили з inline-кирилицею; з 2026-09-16 стеля храповика)
```

Або через ESLint warning count (eslint-rule безпосередньо):

```bash
cd apps/web && npx eslint . -f json 2>/dev/null \
  | jq '[.[] | .messages[] | select(.ruleId == "sergeant-design/no-cyrillic-jsx-literal")] | length'
# Поточна сесія: 0 (всі inline-сайти allow-листі)
```

Burndown plan (один файл за PR ↦ кілька десятків PR; з round-15 — пачки через codemod):

| Round | Allowlist size | Comment                                                                                                                                                                                                                              |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10    | n/a            | Foundation only (catalog created, auth migrated)                                                                                                                                                                                     |
| 14    | 239            | Phase 1+2+3 закрито; rule в warn-mode + allowlist                                                                                                                                                                                    |
| 15    | 233            | `i18n-burndown` codemod landed; 6 файлів мігровано (7 replacements)                                                                                                                                                                  |
| 16    | 199            | High-frequency burndown: +9 catalog-груп, codemod multi-line-import bug fixed; 34 файли мігровано (50 replacements)                                                                                                                  |
| 17    | 236            | Fizruk pages burndown: `Progress`, `Programs`, `Measurements`, `Body` + `Body/Journal{Section,EntryCard}` мігровано у `messages.fizruk.{progress,programs,measurements,body,journal}` (87 JSX-літералів, 6 файлів знято з allowlist) |
| 18+   | 292            | **Регрес:** нові екрани (бета-хвиля) заходили з inline-кирилицею швидше, ніж ішов burndown — allowlist переріс baseline round-14. Перш ніж продовжувати codemod-раунди, треба зупинити приплив (rule на `error` для нових файлів).   |
| 09-16 | 300            | Замір 2026-09-16 (`jq length`): приплив не зупинено — +8 за місяць. Механізму «error для нових файлів» досі немає.                                                                                                                   |
| —     | 0              | Ціль: promote rule до `"error"` глобально                                                                                                                                                                                            |

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

- ❌ Не додавати `i18next` runtime — власний `getMessages` / `useLocale` уже покриває потребу.
- ❌ Не розширювати `en.ts` на модульні каталоги «про запас»: divergence, якого це правило боялось, уже є (EN часткова, паритет не гейтиться). Спершу гейт паритету, потім переклад.
- ❌ Не міняти UA-asserts у тестах.

## Hard rule references

Коли мігруєш string у `uk.ts`:

1. Зберігай **точну** UA-копію (включно з пробілами, крапкою, тонкими апострофами `ʼ`).
2. Існуючі тести мають продовжити проходити без змін у assertion-strings — це гарантує, що міграція — це rename, не behavior-change.
3. Якщо рядок має параметри (template-literal) — додай як function `messages.x.y = (n) => "...${n}..."` замість const-string.

## Owners

Власник цього файлу й каталогу — `@Skords-01`. Ревью обов'язкове на будь-яку нову Phase.
