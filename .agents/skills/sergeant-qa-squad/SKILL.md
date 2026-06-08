---
name: sergeant-qa-squad
description: Use when running full QA across all Sergeant surfaces — spawns qa-server, qa-web, qa-mobile, qa-openclaw as Agent Team in parallel and synthesizes per-surface results; UA: повний QA по всіх surfaces.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# QA squad для повного coverage

Цей skill запускає 4 QA агентів паралельно — кожен тестує одну surface незалежно. Дає per-surface видимість (яка саме surface зламалась?), чого не дає `pnpm check` як агрегований pass/fail.

## Коли завантажувати

Завантажуй коли:
- Перед великим release — потрібен детальний звіт по кожній surface, а не лише агрегований pass/fail
- Після великого рефактора — потрібно знати яка surface зламалась і чому
- CI зеленіє, але потрібен детальний аналіз по surfaces
- Після merge кількох PR-ів паралельно — чи не поламали вони одне одного?

**Для звичайного pre-PR check** — `pnpm check` достатньо. QA squad для ситуацій де потрібна per-surface видимість.

## Spawn рецепт

**Варіант 1 — Agent Team (рекомендований):**

```
Create an agent team for full QA across all Sergeant surfaces.
Spawn 4 teammates using these subagent definitions:
1. qa-server — runs apps/server tests and typecheck
2. qa-web — runs apps/web tests and typecheck
3. qa-mobile — runs apps/mobile unit tests and typecheck
4. qa-openclaw — runs tools/openclaw tests and typecheck

All surfaces run independently. Ask each to report to the lead when done.
```

**Варіант 2 — паралельні subagents через Task tool:**

```
Use the qa-server, qa-web, qa-mobile, and qa-openclaw subagent definitions.
Run all 4 in parallel via the Task tool. Collect all reports before synthesizing.
```

## Synthesis protocol

Після отримання звітів від усіх 4 поверхонь:

1. Загальний статус: `🟢 All surfaces green` або `🔴 Failures in: [список surfaces]`
2. Таблиця per-surface:

| Surface  | Tests       | Typecheck | Failures |
|----------|-------------|-----------|----------|
| server   | 42/42 ✅    | ✅ clean  | none     |
| web      | 38/40 ❌    | ✅ clean  | 2 failed |
| mobile   | 15/15 ✅    | ✅ clean  | none     |
| openclaw | 16/16 ✅    | ✅ clean  | none     |

3. Failure details: назва тесту + файл + коротка причина

## Завжди покривай

- Всі 4 surfaces — навіть якщо зачеплено лише одну
- Typecheck + tests для кожної surface (обидва)
- Synthesis тільки після отримання **всіх 4** звітів

## Червоні прапорці

- «Тільки web зачеплена — навіщо перевіряти server» → ізольовані failures на незачеплених surfaces — це корисна інформація; QA squad недорогий
- «CI green = QA done» → CI дає агрегований pass/fail; squad дає per-surface аналіз і failure деталі
- «Detox E2E не запустився — mobile failed» → qa-mobile запускає unit tests, не detox; E2E потребує device і є окремим процесом
- «Synthesis перед тим як mobile-agent відповів» → неповний звіт, mobile failures будуть пропущені

## Playbooks

- [`docs/00-start/playbooks/run-squad-qa.md`](../../../docs/00-start/playbooks/run-squad-qa.md) — step-by-step рецепт
- [`docs/00-start/playbooks/fix-failing-ci.md`](../../../docs/00-start/playbooks/fix-failing-ci.md) — якщо QA squad виявив failures
- [`docs/00-start/agents/agent-skills-catalog.md`](../../../docs/00-start/agents/agent-skills-catalog.md) — каталог всіх skills
