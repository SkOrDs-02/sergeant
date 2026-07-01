<!-- LIFECYCLE: Active -->

# Loop Budget — Autonomous Agent Workflows

> **Last touched:** 2026-07-01 by @claude. **Next review:** 2026-09-29.
> **Status:** Active
> **Source of truth:** [`registry.yaml`](./registry.yaml) — поля `cost.*`

Token caps per loop, kill switch policy, escalation rules. Цей файл — human-readable mirror `registry.yaml.cost`, плюс operational policy.

> **2026-07-01:** додано per-run brakes (`max_turns`, `max_budget_usd`, `circuit_breaker`, `heartbeat_required` у `registry.yaml.cost`) — прогалина знайдена при звірці з "loop engineering" oglядовою статтею (runaway $47k/11-day інцидент з індустрії). Aggregate daily/monthly caps нижче не зупиняють один runaway run _до_ того, як він вичерпає денний бюджет за хвилини — ці поля закривають той проміжок. Див. § Per-Run Brakes, § Dead-man's Heartbeat, § Four Failure Modes.

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

## Per-Run Brakes

Daily/monthly caps вище — aggregate ceiling. Вони не заважають **одному** run проскочити крізь весь денний бюджет за один прохід, якщо той run застряг у циклі (два агенти запитують один одного про більше роботи, retry-loop без backoff тощо). Per-run brakes — hard stop на рівні одного run, незалежно від aggregate budget:

| Loop                    | `max_turns` | `max_budget_usd` | `circuit_breaker`         |
| ----------------------- | ----------- | ---------------- | ------------------------- |
| `pr-review`             | 35          | $8               | same tool+args × 3 → halt |
| `tech-debt-sweep`       | 25          | $5               | same tool+args × 3 → halt |
| `security-audit`        | 25          | $5               | same tool+args × 3 → halt |
| `migration-guard`       | 15          | $2               | same tool+args × 3 → halt |
| `deploy-watch`          | 25          | $5               | same tool+args × 3 → halt |
| `e2e-flake-watch`       | 15          | $2               | same tool+args × 3 → halt |
| `review-squad-parallel` | 50          | $15              | same tool+args × 3 → halt |
| `qa-squad-parallel`     | 50          | $15              | same tool+args × 3 → halt |
| `council-advisory`      | 35          | $8               | same tool+args × 3 → halt |
| `planning-batch`        | 25          | $5               | same tool+args × 3 → halt |

Значення — per sub-agent run (не сума fan-out). Для loops із `max_sub_agents_per_run` > 1 (`registry.yaml.cost` не містить цього поля напряму — див. `max sub-agents/run` у таблиці "Per-Loop Caps" вище) множник тримає aggregate cap як остаточну стелю; per-run brake ловить один вихід з-під контролю до того, як daily cap встигне це помітити.

`max_turns` мапиться на `--max-turns` (Claude Code) / рівнозначний turn-limit параметр в Codex automation config. `max_budget_usd` мапиться на `--max-budget-usd` в print-mode виклику або еквівалентний per-thread ceiling у Codex Automations. `circuit_breaker` — не нативний прапорець жодного з харнесів; реалізується в runner/wrapper-скрипті навколо кожного loop run (лічильник останніх N tool calls, порівняння tool+args, hard-abort при збігу).

**Значення estimated, не виміряні** — та сама caveat, що й для aggregate cost estimation method вище. Переглянути після першого місяця реальних Sentry `loop-run` даних.

## Dead-man's Heartbeat

Loops з `heartbeat_required: true` (`pr-review`, `migration-guard`, `deploy-watch`) — high risk і/або high cadence (5-15m або per-PR на критичному шляху типу DB DROP) — мають писати heartbeat щоразу, коли run стартує і коли завершується:

1. Кожен run пише Sentry event з тегом `loop-heartbeat` (loop id, run id, phase, timestamp) на старті й на кожній зміні фази.
2. Якщо heartbeat не приходить довше 2× cadence loop-а (наприклад >30m для loop з cadence 15m) — це "тиха смерть": run застряг (переповнений контекст, hung tool call, retry без backoff), а не завершився штатно. Сигнал відрізняється від "run просто нічого не знайшов" (той завершується і закриває heartbeat).
3. Мовчання довше порогу → Sentry alert (tag `loop-heartbeat-silent`) → page on-call за тим самим routing, що й `loop-budget-exceeded` нижче.

Loops з `heartbeat_required: false` (решта 7, включно з `e2e-flake-watch`) — низький risk або batch/per-decision cadence (немає "continuous background" очікування) — heartbeat необов'язковий; aggregate daily cap + PR-comment audit trail (§ Storage of Run History) достатньо.

## Four Failure Modes

Чек-лист для дизайну нового loop або ревʼю existing — кожен loop має явно назвати, який brake ловить який failure mode (порожня клітинка = прогалина, яку треба закрити перед enable в L2/L3):

| Failure mode           | Симптом                                                              | Brake, що ловить                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runaway recursion**  | Два агенти нескінченно просять одне в одного більше роботи           | `max_turns` + `max_budget_usd` (per-run hard stop)                                                                                                            |
| **Silent death**       | Run завис (context exhausted, hung retry) але виглядає живим         | Dead-man's heartbeat (§ вище)                                                                                                                                 |
| **Random walk**        | Немає verifiable stop condition — loop дрейфує від цілі, а не до неї | Explicit gate/goal contract per loop (§ Human Gates у LOOP.md) + maker/checker split (review-squad, qa-squad, council) замість self-graded "виглядає готовим" |
| **Comprehension debt** | Diff зростає швидше, ніж людина встигає його розуміти                | Human-read gate — жоден loop не має права merge без review; L1→L3 phased rollout (LOOP.md) тримає early loops report-only                                     |

`circuit_breaker` (same tool+args × 3 → halt) — додатковий сигнал саме для runaway recursion: ловить вужчий, але дешевший-у-детекції випадок, коли агент буквально повторює той самий виклик, а не просто "багато робить".

## On Budget Exceed

Той самий playbook застосовується і при спрацюванні per-run brakes (`max_turns`/`max_budget_usd` hit, `circuit_breaker` halt, чи heartbeat silence) — це просто інший тригер того самого incident flow, не окрема процедура:

1. **Pause scheduler** для конкретного loop (через GitHub Actions workflow_dispatch або harness disable).
2. **Append Sentry event** з відповідним тегом — `loop-budget-exceeded` (aggregate cap), `loop-circuit-breaker-tripped` (same tool+args × 3), або `loop-heartbeat-silent` (dead-man's switch) — + loop id, run id, actual spend/turns.
3. **Open incident issue** з label `loop-pause-all` + assign @SkOrDs-02.
4. **Page on-call** якщо loop = `deploy-watch`, `pr-review`, `review-squad-parallel`, `qa-squad-parallel` (high-risk) — або будь-який loop із `heartbeat_required: true` при `loop-heartbeat-silent`.

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
