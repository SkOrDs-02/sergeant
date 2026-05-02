# Monthly policy review

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> **Шаблон щомісячного огляду «hard rules» AGENTS.md.**
> Ціль: тримати enforcement здоровим — рано помічати дрейф, фіксувати винятки і
> запускати в роботу нові кандидати на автоматизацію.

---

## Як користуватись

1. На початку кожного місяця копіюємо цей файл як
   `docs/governance/reviews/YYYY-MM-policy-review.md`.
2. Заповнюємо три секції нижче.
3. Файл коммітимо з повідомленням `chore(docs): policy review YYYY-MM` у тому самому
   спринт-PR, де закриваємо найбільш імпактні висновки.
4. Для нових issue-кандидатів — створюємо GitHub issue з лейблом `policy-review` і
   лінкуємо у відповідний рядок таблиці.

Усі оцінки беремо з:

- `git log` за період + GitHub PR list (Conventional Commit лінт = автоматичний).
- CI runs за період (artifact-и `migration-lint`, `audit`, `commitlint`, `lint`).
- `docs/security/audit-exceptions.md` — активні винятки `audit-exception`.
- `docs/tech-debt/frontend.md`, `docs/tech-debt/backend.md` — burn-down trend.

---

## 1. Правила, що порушувались

Заповнити по одному рядку на кожне зафіксоване порушення (CI-блок, ревʼю-коментар,
production incident, ретрограмма від іншого PR). Якщо за період не було жодного —
лишити «Нічого» з пояснювальним коментарем (зазвичай це сигнал слабкого спостереження,
а не ідеального коду).

| Rule (AGENTS.md) | PR / Issue    | Як виявлено                                     | Hot fix                          | Root cause                                   | Action item                |
| ---------------- | ------------- | ----------------------------------------------- | -------------------------------- | -------------------------------------------- | -------------------------- |
| #1 bigint coerce | _e.g. PR-XXX_ | Snapshot diff у `apps/server/src/.../*.test.ts` | Додано `Number()` у серіалізатор | Новий серіалізатор без посилання на playbook | _Issue YYY: автоматизація_ |
| _#…_             | _…_           | _…_                                             | _…_                              | _…_                                          | _…_                        |

**Контекст root-cause:**

- Помилки знання (rule не задокументовано там, де треба) → тікет «doc fix».
- Помилки авто-enforcement (правило має існувати, але false-negative) → тікет
  «eslint rule fix» або «CI gate update».
- Помилки процесу (PR ревʼю проґавив) → пункт у наступний онбординг-checklist.

---

## 2. PRs із винятками (`audit-exception`, `// AI-LEGACY`, `// @ts-expect-error`)

Сюди йдуть **усі** активні винятки на момент огляду — не лише нові за період.
Так ми бачимо, що насправді тримається у репозиторії як «скоро виправимо».

### 2.1. `audit-exception` лейбл (CI security audit)

Джерело: `docs/security/audit-exceptions.md`.

| Advisory | Package | Severity | Mitigation | Due | Owner | Status |
| -------- | ------- | -------- | ---------- | --- | ----- | ------ |
|          |         |          |            |     |       |        |

> Питання для огляду: чи `Due` ще валідний? Чи є upstream-фікс?
> Якщо advisory застряг >30 днів і fix є — переводимо у hot-fix список (#1).

### 2.2. `// AI-LEGACY: ... expires YYYY-MM-DD` маркери

Джерело: `git grep -nE "AI-LEGACY:.*expires" -- apps/ packages/`.

| File:line | Маркер (стиснено) | Expires | Owner | Notes |
| --------- | ----------------- | ------- | ----- | ----- |
|           |                   |         |       |       |

> Усі прострочені (`expires` < сьогодні) — або переприсвоюємо нову дату з причиною,
> або викидаємо у burn-down наступного спринту.

### 2.3. `// @ts-expect-error` / `// @ts-ignore` / `as any`

Джерело: `git grep -nE "@ts-(expect-error|ignore)|as any|as unknown as" -- apps/ packages/`
(після PR-6.E це блокує `sergeant-design/no-strict-bypass`, тож рядки мають бути
тільки у allowlist).

| File:line | Pattern | Reason | Action |
| --------- | ------- | ------ | ------ |
|           |         |        |        |

### 2.4. `eslint-disable` коментарі

Джерело: `git grep -nE "eslint-disable" -- apps/ packages/`. Розрізняти `-line` і
`-next-line` від цілих файлів — file-scope бувають значно гірші.

| File:line | Rule | Reason | Action |
| --------- | ---- | ------ | ------ |
|           |      |        |        |

---

## 3. Нові кандидати на автоматизацію

Сюди йде те, що зараз тримається на **ревʼю / документації**, але виглядає як
повторюваний паттерн — гарний матеріал для нового ESLint-правила, CI-кроку чи
playbook-у. Один рядок на кандидата.

| #   | Pattern                                                 | Чому це повторюється                        | Запропонована автоматизація                                             | Effort | ROI    | Owner / Issue |
| --- | ------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- | ------ | ------ | ------------- |
| 1   | _e.g. `JSON.stringify` без replacer для bigint у логах_ | _3 PR за місяць ловили цей паттерн у ревʼю_ | _ESLint rule `no-bigint-in-json-log` у `eslint-plugin-sergeant-design`_ | 1-2 д  | medium |               |
| 2   |                                                         |                                             |                                                                         |        |        |               |

### Критерії включення кандидата

- **>= 2 порушення** за період АБО **1 серйозне** (зловживання, безпековий ризик).
- Можна виявити **детермінованим інструментом** (AST, regex, lint, CI-крок).
- Не дублює існуюче правило (`packages/eslint-plugin-sergeant-design/index.js`).

### Critique-чек

Перед додаванням нового rule:

- [ ] Правило не false-positive-чутливе (інакше додати allowlist + warn рівень спершу).
- [ ] Тести правила лежать у `packages/eslint-plugin-sergeant-design/__tests__/<name>.test.mjs`.
- [ ] У `README.md` плагіна додано BAD/GOOD приклади.
- [ ] У `eslint.config.js` (root) правило ввімкнено зі звуженим scope (`apps/*` glob).

---

## 4. Trend (замість changelog у одному файлі)

Опціональна секція — короткий тренд за останні 3 місяці, щоб бачити, чи rules
«вертаються». Будуємо вручну (5 хв), бо корисно для прийняття рішень.

| Метрика                                         | M-2 | M-1 | M-0 | Δ   |
| ----------------------------------------------- | --- | --- | --- | --- |
| `audit-exception` активні                       |     |     |     |     |
| `// AI-LEGACY` маркери                          |     |     |     |     |
| `// @ts-expect-error` / `as any` (allowlist)    |     |     |     |     |
| `no-raw-local-storage` allowlist (файлів)       |     |     |     |     |
| Strict TS coverage % (з `pnpm strict:coverage`) |     |     |     |     |
| Файлів >600 LOC у `apps/web/src`                |     |     |     |     |

---

## Посилання

- `AGENTS.md` — джерело hard rules (`#1`–`#9` на момент створення цього шаблону).
- `docs/security/audit-exceptions.md` — формат запису `audit-exception`.
- `docs/tech-debt/frontend.md` / `docs/tech-debt/backend.md` — burn-down lists.
- `packages/eslint-plugin-sergeant-design/README.md` — каталог наявних кастомних
  правил (приклади для нових кандидатів).
