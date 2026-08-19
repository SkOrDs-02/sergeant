---
name: sergeant-review-squad
description: Use for Sergeant PR review touching 3+ governed surfaces — spawns 4 Agent Team reviewers (contract, design, security, docs) in parallel then synthesizes; UA: ревʼю PR через 3+ governed surfaces паралельно.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
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
2. design-reviewer — design tokens, Tailwind, a11y, typography, touch targets (відповідні Hard Rules retired ADR-0081)
3. security-reviewer — Hard Rules #20, #21, #22 (OpenClaw PATs, Pino redaction, SKILL injection)
4. docs-reviewer — Hard Rules #10, #15, #25, #26 (lifecycle markers, Ukrainian, ledger)

Context for all teammates: [вставити номер PR або опис diff]

Ask each teammate to send their findings to the lead when done.
```

Teammates автоматично завантажують CLAUDE.md і project context. Вони можуть писати одне одному через mailbox — наприклад, security-reviewer може запитати у contract-reviewer деталі про підозрілу зміну API.

Точний перелік правил на кожного reviewer-а — канонічно в його власному `description:` у `.claude/agents/<name>.md`. Рядки вище — короткий орієнтир для spawn-у; якщо вони розійшлись із визначенням агента, правда в агента.

## Поза межами цього squad-у (свідомо)

Ці 4 лінзи покривають **коректність, безпеку і governance диффа** — не продуктивність і не поведінку в браузері:

- **Bundle-бюджети і Lighthouse** (JS ≤1.38 MB, CSS ≤40 kB, eager ≤280 kB, LCP ≤3000 ms) — механічні CI-гейти: `size-limit`, `scripts/ci/check-eager-bundle.mjs`, workflow `Lighthouse CI`. Вони блокують мерж самі; reviewer-агент їх не дублює.
- **E2E / Playwright** — окрема поверхня, `sergeant-e2e-testing`.
- **Зелені тести** — `sergeant-qa-squad`, далі `sergeant-verify-before-done`.

Якщо PR свідомо піднімає бюджет — це має бути в описі PR; review-squad перевіряє наявність обґрунтування, а не саме число.

## Synthesis protocol

Після того як всі 4 teammate-и звітували:

1. Агрегуй findings за рівнем ризику:
   - **BLOCKER** → data-loss, contract-break, PAT leak, PII in logs
   - **WARNING** → design violations, docs drift, стилістичні порушення
   - **QUESTION** → slop-тест від `design-reviewer` (структурний сигнал без доведеного дефекту)
2. Якщо є хоч один BLOCKER — PR не мерджити до виправлення.
3. Поверни єдиний consolidated comment зі знахідками, згрупованими за рівнем ризику.

**`QUESTION` не згортай у `WARNING` і не викидай.** Це окрема група з окремою семантикою: WARNING стверджує «тут порушення», QUESTION каже «тут сигнал, на який маєш відповісти ти». Злиття їх коштує обидва боки — або питання читається як дефект і його «фіксять» перефарбуванням, або тоне серед стилістики й на нього ніхто не відповідає. Мерджу QUESTION НЕ блокує; але consolidated comment без цієї групи, коли `design-reviewer` її віддав, — неповний звіт.

## Завжди покривай

- Stage 1 spec-compliance з `sergeant-review-and-merge` має пройти **до** lens-review, не після
- Не підміняй Stage 1 lens-review — вони доповнюють одне одного
- Чекай на звіти **всіх 4** teammate-ів перед synthesis

## Червоні прапорці

- «PR маленький — lens overkill» → lens потрібен коли зачеплено 3+ governed areas, незалежно від розміру diff
- «security-reviewer нічого не знайшов — значить чисто» → перевір, чи він справді прочитав усі changed файли, а не тільки ті, що в назві PR
- «synthesis до того як усі teammate-и відзвітували» → неповний звіт — знахідки будуть пропущені
- «design-reviewer — haiku, він помилиться» → haiku достатній для детермінованих pattern-check-ів (grep на `opacity-[`, `focus:`); якщо сумніваєшся, попроси перечитати конкретний рядок
- «design-reviewer віддав ✅ — значить екран не слоп» → ні. Конвенції, які він чекає, це **гігієна**, а слоп 2026 гігієну проходить. Його slop-тест навмисно віддає `QUESTION`, а не BLOCKER: агент бачить структурний сигнал (сітка однакових карток, чип-скролер без стелі, запис зі скругленням замість краю), але відповісти «чи міг би це видати генератор» має лід, не haiku

## Playbooks

- [`docs/00-start/playbooks/run-squad-review.md`](../../../docs/00-start/playbooks/run-squad-review.md) — step-by-step рецепт запуску review squad
- [`docs/04-governance/governance/review-checklist.md`](../../../docs/04-governance/governance/review-checklist.md) — governance checklist (Stage 1 spec-compliance)
- [`docs/00-start/agents/agent-skills-catalog.md`](../../../docs/00-start/agents/agent-skills-catalog.md) — каталог всіх skills
