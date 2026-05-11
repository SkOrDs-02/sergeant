---
name: sergeant-writing-skills
description: Use when creating, editing, or pressure-testing a `.agents/skills/*/SKILL.md` in Sergeant — applies TDD to skill content; UA: пишеш або редагуєш SKILL.md.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` so UA-only chat routing still resolves the right SKILL.
---

# Як писати SKILL у Sergeant

SKILL.md — це не проза, а інструкція, яку агент виконуватиме «verbatim». Тому процес створення/редагування SKILL — це TDD, застосоване до інструкцій: спершу пресс-сценарій (тест), потім текст skill (production code), потім перевірка, що поведінка агента справді змінилась.

**Core principle:** якщо ти не побачив, як агент порушує правило **без** твого skill, ти не знаєш, чи новий skill реально щось виправляє.

**Required background:** `sergeant-bugfix-and-regression` (RED-GREEN дисципліна) і `sergeant-review-and-merge` § Verification gate.

## Коли застосовувати

| Сценарій                                                       | Дія                                              |
| -------------------------------------------------------------- | ------------------------------------------------ |
| Новий `.agents/skills/<slug>/SKILL.md`                         | Повний RED → GREEN → REFACTOR цикл нижче         |
| Поведінкова правка існуючого SKILL (зміна правил, прикладів)   | Pressure-test поточної версії + після правки     |
| Чисто косметичні правки (typo, форматування, посилання)        | Достатньо `pnpm lint:skills` + `pnpm skills:lock`|
| Видалення/архівація SKILL                                      | Маркер `@deprecated` + оновити каталог + lock    |

## RED → GREEN → REFACTOR для SKILL

### 1. RED — пресс-сценарій без skill

Сформулюй конкретну задачу, де очікувана поведінка агента відрізняється від generic-defaults. Прогони задачу на свіжій сесії агента **без** нового SKILL і запиши:

- Точний промпт, який ти дав.
- Точні раціоналізації, якими агент порушує правило («тут міграція проста, схему не потрібно дробити», «inline RQ key один раз — нормально», «`bigint` сам відсеріалізується»).
- Команди/edits, які він робить.

Це і є «failing test». Якщо агент **уже** робить правильно без SKILL — SKILL не потрібен, не пиши.

### 2. GREEN — мінімальний SKILL, що адресує саме ті раціоналізації

- Frontmatter: `name` = slug папки, `description` ≤ 220 символів з UA-тригером (`; UA: …`), `lang: en`, `lang-reason`.
- Body — EN, грунтований у конкретних шляхах (`apps/`, `packages/`, `scripts/`, `docs/`, `.agents/`) або `pnpm` командах.
- Один обовʼязковий лінк на playbook у `docs/playbooks/` або на `docs/agents/agent-skills-catalog.md`.
- Адресуй **саме ті** раціоналізації з RED-фази. Не пиши «загальну освіту» — пиши контр-приклади.
- Жодних injection-/exfiltration-патернів — `pnpm lint:skills` ловить їх через `scripts/check-skill-body-security.mjs` (7 категорій загроз, Hard Rule #22).

### 3. Перевірка — прогон на чистій сесії

Перезапусти ту саму задачу з RED-фази на свіжій сесії агента, де новий SKILL завантажується (через `sergeant-start-here` routing або specialist mapping). Запиши:

- Чи агент більше не дає тих самих раціоналізацій.
- Чи фінальний diff відповідає правильній поведінці.
- Якщо ні — поверни в RED, додай контр-приклад у SKILL.

### 4. REFACTOR — закрити обхідні шляхи

Запусти 2-3 варіації пресс-сценарію (інший формат промпта, інший surface, інший рівень тиску на «зробити швидко»). Якщо знаходиш нову раціоналізацію — додай у SKILL і повтори перевірку. Готово, коли 3 послідовні варіації не зламують поведінку.

## Грамар Sergeant SKILL

Кожен SKILL у `.agents/skills/` ОБОВ'ЯЗКОВО:

1. Починається з `---` YAML-frontmatter з `name`, `description` (≤220 chars), `lang: en`, `lang-reason`.
2. `name:` дорівнює slug-у директорії — інакше `pnpm lint:skills` падає.
3. Body містить конкретний шлях у репо або `pnpm`/`pnpx` команду — інакше SKILL «не заземлений» і ловиться `check-skill-shape.mjs`.
4. Body лінкує мінімум один playbook у `docs/playbooks/` або сам `docs/agents/agent-skills-catalog.md`.
5. Реєструється в `.agents/skills-lock.json` (через `pnpm skills:lock`) і в таблиці Active Skills у `docs/agents/agent-skills-catalog.md`.
6. Не містить патернів з 7 категорій загроз — `pnpm lint:skills` валідовує через `scripts/check-skill-body-security.mjs` (Hard Rule #22, див. [`docs/governance/rules/22-skill-body-security-scan.md`](../../../docs/governance/rules/22-skill-body-security-scan.md)).

## Локальний контроль перед PR

```bash
pnpm lint:skills    # shape + lock SHA-256 + security scan
pnpm skills:lock    # регенерує SHA-256 після свідомої зміни вмісту
pnpm lint:discoverability   # переконатися, що нові доки досяжні з AGENTS.md ≤ 2 hops
```

Якщо ти додав новий SKILL — додай рядок у Active Skills таблицю в `docs/agents/agent-skills-catalog.md` і, якщо це новий routing-сценарій, у роутинг-таблицю `.agents/skills/sergeant-start-here/SKILL.md`.

## Червоні прапорці

- «SKILL описує загальну добру практику» → не SKILL, це блог. SKILL існує, бо агент **порушує** конкретне правило в цьому репо.
- «Тест-сценарій я придумав у голові» → не пресс-тест, це фантазія. Пиши промпт, який реально подавав агенту, і виводь, який реально отримав.
- «Розшир skill — буде більш generic» → ні. Generic-обгортки browser/design/planning skill-ів у Sergeant заборонені (див. `sergeant-start-here` § Політика generic-skill-ів).
- «Додам приклад тестування пізніше» → пізніше = ніколи. Пресс-сценарій має бути в PR-описі або в файлі `tests/` поряд із SKILL.

## Anti-pattern: «це ж текст, не код»

SKILL.md впливає на runtime-поведінку агента, який ходить у production. Він має проходити ті ж ворота, що й код: TDD-цикл, security scan (Rule #22), lock-файл (SHA-256), code review через `sergeant-review-and-merge`. Текст без верифікації — це гадання.

## Playbooks

- Каталог skill-ів: [`docs/agents/agent-skills-catalog.md`](../../../docs/agents/agent-skills-catalog.md) — додай рядок у таблицю Active Skills.
- Routing-таблиця: [`.agents/skills/sergeant-start-here/SKILL.md`](../sergeant-start-here/SKILL.md) — додай рядок, якщо це новий routing-сценарій.
- Governance rule про безпеку body: [`docs/governance/rules/22-skill-body-security-scan.md`](../../../docs/governance/rules/22-skill-body-security-scan.md).
