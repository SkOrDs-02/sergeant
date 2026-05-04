# i18n readiness — Sergeant web

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

## Контекст

Сергеант поки **UA-only** і не приймає англомовних beta-юзерів. Запускати повний `i18next` / `lingui` runtime до того, як з'явиться продукт-вимога — це expensive yak-shave: ~20–30 годин на migration, плюс recurring cost кожного нового рядка.

Натомість ми робимо **lightweight foundation**, що готує ґрунт для майбутнього runtime-i18n за один крок:

1. Винести всі hardcoded UA-strings із production-коду в `apps/web/src/shared/i18n/uk.ts` (constants-каталог).
2. У day-to-day коді посилатися на `messages.<group>.<key>` замість inline-літералів.
3. Коли (й якщо) з'явиться product-вимога — заміна `messages.x.y` на `t('x.y')` буде однорядковою для кожного use-site.

Цей doc — checklist готовності й operational guide.

Roadmap-довідник: [`docs/diagnostics/2026-05-03-web-deep-dive`](../diagnostics/2026-05-03-web-deep-dive/00-overview.md) item **#18** (score 0.67).

## Foundation (вже зроблено — round 10)

- ✅ Створено `apps/web/src/shared/i18n/uk.ts` з `messages.auth.*`, `messages.sync.*`, `messages.validation.*`.
- ✅ `translateAuthError` (`apps/web/src/core/auth/AuthContext.tsx`) переведено на `messages.auth.*`. Існуючі тести (`AuthContext.test.tsx` — 22 кейси) лишаються зеленими — string-rendering ідентичний.
- ✅ Структура каталогу типізована (`MessageCatalog`).

## Покрокова міграція (наступні round-и)

### Phase 1 — Заглушки → реальні рядки

Дві групи у `messages` уже мають стартові ключі-заглушки. Наступні round-и переносять справжні рядки з кодової бази:

**`messages.sync.*`** — джерело: `apps/web/src/core/cloudSync/**/*.ts(x)?`. Шукати:

```bash
rg -n --type=ts --glob='apps/web/src/core/cloudSync/**' "[А-Яа-яЇїІіЄєҐґ]"
```

Кожне знайдене UA-string-літерал → ключ у `messages.sync.<verb>` (push, pull, conflict, queueRetry, etc). Use-site замінити на `messages.sync.<verb>`.

**`messages.validation.*`** — джерело: zod-схеми у `apps/web/src/core/**/*.ts(x)?` та `apps/web/src/shared/forms/**`. Шукати:

```bash
rg -n "z\.string\(\)" apps/web/src --type=ts -A 5 | grep -E "[А-Я]"
```

Кожне zod `.email("...")`, `.min(N, "...")`, etc. — переносити рядок у `messages.validation.<key>`.

### Phase 2 — Empty-states + UI strings

Додати:

- `messages.empty.*` (Empty-state messages: `messages.empty.transactions`, `messages.empty.workouts`, etc).
- `messages.actions.*` (Button labels: «Зберегти», «Відмінити», «Видалити»).
- `messages.errors.generic.*` (Networking, server-down, retry).
- `messages.toast.*` (Success/error toast strings).

### Phase 3 — ESLint custom-rule (deferred)

Додати у `packages/eslint-plugin-sergeant-design`:

```ts
// rules/no-cyrillic-jsx-literal.ts
{
  meta: { type: "problem", docs: { description: "JSX-літерал з кирилицею має посилатися на messages-каталог" } },
  create(context) {
    return {
      JSXText(node) {
        if (/[\p{Script=Cyrillic}]/u.test(node.value)) {
          context.report({ node, message: "Винеси рядок у apps/web/src/shared/i18n/uk.ts" });
        }
      },
    };
  },
}
```

Стартувати у `warn`-режимі з allowlist у `eslint.config.js`. Поступово зменшувати allowlist (як burndown-pattern для `localStorage` rule, item #6).

### Phase 4 — Runtime swap (тільки коли є product-вимога)

Якщо/коли з'явиться англомовний MVP:

1. Додати `i18next` + `react-i18next` як залежності `@sergeant/web`.
2. Створити `apps/web/src/shared/i18n/en.ts` (mirror структури `uk.ts`, всі value-strings перекласти).
3. Замінити `messages.x.y` на `t('x.y')` через codemod (jscodeshift або перетворення у IDE).
4. Локально вибрати локаль через `i18n.changeLanguage(...)`.

Час: ~4–6 годин для swap, бо foundation вже готовий.

## Coverage tracking

Шість round-ів (8 → 18) — це шлях до 0 hardcoded UA-strings у `apps/web/src` (за межами `uk.ts`). Оригінальний звіт із 2026-05-04:

| Round       | Hardcoded UA-strings (поза `uk.ts`) | Comment                             |
| ----------- | ----------------------------------- | ----------------------------------- |
| 10 (start)  | ~150                                | Foundation: auth migrated (12 keys) |
| 11 (target) | ~140                                | Phase 1: sync (10 keys)             |
| 12 (target) | ~120                                | Phase 1: validation (20 keys)       |
| 13 (target) | ~80                                 | Phase 2: empty-states + actions     |
| 14 (target) | ~30                                 | Phase 3: ESLint warn-режим          |
| 15+         | 0                                   | ESLint error-режим                  |

Точне значення hardcoded-strings виміряти можна через:

```bash
rg -n --type=ts --type=tsx 'apps/web/src' "[\p{Cyrillic}]" \
  --glob '!apps/web/src/shared/i18n/**' \
  --glob '!apps/web/src/**/*.test.{ts,tsx}' | wc -l
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
