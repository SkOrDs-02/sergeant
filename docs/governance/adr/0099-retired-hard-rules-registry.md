# ADR-0099: Реєстр знятих Hard Rules (доповнення до ADR-0081)

- **Status:** Accepted
- **Date:** 2026-09-23
- **Last validated:** 2026-09-23 by @claude
- **Next review:** 2027-03-23
- **Deciders:** @Skords-01
- **Supersedes:** -
- **Related:**
  - [ADR-0081](./0081-repository-simplification.md) - рішення, на яке посилаються `AGENTS.md` § Hard rules і `rules/README.md` як на підставу зняття.
  - [ADR-0045](./0045-hard-rules-taxonomy.md) - таксономія категорій; усі дев'ять знятих правил мали категорію `lint-enforced-convention`.
  - [`docs/governance/governance/hard-rules.json`](../governance/hard-rules.json) - чинний реєстр (17 правил).
  - [`docs/governance/governance/rules/README.md`](../governance/rules/README.md) - індекс per-rule файлів.

---

## Context and Problem Statement

`AGENTS.md` § Hard rules і `docs/governance/governance/rules/README.md` кажуть, що правила #8, #9, #11-#14, #16, #17 і #24 зняті рішенням ADR-0081. Сам ADR-0081 жодного з цих номерів не називає: він формулює принцип («візуальний смак живе в токенах, Storybook, a11y-перевірках і рев'ю, а не в евристичних AST-правилах»; «репозиторій не комітить згенеровані графи й індекси»), але не каже, яке правило чим перевірялось і що його замінює. Аудит документації 2026-09-23 зафіксував це як знахідку DG-15.

Зняття виконано одним комітом `6d3810fdd` («chore(root): simplify repository automation and history», 2026-07-30, досяжний з `main`). Він видалив дев'ять per-rule файлів у тодішньому дереві `docs/04-governance/governance/rules/`, записи в `hard-rules.json`, рядки в `AGENTS.md` і відповідні правила `eslint-plugin-sergeant-design` разом із тестами. Той самий коміт додав ADR-0081. Без окремого запису агент, який бачить пропуски в нумерації, не має звідки дізнатись, що саме зникло і чи треба це відновлювати.

## Considered Options

1. **Дописати перелік у тіло ADR-0081.** Змінює прийнятий ADR заднім числом, що суперечить моделі незмінності з `README.md` цього каталогу.
2. **Окремий супровідний ADR-реєстр.** Фіксує факти зняття, не чіпаючи ADR-0081.
3. **Нічого не робити.** Посилання «retired за ADR-0081» лишається непідтвердженим, історія доступна лише через `git show`.

## Decision

Обрано варіант 2. Цей ADR нічого не змінює в чинних правилах: він лише записує, що було знято тим самим рішенням, що й ADR-0081.

