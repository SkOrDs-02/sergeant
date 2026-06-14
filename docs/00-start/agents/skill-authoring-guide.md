# Skill Authoring Guide — `references/` convention

> **Last validated:** 2026-06-14 by Claude. **Next review:** 2026-09-12.
> **Status:** Active

Канонічна конвенція для reference-файлів усередині repo-owned skill-ів (`.agents/skills/<slug>/references/`). Мета — щоб 3-tier progressive disclosure не дрейфував між скілами (один скіл — `references/{prefix}-*.md`, інший — `refs/*.md`), а формат був машинно-перевірюваним. Запозичено з [`agentskills.io`](https://agentskills.io/) open standard і [`anthropics/skills`](https://github.com/anthropics/skills) (§ «Anatomy of a Skill»).

## Коли виносити деталі в `references/`

`SKILL.md` — це **tier 1**: завжди прочитаний агентом, тримай його стислим (орієнтир ≤ 500 рядків) і дій-орієнтованим. Коли скіл накопичує довгі довідкові блоки (SQL-патерни, селектор-ієрархії, чеклісти), які потрібні **не на кожній** задачі, винеси їх у **tier 2** — окремі файли в `references/`, на які `SKILL.md` посилається. Агент підвантажує їх лише за потреби.

Не створюй `references/`, якщо весь корисний зміст уміщається в стислий `SKILL.md` — порожня тека або файл-заглушка лише шумлять.

## Naming

- `references/{prefix}-{name}.md`, де `{prefix}` групує спорідненні теми.
- Приклади з `sergeant-data-and-migrations`: `query-`, `schema-`, `data-`, `lock-`, `monitor-`. З `sergeant-e2e-testing`: тематичні імена (`selectors.md`, `auth-flow.md`).
- Lowercase, kebab-case, без пробілів.

## Обов'язковий frontmatter (enforced)

Кожен `references/*.md` починається YAML-блоком із чотирма полями:

```yaml
---
title: Index Every Foreign Key Column
impact: CRITICAL
impactDescription: Postgres indexes PRIMARY KEY and UNIQUE columns automatically, but never foreign-key columns.
tags: [postgres, schema, indexes, foreign-keys]
---
```

- `title` — людиночитабельний заголовок (non-empty).
- `impact` — рівень із **закритого набору**: `CRITICAL`, `HIGH`, `MEDIUM-HIGH`, `MEDIUM`, `LOW-MEDIUM`, `LOW`.
- `impactDescription` — один рядок: чому це болить, якщо проігнорувати.
- `tags` — непорожній список `[a, b, c]`.

Це перевіряє `scripts/check-skill-shape.mjs` у складі `pnpm lint:skills` — невалідний `impact` або відсутнє поле валять гейт.

## Body

Структура для performance/anti-pattern reference-файлів:

1. Короткий вступ — у чому проблема.
2. **Incorrect** приклад (код/SQL) + пояснення, чому погано.
3. **Correct** приклад + пояснення, чому добре.
4. Опційна `## Sergeant-specific note` — як патерн лягає на наші інваріанти (kopiykas `bigint`, Better Auth `user_id` як `text`, Europe/Kyiv day buckets, raw `pg`).
5. Якщо адаптовано із зовнішнього джерела (MIT тощо) — рядок атрибуції.

Зразок «як треба» — [`sergeant-e2e-testing/references/selectors.md`](../../../.agents/skills/sergeant-e2e-testing/references/selectors.md) (Incorrect → Correct → Sergeant note).

## Enforcement

- **Shape:** `scripts/check-skill-shape.mjs` (через `pnpm lint:skills`) валідує frontmatter кожного `references/*.md`. Скіли без теки `references/` — валідні (поле опційне).
- **Lock:** `.agents/skills-lock.json` наразі хешує лише `SKILL.md` кожного скілу, **не** вміст `references/`. Тобто правка лише reference-файлу не змінює lock-хеш. Розширення lock на всю директорію скілу — окремий follow-up (трекається в `skills-evolution-roadmap.md`).

## See also

- [`agent-skills-catalog.md`](./agent-skills-catalog.md) — routing-таблиця repo-owned skill-ів.
- [`skills-evolution-roadmap.md`](./skills-evolution-roadmap.md) — PR 6 (ця конвенція) + PR 3 (перший набір Postgres references).
- [`sergeant-e2e-testing/references/`](../../../.agents/skills/sergeant-e2e-testing/references) — приклади за цією конвенцією (Playwright). Набір `sergeant-data-and-migrations/references/` (9 Postgres reference-файлів) додається в PR 3.
