# Playbook: Author or Edit a SKILL.md

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Active

**Trigger:** «Створи новий `.agents/skills/<slug>/SKILL.md`» / «зміни правила або приклади в існуючому SKILL» / «заархівуй skill» / правка будь-якого файлу під `.agents/skills/**`.

## Owner surface

- Primary surface: `.agents/skills/<slug>/SKILL.md`
- Coupled surface: `.agents/skills-lock.json`, `docs/00-start/agents/agent-skills-catalog.md`, `.agents/skills/sergeant-start-here/SKILL.md`
- Governing skill: `sergeant-writing-skills`

---

## Контекст

SKILL.md — це не проза, а інструкція, яку агент виконує **verbatim** у production. Тому правка SKILL проходить ті самі ворота, що й код: TDD-цикл, security-scan (Hard Rule #22), lock-файл (SHA-256), code review. Текст без верифікації — це гадання.

**Core principle:** якщо ти не побачив, як агент порушує правило **без** твого skill, ти не знаєш, чи новий skill реально щось виправляє. Спершу пресс-сценарій (тест), потім текст skill (production code), потім перевірка, що поведінка агента справді змінилась.

Завантаж skill `sergeant-writing-skills` перед роботою — цей плейбук дає порядок виконання, а граматику й anti-patterns тримає сам skill.

---

## Decision Tree

**Q1: Який тип зміни?**

- Новий `.agents/skills/<slug>/SKILL.md` → повний цикл [§1 RED](#1-red--пресс-сценарій-без-skill) → [§2 GREEN](#2-green--мінімальний-skill) → [§3 перевірка](#3-перевірка-на-чистій-сесії) → [§4 REFACTOR](#4-refactor--закрити-обхідні-шляхи) → [§5 реєстрація](#5-реєстрація--lock--каталог)
- Поведінкова правка (зміна правил/прикладів існуючого SKILL) → pressure-test поточної версії ([§1](#1-red--пресс-сценарій-без-skill)) + після правки ([§3](#3-перевірка-на-чистій-сесії)) → [§5](#5-реєстрація--lock--каталог)
- Чисто косметична правка (typo, форматування, посилання) → одразу [§5](#5-реєстрація--lock--каталог) (`lint:skills` + `skills:lock`)
- Видалення/архівація skill → маркер `@deprecated` + рядок у «Deprecated → Replacement» каталогу + [§5](#5-реєстрація--lock--каталог)

**Q2: Чи це взагалі має бути SKILL?**

- Описує загальну добру практику, не специфічну для Sergeant → **STOP** → це блог, не SKILL. Generic-обгортки заборонені (`sergeant-start-here` § Політика generic-skill-ів).
- Адресує конкретну раціоналізацію, якою агент **порушує** правило саме в цьому репо → пиши.

---

## Steps

### 1. RED — пресс-сценарій без skill

Сформулюй конкретну задачу, де очікувана поведінка відрізняється від generic-defaults агента. Прогони її на свіжій сесії **без** нового SKILL і запиши дослівно:

- Точний промпт, який ти дав.
- Точні раціоналізації, якими агент порушує правило («міграція проста, схему не дробимо», «inline RQ key один раз — нормально», «`bigint` сам відсеріалізується»).
- Команди/edits, які він зробив.

Це і є failing test. Якщо агент **уже** робить правильно без SKILL — skill не потрібен, не пиши.

### 2. GREEN — мінімальний SKILL

Напиши найменший skill, що адресує **саме ті** раціоналізації з RED. Граматика (її валідує `pnpm lint:skills` через `check-skill-shape.mjs`):

- Frontmatter `---` з `name` (= slug папки), `description` ≤ 220 символів з UA-тригером (`; UA: …`), `lang: en`, `lang-reason`.
- Body — EN, заземлений у конкретних шляхах (`apps/`, `packages/`, `scripts/`, `docs/`, `.agents/`) або `pnpm`-командах.
- Мінімум один лінк на playbook у `docs/00-start/playbooks/` або на `docs/00-start/agents/agent-skills-catalog.md`.
- Контр-приклади, не «загальна освіта». Жодних injection-/exfiltration-патернів — `check-skill-body-security.mjs` ловить 7 категорій загроз (Hard Rule #22).

### 3. Перевірка на чистій сесії

Перезапусти ту саму задачу з RED-фази на свіжій сесії, де новий SKILL завантажується (через `sergeant-start-here` routing). Запиши:

- Чи агент більше не дає тих самих раціоналізацій.
- Чи фінальний diff відповідає правильній поведінці.
- Якщо ні — повернись у RED, додай контр-приклад у SKILL.

### 4. REFACTOR — закрити обхідні шляхи

Прожени 2-3 варіації пресс-сценарію (інший формат промпта, інший surface, інший рівень тиску на «зроби швидко»). Знайшов нову раціоналізацію — додай у SKILL і повтори §3. Готово, коли 3 послідовні варіації не ламають поведінку.

### 5. Реєстрація — lock + каталог

Кожен дотик до SKILL вимагає регенерації lock-у і синку каталогів:

```bash
pnpm lint:skills            # shape + lock SHA-256 + security scan
pnpm skills:lock            # регенерує SHA-256 після свідомої зміни вмісту
pnpm lint:discoverability   # нові доки досяжні з AGENTS.md ≤ 2 hops
```

Якщо додав **новий** skill — додай рядок у таблицю Active Skills у `docs/00-start/agents/agent-skills-catalog.md` і, якщо це новий routing-сценарій, у роутинг-таблицю `.agents/skills/sergeant-start-here/SKILL.md`. Без оновленого lock-у CI (`skill-freshness.yml`) падає з посиланням на `pnpm skills:lock`.

---

## Verification

- [ ] Є записаний RED-сценарій (реальний промпт + реальні раціоналізації), а не вигаданий у голові.
- [ ] Frontmatter валідний: `name` = slug, `description` ≤ 220 з `; UA:` тригером, `lang: en`, `lang-reason`.
- [ ] Body заземлений у конкретних шляхах/`pnpm`-командах і лінкує ≥1 playbook або каталог.
- [ ] Перевірка на чистій сесії показала зміну поведінки (§3); 3 варіації REFACTOR не зламали її.
- [ ] `pnpm lint:skills` зелений (shape + security scan, Hard Rule #22).
- [ ] `pnpm skills:lock` перегенеровано; `.agents/skills-lock.json` у diff-і.
- [ ] Новий skill доданий у Active Skills каталог (+ routing-таблицю за потреби); `pnpm lint:discoverability` зелений.

## Notes

- «Додам приклад тестування пізніше» = ніколи. Пресс-сценарій має бути в PR-описі або у файлі `tests/` поряд зі SKILL.
- «Розшир skill — буде більш generic» → ні. Generic browser/design/planning-обгортки в Sergeant заборонені.
- Косметична правка теж зсуває SHA-256 — `pnpm skills:lock` обовʼязковий навіть для typo, інакше CI червоний.
- Створення SKILL вимагає RED-GREEN дисципліни з `sergeant-bugfix-and-regression` і Verification gate з `sergeant-review-and-merge`.

## See also

- [AGENTS.md](../../../AGENTS.md) — Hard Rule #22 (skill body security scan)
- [docs/04-governance/governance/rules/22-skill-body-security-scan.md](../../04-governance/governance/rules/22-skill-body-security-scan.md) — 7 категорій загроз
- [docs/00-start/agents/agent-skills-catalog.md](../agents/agent-skills-catalog.md) — додай рядок у Active Skills
- `.agents/skills/sergeant-writing-skills/SKILL.md` — граматика, anti-patterns, червоні прапорці