| #   | Правило (назва в реєстрі до зняття)                                           | Чим перевірялось                                                                                                                                                                    | Що замінює                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | Tailwind colour-opacity steps must be on the registered scale                 | ESLint `sergeant-design/valid-tailwind-opacity` (error)                                                                                                                             | шкала `theme.opacity` у [`tailwind-preset.js`](../../../packages/design-tokens/tailwind-preset.js); Tailwind не генерує утиліту для незареєстрованого кроку                                                                                     |
| 9   | Saturated brand fills behind `text-white` must use the `-strong` companion    | ESLint `sergeant-design/no-low-contrast-text-on-fill` (error) + brandbook § WCAG-AA -strong Tier                                                                                    | `-strong`-компаньйони в [`tokens.js`](../../../packages/design-tokens/tokens.js), [`brandbook.md`](../../design/design/brandbook.md), design-review                                                                                             |
| 11  | No arbitrary hex colors in `className`                                        | ESLint `sergeant-design/no-hex-in-classname` (error)                                                                                                                                | токени дизайн-системи, [`DESIGN.md`](../../../DESIGN.md) (гейт `pnpm design:check-md`), рев'ю                                                                                                                                                   |
| 12  | Module-accent containment (no foreign accents inside a module subtree)        | ESLint `sergeant-design/no-foreign-module-accent` (error)                                                                                                                           | модульні акценти в токенах, design-review                                                                                                                                                                                                       |
| 13  | No raw-palette light/dark `className` pairs                                   | ESLint `sergeant-design/no-raw-dark-palette` (error)                                                                                                                                | семантичні токени з темізацією, design-review                                                                                                                                                                                                   |
| 14  | Visible focus indicators must use `focus-visible:`, not `focus:`              | ESLint `sergeant-design/prefer-focus-visible` (error)                                                                                                                               | a11y-перевірки й рев'ю (ADR-0081 називає «accessibility checks» серед замінників)                                                                                                                                                               |
| 16  | Typography scale (semantic styles + 12px floor)                               | convention: `plugins.semanticTypography` у `tailwind-preset.js` + design-system § Типографічна шкала; ESLint `prefer-text-style` і `no-arbitrary-text-size` зняті тим самим комітом | утиліти `.text-style-*` у [`tailwind-preset.js`](../../../packages/design-tokens/tailwind-preset.js), [`02-typography.md`](../../design/design/design-system/02-typography.md), Storybook                                                       |
| 17  | Animation budget (max 2 concurrent, 3 tiers)                                  | convention: текст правила в `AGENTS.md` + design-system § 14                                                                                                                        | [`05-motion-offline-error.md` § 14](../../design/design/design-system/05-motion-offline-error.md), рев'ю                                                                                                                                        |
| 24  | Catalogs registered in `knowledge-graph.json` must have a `--check` generator | CI: `docs:check-graph`, `agent:check-index`, `docs:check-symbols`, `docs:check-repo-map`, `docs:check-service-catalog`, `docs:check-architecture-diagrams`, `docs:check-pr-ledger`  | замінника немає: правило втратило предмет. Той самий коміт видалив `knowledge-graph.json`, символьні каталоги `*/symbols.json` і скрипти `docs:check-graph`, `docs:check-symbols`, `agent:check-index` (ADR-0081, ADR-0058, ADR-0059, ADR-0066) |

**Номери не перевикористовуються.** Нове правило бере наступний вільний номер після найбільшого чинного, а не номер із цього списку.

**Тексти знятих правил доступні з історії.** Шлях у дереві до зняття: `git show 6d3810fdd^:docs/04-governance/governance/rules/<NN>-<slug>.md` (наприклад `08-tailwind-colour-opacity-scale.md`, `24-catalog-check-generator.md`); реєстр: `git show 6d3810fdd^:docs/04-governance/governance/hard-rules.json`.

## Rationale

Вісім із дев'яти правил (#8, #9, #11-#14, #16, #17) описували візуальні конвенції. ADR-0081 переносить їх у токени, Storybook, a11y-перевірки й рев'ю, а `eslint-plugin-sergeant-design` залишає лише для runtime-, security-, storage-, API- і domain-інваріантів. Правило #24 зобов'язувало мати `--check`-генератор для кожного каталогу з `knowledge-graph.json`; ADR-0081 прибрав закомічені графи й індекси, тож правилу не лишилось об'єкта.

Реєстр як окремий ADR обрано, бо він не переписує прийняте рішення і дає одне місце, куди можуть посилатись `AGENTS.md` і `rules/README.md`.

## Consequences

### Positive

- Посилання «retired за ADR-0081» стає перевірним: номер, механізм, причина й замінник записані в репо.
- Агент не відновлює зняте правило, побачивши пропуск у нумерації.

### Negative

- Візуальні конвенції #8-#17 більше не мають механічного гейта; порушення ловить лише рев'ю. Це свідомий обмін з ADR-0081, а не наслідок цього ADR.

### Neutral

- Чинний реєстр не змінюється: 17 правил, 8 `blocker-invariant`, 9 `lint-enforced-convention`.
- PR-ledger лишився окремим правилом #26; його статус поза межами цього ADR.

## Compliance

- `pnpm lint:hard-rules-registry` звіряє `AGENTS.md`, `hard-rules.json` і per-rule файли; знятих номерів там немає.
- `node scripts/docs/check-adr-graph.mjs` перевіряє, що цей ADR внесено в індекс.

## Links

- Коміт `6d3810fdd` (2026-07-30), той самий вміст у `oldgh/codex/repository-simplification` як `e3d0f4fe9`.
- Аудит документації 2026-09-23, знахідка DG-15: [`2026-09-23-docs-governance-audit.md`](../../work/specs/audits/2026-09-23-docs-governance-audit.md).
