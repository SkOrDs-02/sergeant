# ADR-0093: ESLint + Prettier лишаються; лінт-конвеєр лікується кешем, а не заміною інструмента

- **Status:** Accepted
- **Date:** 2026-09-02
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0081](./0081-repository-simplification.md) — retire естетичних AST-правил; чинними лишились runtime/security/storage/API/domain-інваріанти, які саме й тримає власний ESLint-плагін
  - [`packages/eslint-plugin-sergeant-design/index.js`](../../../packages/eslint-plugin-sergeant-design/index.js) — 25 правил, які реалізують Hard Rules #1, #2, #20, #21 та доменні інваріанти
  - [`turbo.json`](../../../turbo.json) — `globalDependencies`, доданий цим рішенням
  - [`scripts/eslint-print-config-diff.mjs`](../../../scripts/eslint-print-config-diff.mjs) — снапшот-гейт резолвленого конфігу, підключений цим рішенням

---

## Context and Problem Statement

Постало питання, чи мігрувати лінт і форматування з ESLint + Prettier на Biome —
типова мотивація тут швидкість.

Перед відповіддю конвеєр заміряли. Числа (4 vCPU, свіжий `pnpm install`):

| Сценарій                                | Було   |
| --------------------------------------- | ------ |
| `pnpm lint` холодний                    | ~147 с |
| — з них `turbo run lint`                | 117 с  |
| —— з них лише `@sergeant/web`           | 83 с   |
| — хвіст із 31 команди                   | 30 с   |
| `pnpm lint` теплий (turbo cache hit)    | 23 с   |
| Реальна зміна одного файлу в `apps/web` | ~113 с |

Замір показав три речі, з яких дві не стосуються вибору лінтера.

**По-перше, у конвеєрі був фальшивий зелений.** У `turbo.json` не було
`globalDependencies`, а всі правила живуть у кореневих `eslint.*.js` —
воркспейсні `eslint.config.js` лише реекспортують їх через
`packageConfig("../..")` і самі не змінюються. Turbo кореневі файли не хешував,
тож **зміна будь-якого правила не інвалідувала кеш `lint`**. Доведено проб-
прогоном: з правилом `max-lines: ["error", 1]` для `apps/web/**/*.tsx` звичайний
`turbo run lint` рапортував `17 cached, 17 total` і зелений вихід, тоді як
`--force` того самого дерева падав. У CI увімкнено turbo remote cache, тож
фальшивий зелений розповзався б між прогонами.

Це третій випадок того самого класу після мовчазного `size-limit` і
`posthog-js` під catch-all `manualChunks` (обидва — AGENTS.md § Performance
budgets): **гейт, чий вхід не хешується, гейтом не є.**

**По-друге, `eslint --cache` не був увімкнений ніде**, тож кожен промах
turbo-кешу означав повний перелінт воркспейсу — 83 с для `apps/web`.

**По-третє, хвіст із 31 команди страждав не від послідовності, а від обгортки.**
`pnpm run lint:harness-version-freshness` = 818 мс, той самий
`node scripts/check-harness-version-freshness.mjs` = 56 мс. ~760 мс спавн-
оверхеду × 29 викликів ≈ 22 с з 30.

## Considered Options

1. **Повна міграція на Biome** — один інструмент замість ESLint + Prettier.
2. **Гібрид: Biome для JS/TS, Prettier для решти** — Biome не форматує Markdown
   і YAML, а в репо 826 `.md` під docs-governance-конвеєром.
3. **Лишити ESLint + Prettier, полагодити кешування й спавн-оверхед.**

## Decision

Обрано варіант 3. Конкретно:

- `turbo.json` отримує `globalDependencies` з усіма кореневими `eslint.*.js`,
  `.prettierrc.json`, `.prettierignore` і `packages/eslint-plugin-sergeant-design/index.js`.
- Таска `lint` отримує `outputs: [".eslintcache"]`, а всі 15 воркспейсних
  `lint`-скриптів — прапорець `--cache`; `.eslintcache` додано в `.gitignore`.
