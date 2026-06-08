---
name: sergeant-review-squad
description: Use for Sergeant PR review touching 3+ governed surfaces — spawns 4 Agent Team reviewers (contract, design, security, docs) in parallel then synthesizes; UA: ревʼю PR через 3+ governed surfaces паралельно.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Review squad для Sergeant PRs

Цей skill запускає команду з чотирьох паралельних reviewer-ів, кожен з яких перевіряє конкретну governance-зону. Замість одного агента, що читає diff зверху донизу і втрачає увагу — 4 незалежних рецензенти + synthesis.

## Коли завантажувати

Завантажуй цей skill коли PR:
- Торкається ≥3 governed surfaces (наприклад: SQL migration + server serializer + web UI + SKILL.md одночасно)
- Надходить від стороннього contributor-а або після тривалого відгалуження від `main`
- Передує critical release або слідує після великого рефактора

**Не завантажуй** для single-surface PR-ів — там достатньо `sergeant-review-and-merge`.

## Spawn рецепт

Переконайся, що `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` вже є у `.claude/settings.json`. Потім запусти:

```
Create an agent team to review this PR.
Spawn 4 teammates using these subagent definitions:
1. contract-reviewer — Hard Rules #1, #3, #4 (bigint coercion, API triplet, migrations)
2. design-reviewer — Hard Rules #8, #9, #11-14, #16, #17 (Tailwind, a11y, typography)
3. security-reviewer — Hard Rules #20, #21, #22 (OpenClaw PATs, Pino redaction, SKILL injection)
4. docs-reviewer — Hard Rules #10, #15, #25, #26 (lifecycle markers, Ukrainian, ledger)

Context for all teammates: [вставити номер PR або опис diff]

Ask each teammate to send their findings to the lead when done.
```

Teammates автоматично завантажують CLAUDE.md і project context. Вони можуть писати одне одному через mailbox — наприклад, security-reviewer може запитати у contract-reviewer деталі про підозрілу зміну API.

## Synthesis protocol

Після того як всі 4 teammate-и звітували:

1. Агрегуй findings за рівнем ризику:
   - **BLOCKER** → data-loss, contract-break, PAT leak, PII in logs
   - **WARNING** → design violations, docs drift, стилістичні порушення
2. Якщо є хоч один BLOCKER — PR не мерджити до виправлення.
3. Поверни єдиний consolidated comment зі знахідками, згрупованими за рівнем ризику.

## Завжди покривай

- Stage 1 spec-compliance з `sergeant-review-and-merge` має пройти **до** lens-review, не після
- Не підміняй Stage 1 lens-review — вони доповнюють одне одного
- Чекай на звіти **всіх 4** teammate-ів перед synthesis

## Червоні прапорці

- «PR маленький — lens overkill» → lens потрібен коли зачеплено 3+ governed areas, незалежно від розміру diff
- «security-reviewer нічого не знайшов — значить чисто» → перевір, чи він справді прочитав усі changed файли, а не тільки ті, що в назві PR
- «synthesis до того як усі teammate-и відзвітували» → неповний звіт — знахідки будуть пропущені
- «design-reviewer — haiku, він помилиться» → haiku достатній для детермінованих pattern-check-ів (grep на `opacity-[`, `focus:`); якщо сумніваєшся, попроси перечитати конкретний рядок

## Playbooks

- [`docs/00-start/playbooks/run-squad-review.md`](../../../docs/00-start/playbooks/run-squad-review.md) — step-by-step рецепт запуску review squad
- [`docs/governance/review-checklist.md`](../../../docs/governance/review-checklist.md) — governance checklist (Stage 1 spec-compliance)
- [`docs/00-start/agents/agent-skills-catalog.md`](../../../docs/00-start/agents/agent-skills-catalog.md) — каталог всіх skills
