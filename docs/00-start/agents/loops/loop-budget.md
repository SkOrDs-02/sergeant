<!-- LIFECYCLE: Active -->

# Loop Budget — Autonomous Agent Workflows

> **Last touched:** 2026-06-29 by @SkOrDs-02. **Next review:** 2026-09-27.
> **Status:** Active
> **Source of truth:** [`registry.yaml`](./registry.yaml) — поля `cost.*`

Token caps per loop, kill switch policy, escalation rules. Цей файл — human-readable mirror `registry.yaml.cost`, плюс operational policy.

## Per-Loop Caps

| Loop                    | Max runs/day | Max tokens/day | Max sub-agents/run | Early exit   |
| ----------------------- | ------------ | -------------- | ------------------ | ------------ |
| `pr-review`             | 96           | 1.5M           | 3                  | **Required** |
| `tech-debt-sweep`       | 4            | 400k           | 2                  | Required     |
| `security-audit`        | 4            | 500k           | 2                  | Required     |
| `migration-guard`       | 24           | 100k           | 1                  | Required     |
| `deploy-watch`          | 96           | 500k           | 2                  | Required     |
| `e2e-flake-watch`       | 24           | 100k           | 1                  | Optional     |
| `review-squad-parallel` | 16           | 800k           | 4                  | **Required** |
| `qa-squad-parallel`     | 16           | 800k           | 4                  | **Required** |
| `council-advisory`      | 8            | 600k           | 4                  | Optional     |
| `planning-batch`        | 8            | 400k           | 4                  | Optional     |

**Загальний monthly ceiling (поточний): 50M tokens.** Збільшення вимагає PR + оновлення цього файлу + Sentry alert threshold.

## Cost Estimation Method

Цифри — **best-effort upper bound**, не виміряні. Sources:

- `apps/web` bundle: 1.2 MB brotli JS ≈ 60-80k tokens на повне завантаження context
- `apps/server` bundle: аналогічно 30-50k tokens
- Skill context: 2-8k tokens per loaded `.agents/skills/*/SKILL.md`
- Sub-agent spawn overhead: ~5-15k tokens на spawn (system prompt + tool discovery)

`registry.yaml.cost.tokens_report` — оцінка для read-only run (фази discover+triage). `tokens_action` — оцінка коли loop доходить до фази fix/verify (тобто реально щось змінює).

**Метрика для верифікації після першого місяця:** Sentry events з тегом `loop-run` → порахувати реальні median cost per loop → оновити таблицю.

## Per-Run Cost (estimated)

| Loop                    | noop | report | action |
| ----------------------- | ---- | ------ | ------ |
| `pr-review`             | 5k   | 80k    | 250k   |
| `tech-debt-sweep`       | 5k   | 60k    | 200k   |
| `security-audit`        | 5k   | 60k    | 300k   |
| `migration-guard`       | 3k   | 30k    | 60k    |
| `deploy-watch`          | 5k   | 50k    | 150k   |
| `e2e-flake-watch`       | 3k   | 35k    | 80k    |
| `review-squad-parallel` | 5k   | 60k    | 400k   |
| `qa-squad-parallel`     | 5k   | 60k    | 400k   |
| `council-advisory`      | 0    | 120k   | 250k   |
| `planning-batch`        | 0    | 50k    | 200k   |

## On Budget Exceed

1. **Pause scheduler** для конкретного loop (через GitHub Actions workflow_dispatch або harness disable).
2. **Append Sentry event** з тегом `loop-budget-exceeded` + loop id + actual spend.
3. **Open incident issue** з label `loop-pause-all` + assign @SkOrDs-02.
4. **Page on-call** якщо loop = `deploy-watch`, `pr-review`, `review-squad-parallel`, `qa-squad-parallel` (high-risk).

Resume — тільки після root-cause analysis і явного unpause через PR.

## Kill Switch

**Глобальний:**

- Відкрити issue з label `loop-pause-all`, призначити @SkOrDs-02.
- Або: `gh workflow disable` для всіх loop-related workflows (`.github/workflows/loop-*.yml`, якщо існують).
- Resume через явний коментар в issue + flip `enabled: true` у `registry.yaml`.

**Per-loop:** те саме, але label `loop-pause-<id>` (наприклад `loop-pause-pr-review`).

## Storage of Run History

Не зберігаємо `loop-run-log.md` як окремий артефакт — натомість:

- **Sentry events** з тегом `loop-run` (id, duration, tokens, outcome) — primary run history.
- **GitHub Actions runs** — per-workflow execution log.
- **PR comments** — для `pr-review` / `review-squad-parallel` / `qa-squad-parallel` результат пишеться як PR comment, що дає audit trail через git history.

Це замінює `STATE.md` + `loop-run-log.md` з reference loop-engineering setup — у нас вже є pr-ledger + freshness dashboard + Sentry для цих потреб.

## Review Cadence

Цей файл переглядається:

- Після першого повного місяця експлуатації будь-якого loop в L2/L3 → реальні median cost замість best-effort.
- Щоквартально — перевірка caps відповідають поточному bundle size та API costs.
- При кожному Hard Rule amendment (Hard Rule #15) — переглянути policy секцію.