- Ланцюжок `pnpm lint` викликає скрипти напряму (`node scripts/…`) замість
  `pnpm lint:…`. Іменовані скрипти лишаються для окремого запуску.
- `pnpm lint:eslint-config-diff` підключено окремим кроком джоби `check` —
  **перед** «Format, lint, test, build».

## Rationale

Biome відпадає не через швидкість, а через те, що ним не виражається те, що
цей репозиторій лінтує.

**25 кастомних правил = Hard Rules.** `rq-keys-only-from-factory` (#2),
`no-bigint-string` (#1), `no-raw-req-in-pino-log` (#21), `no-anthropic-key-in-logs`,
`ai-marker-syntax`, `no-raw-local-storage`, `no-strict-bypass` — 3279 рядків.
Biome не має JS plugin API; GritQL-плагіни — патерн-матчинг без autofix і без
опцій правила, а трасування імпортів для RQ-ключів чи аналіз коментарів для
AI-маркерів у ньому не виражається взагалі. Міграція означала б обміняти
механічний енфорсмент блокуючих правил на секунди.

**Prettier не знімається.** 826 `.md` під `lint-staged` (bump-last-validated,
derived-artifacts) плюс `.yml`. Найкращий доступний сценарій — два форматери й
два конфіги з ризиком розбіжності замість одного.

**Плагіни без заміни:** `eslint-plugin-security` аналога не має; покриття
`eslint-plugin-import` з `eslint-import-resolver-typescript` часткове.

**Головний виграш Biome тут не належить.** Biome виграє насамперед там, де
ESLint запускає TS-програму через `parserOptions.project`. У цьому репо
`projectService` не увімкнено ніде.

І головне: після фіксу кешу інкрементальний ESLint дає ~5 с на `apps/web` — це
вже діапазон Biome, без втрати 25 правил і без другого форматера.

## Consequences

### Positive

Заміряно після змін:

| Сценарій                                | Було   | Стало    |
| --------------------------------------- | ------ | -------- |
| `pnpm lint` холодний                    | ~147 с | ~123 с   |
| `pnpm lint` теплий                      | 23 с   | **9 с**  |
| Реальна зміна одного файлу в `apps/web` | ~113 с | **14 с** |
| Хвіст із 31 команди                     | 30 с   | 7.8 с    |
| `eslint .` у `apps/web` після зміни     | 82 с   | 5–6 с    |

Плюс закрито фальшивий зелений: той самий проб-прогін тепер падає, а не
рапортує `17 cached`.

### Negative

`globalDependencies` глобальний — зміна кореневого ESLint-конфігу інвалідує
кеш **усіх** тасок, не лише `lint`. Це навмисно: точніший варіант вимагав би
per-task `inputs` і ще одного місця, де перелік файлів може розійтися з
дійсністю. Ціна — зайвий холодний прогін після рідкої правки конфігу.

### Neutral

Дубльовані CI-кроки (`lint:patches`, `lint:discoverability` крутяться і окремим
кроком, і всередині `pnpm lint`) **лишено навмисно**. Виглядало як очевидне
скорочення ~1.5 с, але окремі кроки стоять ДО «Format, lint, test, build», а
всередині `pnpm lint` — після нього; прибрати їх означало б посунути гейт за
потенційно червоний крок, тобто повторити помилку, від якої застерігає
AGENTS.md § Performance budgets.

## Compliance

- `turbo.json` § `globalDependencies` — регресія ловиться самим проб-прогоном:
  тимчасове правило-ламайка в `eslint.web.js` має робити `turbo run lint`
  червоним без `--force`.
- CI-крок `ESLint resolved-config snapshot gate (PR-31 phase 2)` у джобі `check`
  — будь-яка зміна резолвленого конфігу перевертає снапшот під
  `scripts/__fixtures__/eslint-print-config/` і потрапляє в діф на рев'ю.
- Питання «а чи не перейти на Biome» вважається закритим до моменту, поки
  Biome не отримає стабільний Markdown/YAML-форматер **і** повноцінний plugin
  API з autofix.

## Links

- Заміри проведені на `claude/biome-migration-linter-prettier-b3sk14`.
