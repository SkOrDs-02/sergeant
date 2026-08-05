---
name: sergeant-qa-squad
description: Use when running full QA across all Sergeant surfaces — spawns qa-server, qa-web (incl. landing), qa-mobile, qa-packages in parallel and synthesizes per-surface results; UA: повний QA по всіх surfaces.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# QA squad для повного coverage

Цей skill запускає **4 QA агентів** паралельно — кожен тестує одну surface незалежно. Дає per-surface видимість (яка саме surface зламалась?), чого не дає `pnpm check` як агрегований pass/fail.

**Покриття — усі 17 workspace-ів:** `qa-server` (apps/server), `qa-web` (apps/web **+ apps/landing**), `qa-mobile` (apps/mobile + apps/mobile-shell), `qa-packages` (11 пакетів із тестами). `packages/eslint-plugin-sergeant-design` не має `test`-скрипта — звітується як **not run**, ніколи як passed.

> **Чому `qa-packages` окремо.** Contract-тести `packages/api-client` — це рантайм-доказ Hard Rule #3. Без цього runner-а вони виконувались лише всередині агрегованого `pnpm check`, тож поламаний контракт був невидимий для per-surface QA. Failure у `shared` чи `*-domain` зазвичай **пояснює** одночасний червоний у web і mobile — синтез має називати причину, а не чотири симптоми.

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
1. qa-server   — runs apps/server tests and typecheck
2. qa-web      — runs apps/web AND apps/landing tests and typecheck
3. qa-mobile   — runs apps/mobile + apps/mobile-shell unit tests and typecheck
4. qa-packages — runs the 11 packages/* workspaces, incl. api-client contract tests

All surfaces run independently. Ask each to report to the lead when done.
```

**Варіант 2 — паралельні subagents через subagent-механізм твого харнесу (Claude Code: `Agent` tool):**

```
Use the qa-server, qa-web, qa-mobile, and qa-packages subagent definitions.
Run all 4 in parallel as subagents (Claude Code: via the Agent tool). Collect all reports before synthesizing.
```

## Synthesis protocol

Після отримання звітів від усіх 4 поверхонь:

1. Загальний статус: `🟢 All surfaces green` або `🔴 Failures in: [список surfaces]`
2. Таблиця per-surface:

| Surface      | Tests    | Typecheck | Failures |
| ------------ | -------- | --------- | -------- |
| server       | 42/42 ✅ | ✅ clean  | none     |
| web          | 38/40 ❌ | ✅ clean  | 2 failed |
| landing      | 6/6 ✅   | ✅ clean  | none     |
| mobile       | 15/15 ✅ | ✅ clean  | none     |
| mobile-shell | 8/8 ✅   | ✅ clean  | none     |
| packages     | 91/93 ❌ | ✅ clean  | 2 failed |

3. Failure details: назва тесту + файл + коротка причина
4. **Причинність перед симптомами.** Якщо `qa-packages` червоний, спершу перевір, чи не він пояснює падіння в app-поверхнях (shared / `*-domain` — upstream для web і mobile). Звіт має вести до однієї першопричини, а не до чотирьох окремих задач.

## Завжди покривай

- Всі 4 surfaces — навіть якщо зачеплено лише одну
- Typecheck + tests для кожної surface (обидва)
- Synthesis тільки після отримання **всіх 4** звітів
- Явно назви те, що **не** запускалось (Detox E2E, `eslint-plugin-sergeant-design` без тестів, web e2e/Playwright) — «не запускали» і «пройшло» не мають виглядати однаково

## Червоні прапорці

- «Тільки web зачеплена — навіщо перевіряти server» → ізольовані failures на незачеплених surfaces — це корисна інформація; QA squad недорогий
- «CI green = QA done» → CI дає агрегований pass/fail; squad дає per-surface аналіз і failure деталі
- «Detox E2E не запустився — mobile failed» → qa-mobile запускає unit tests, не detox; E2E потребує device і є окремим процесом
- «Synthesis перед тим як qa-mobile відповів» → неповний звіт, mobile failures будуть пропущені
- «packages не чіпали — пропустимо `qa-packages`» → саме там живуть contract-тести Hard Rule #3; вони ловлять дрейф, спричинений змінами в server/web, а не в самому пакеті
- «landing тривіальний» → тому й гниє непоміченим; дві його лінійки в звіті коштують нічого

## Поза межами цього squad-у

QA squad — це **tests + typecheck**. Він НЕ покриває: web e2e/Playwright (→ `sergeant-e2e-testing`), Detox (потрібен девайс), bundle-бюджети і Lighthouse (→ CI-гейти `size-limit` / `check-eager-bundle.mjs` / `Lighthouse CI`, див. `sergeant-deploy-and-observability`), відповідність Hard Rules у дифі (→ `sergeant-review-squad`). Якщо потрібне «зелено перед звітом про готовність» — фінальний гейт це `sergeant-verify-before-done`, не цей squad.

## Playbooks

- [`docs/00-start/playbooks/run-squad-qa.md`](../../../docs/00-start/playbooks/run-squad-qa.md) — step-by-step рецепт
- [`docs/00-start/playbooks/fix-failing-ci.md`](../../../docs/00-start/playbooks/fix-failing-ci.md) — якщо QA squad виявив failures
- [`docs/00-start/agents/agent-skills-catalog.md`](../../../docs/00-start/agents/agent-skills-catalog.md) — каталог всіх skills
