# RAG eval harness — golden-set, metrics, baseline comparison

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

> Canonical reference for the RAG quality-eval pipeline shipped as **PR-20**
> (eval harness — golden-set, P@1 / MRR) and consumed by **PR-22** (weekly
> quality gate with auto-disable). Pointer у [`AGENTS.md`](../../AGENTS.md)
> та у runbook ([`docs/observability/runbook.md`](../observability/runbook.md)
> § `RagQualityGateDegraded` / `RagQualityGateKillSwitch`). Deep prose тут.

## Що це

Harness вимірює якість RAG-retrieval-у поверх `ai_memory` модуля (Voyage
embeddings + pgvector). Складається з трьох частин:

1. **Golden-set** — 50 curated queries з expected memory refs у топ-K
   (`apps/server/src/__fixtures__/rag-eval/golden.json`).
2. **Metric module** — pure-math functions (`recallAtK`, `precisionAt1`,
   `reciprocalRank`, `aggregateMetrics`) у
   [`apps/server/src/lib/ragEval/recall.ts`](../../apps/server/src/lib/ragEval/recall.ts).
3. **CLI** — [`scripts/eval-rag-recall.mjs`](../../scripts/eval-rag-recall.mjs)
   (alias `pnpm eval:rag`). Виводить JSON summary + exit-code (0=pass, 1=warn,
   2=kill, 3=error).

PR-22 cron (`.github/workflows/rag-quality-gate.yml`) запускає CLI weekly
й opens issue + Sentry-alert при degradation. Day-60 decision-point: якщо
recall@4 < 0.4 → kill module (set `AI_MEMORY_ENABLED=false` на Railway).

## Golden-set — структура та curation

```jsonc
{
  "version": "2.0",
  "embeddingModel": "voyage-3.5-lite",
  "embeddingVersion": "1",
  "topK": 4,
  "queries": [
    {
      "id": "finyk-001", // <domain>-NNN (стабільний)
      "domain": "finyk", // ALLOWED_MEMORY_SOURCES enum
      "query": "Скільки я витратив на каву минулого тижня?",
      "expected_memory_ids": [
        // <source>:<sourceRef>
        "finyk:tx-coffee-w17-001",
        "finyk:tx-coffee-w17-002",
      ],
    },
  ],
}
```

### Чому `<source>:<sourceRef>`, а не raw `ai_memories.id`?

`ai_memories.id` — це `BIGSERIAL` Postgres. Послідовність ламається на
re-seed local DB / fresh staging. `<source>:<sourceRef>` — стабільний
business-level reference (наприклад, `finyk:tx-coffee-w17-001` →
"transaction with sourceRef `tx-coffee-w17-001` у source `finyk`"). Це
дозволяє golden-set жити через re-seeds і staging refreshes.

### 50 queries — domain breakdown

Distribution по 8 доменах із `ALLOWED_MEMORY_SOURCES`
(`apps/server/src/modules/ai-memory/types.ts`):

| Domain      | Count | Сценарії (паралель до Telegram-патернів founder-а)                                                |
| ----------- | ----- | ------------------------------------------------------------------------------------------------- |
| `finyk`     | 8     | "скільки витратив на каву", "топ-3 категорії за квітень", "subscription-и", "перевищення бюджету" |
| `fizruk`    | 8     | "PR жим лежачи", "км за місяць", "обʼєм тренувань", "streak", "RPE", "split push/pull/legs"       |
| `nutrition` | 8     | "калорії сьогодні", "середній протеїн", "calorie deficit", "макроси сніданку", "гідратація"       |
| `routine`   | 7     | "час підйому", "habit streak", "skipped routines", "morning ritual"                               |
| `journal`   | 6     | "що писав 1 квітня", "теми минулого тижня", "stress mentions"                                     |
| `digest`    | 5     | "weekly digest 2026-W18", "monthly summary", "trends"                                             |
| `chat`      | 4     | "що я питав про RAG", "previous discussion about budget"                                          |
| `cofounder` | 4     | "milestones with X", "next steps with Y"                                                          |

Curation guideline: queries — natural Ukrainian / mixed-language phrasing
(як founder реально пише у Telegram), 5-15 слів. Кожна query має 1-5
expected refs. Empty `expected_memory_ids` заборонене Zod-validation-ом
([`apps/server/src/lib/ragEval/golden.ts`](../../apps/server/src/lib/ragEval/golden.ts)).

### Як додати нову query

1. Вибери domain із `ALLOWED_MEMORY_SOURCES`.
2. Згенеруй stable id: `<domain>-NNN` (sequential — глянь max NNN у файлі).
3. Згенеруй stable expected refs: `<domain>:<sourceRef>` де `sourceRef` —
   business-level identifier (transaction ref, digest period, journal day).
4. Додай у `queries[]` блок. Pre-commit lint validates Zod schema.
5. Запусти `pnpm eval:rag` локально — у mock-mode query повинна давати
   recall@4 = 1.0 (sanity).

## Метрики

Три метрики обчислюються per-query, потім aggregate-яться (mean / min / p50).

### Recall@K

```
recall@K(q) = |retrieved[0..K] ∩ expected| / |expected|
```

Membership-based: порядок не важливий. Це **primary signal** для
quality-gate (PR-22 thresholds: warn=0.5, kill=0.4). K=4 узгоджено з
production `env.AI_MEMORY_RAG_TOP_K`.

### Precision@1

```
P@1(q) = 1 якщо retrieved[0] ∈ expected else 0
```

Binary, найстрогіша метрика — "чи топ-1 result релевантний". Чутлива до
ranking quality на vegane top. Зростання P@1 при стабільному recall@4 —
означає purer ranking.

### Reciprocal Rank (RR) → MRR

```
RR(q) = 1 / rank_of_first_hit  (1-indexed, 0 якщо немає hit-у)
MRR   = mean(RR) across queries
```

Position-sensitive: hit на позиції 1 → RR=1, на 2 → RR=0.5, на 4 → RR=0.25.
MRR падає швидше за recall@K при погіршенні ranking-у (не лише membership-у).

### Чому три метрики

- **Recall@4** ловить **misses** — "expected item взагалі не повернувся у
  top-4".
- **P@1** ловить **ranking-noise** — "top-1 != relevant" (релевант таки є у
  top-4, але не на 1-й позиції).
- **MRR** усереднює **average rank** — корисно для регрес-тестів типу "ми
  поміняли scoring formula, чи purer тепер ranking".

PR-22 quality-gate consume-є **тільки recall@4** для status decision
(warn/kill); P@1 та MRR — observability (per-PR baseline comparison).

## CLI — modes та exit codes

```
pnpm eval:rag                                       # mock, defaults
pnpm eval:rag -- --mode=simulate --simulate-recall=0.45
pnpm eval:rag -- --warn=0.6 --kill=0.45
pnpm eval:rag -- --output=eval-summary.json
pnpm eval:rag -- --baseline=prev-summary.json
```

### Modes

| Mode       | Поведінка                                                                                |
| ---------- | ---------------------------------------------------------------------------------------- |
| `mock`     | Detrministic: `retrieved = [...expected, ...noise]` → recall@4 = 1.0. Sanity CI.         |
| `simulate` | Global-budget algorithm — mean recall ≈ `--simulate-recall` (default=1).                 |
| `live`     | Real AI-memory service (Voyage + pgvector). **NOT IMPLEMENTED** — placeholder для PR-21. |

### Exit codes

| Code | Status  | Threshold (default)                                                               |
| ---- | ------- | --------------------------------------------------------------------------------- |
| 0    | `pass`  | recall@4 mean ≥ 0.5                                                               |
| 1    | `warn`  | 0.4 ≤ recall@4 mean < 0.5 — open issue, RAG залишається ON                        |
| 2    | `kill`  | recall@4 mean < 0.4 — open critical issue, RAG автоматично OFF (Railway env-flag) |
| 3    | `error` | CLI configuration error (invalid --mode, threshold paradox)                       |

### Output schema (v2.0)

```jsonc
{
  "version": "2.0",
  "mode": "mock",
  "ranAt": "2026-05-13T20:00:00.000Z",
  "topK": 4,
  "thresholds": { "warn": 0.5, "kill": 0.4 },
  "aggregate": { "count": 50, "mean": 1, "min": 1, "p50": 1 }, // recall@K — back-compat
  "metrics": {
    "recallAtK": { "count": 50, "mean": 1, "min": 1, "p50": 1 },
    "precisionAt1": { "count": 50, "mean": 1, "min": 1, "p50": 1 },
    "mrr": { "count": 50, "mean": 1, "min": 1, "p50": 1 },
  },
  "perDomain": {
    "finyk": {
      "recallAtK": { "count": 8, "mean": 1, "min": 1, "p50": 1 },
      "precisionAt1": { "count": 8, "mean": 1, "min": 1, "p50": 1 },
      "mrr": { "count": 8, "mean": 1, "min": 1, "p50": 1 },
    },
  },
  "status": "pass",
  "exitCode": 0,
  "queries": [
    {
      "id": "finyk-001",
      "domain": "finyk",
      "recall": 1,
      "precisionAt1": 1,
      "reciprocalRank": 1,
    },
  ],
  "baselineComparison": null,
}
```

## Baseline comparison

`--baseline=<path>` зчитує попередній summary JSON і обчислює delta:

```jsonc
"baselineComparison": {
  "baselinePath": "/tmp/last-week.json",
  "deltas": {
    "recallAtK":    -0.0533,   // mean(current) - mean(baseline)
    "precisionAt1": -0.08,
    "mrr":          -0.04
  },
  "regression": true            // recall@K delta < -0.05 → true
}
```

Threshold `regression: true` — drop recall@K mean більше ніж на **0.05**.
Це м'якший за warn/kill — детектить degradation тренд до того як metric
впаде нижче kill-threshold.

### Граceful-fallback на 1.x summaries

Якщо baseline JSON старий (PR-22 без `metrics` block), CLI читає
`baseline.aggregate.mean` як recall@K mean. P@1/MRR deltas defaults to 0
(prev=0). Це дозволяє користуватися PR-22 baseline-ами без міграції.

## Як reagуvати на degradation

Див. [`docs/observability/runbook.md`](../observability/runbook.md):

- **`RagQualityGateDegraded`** (warn): scan per-domain breakdown, recent
  embedding-changes; alert не блокує. Якщо не повертається у `pass` за 2
  тижні — eскалюй до kill.
- **`RagQualityGateKillSwitch`** (critical): set `AI_MEMORY_ENABLED=false`
  на Railway → redeploy, потім root-cause через artifact + Voyage incident
  status.

## Як додати нову метрику (наприклад nDCG)

1. Додай pure-math функцію у
   [`recall.ts`](../../apps/server/src/lib/ragEval/recall.ts) + Vitest у
   `recall.test.ts`.
2. Розшир `PerQueryMetrics` interface + `MetricsBundle.aggregateMetrics()`.
3. Зеркало у [`scripts/eval-rag-recall.mjs`](../../scripts/eval-rag-recall.mjs)
   — функція + insertion у `aggregateBundle`.
4. Розшир `--baseline` comparison у `compareToBaseline()`.
5. Update workflow step-summary table
   ([`.github/workflows/rag-quality-gate.yml`](../../.github/workflows/rag-quality-gate.yml)).
6. Update цей файл (нова секція з формулою).

## Weekly automation layer (post-PR-20)

Eval-harness — pure-function: bere golden-set + retrieval-call →
повертає JSON summary. Automation-шар довкола ловить deviations і
тригерить responsive actions:

```
┌────────────────────┐    cron Mon 06:00 Kyiv
│  n8n WF-28         │ ─────────────────────────┐
└────────────────────┘                          │
                                                ▼
                       POST workflow_dispatch (GitHub API)
                                                │
                                                ▼
                       ┌──────────────────────────────────┐
                       │  GH Action rag-quality-gate.yml  │
                       │  Sun 08:00 UTC + n8n trigger     │
                       │  → pnpm eval:rag (mock/live)     │
                       │  → POST summary to API ▼          │
                       └──────────────────────────────────┘
                                                │
                                                ▼
       /api/internal/eval/rag-weekly   (apps/server/src/routes/internal/eval-rag.ts)
       (bearer-token guard — INTERNAL_API_KEY)
                ║
                ║ 4 side-effects:
                ║
                ╠── 1. INSERT n8n_failure_events (workflow_id=rag-eval-weekly)
                ║      raw=summary JSON для post-mortem
                ║
                ╠── 2. SET Prom gauges
                ║      rag_eval_recall_at_4{mode}, rag_eval_p@1{mode},
                ║      rag_eval_mrr{mode}, rag_eval_last_run_status{mode},
                ║      rag_eval_last_run_timestamp_seconds
                ║
                ╠── 3. Sentry captureMessage if status != "pass"
                ║      level=warning (warn) | level=error (kill)
                ║      tags: module=rag-eval, auto_disable_recommended, mode
                ║      extra.baselineComparison (delta vs прошлий тиждень)
                ║
                ╚── 4. activateKillSwitch("mono_ai_memory_ingest")
                       only if status="kill"
                       in-memory Map (apps/server/src/lib/featureFlags/
                       runtimeKillSwitch.ts) — single-instance only
```

**Runtime kill-switch contract** (`apps/server/src/lib/featureFlags/
runtimeKillSwitch.ts`):

- `activateKillSwitch(name, {reason, context})` — set active=true,
  inc counter, Sentry breadcrumb, log Pino warn.
- `isKillSwitchActive(name)` — `O(1)` Map.get — викликається у
  `apps/server/src/modules/ai-memory/ingestQueue.ts` перед env-flag-ом
  `MONO_AI_MEMORY_INGEST_ENABLED`. Перебиває env у бік skip.
- `deactivateKillSwitch(name)` — manual reset (operator action).
- In-memory: Map<KillSwitchName, KillSwitchState>. **Reset на
  process-restart** — це навмисно (operator може investigation-ити
  fresh, env-flag залишається authoritative source-of-truth).

**Wrapper script** (`scripts/rag-eval-weekly.mjs`, exposed via
`pnpm eval:rag:weekly`):

- Spawn-ить child-process `eval-rag-recall.mjs` з тим самим CLI-set-ом
  (forward `--mode=`, `--baseline=` etc).
- Парсить v2.0 JSON summary, POST-ить на
  `${API_BASE_URL}/api/internal/eval/rag-weekly` з retry-loop
  (exponential backoff 200/400/800ms, 2 retries за замовч.).
- Exit codes: 0=pass, 1=warn, 2=kill, 3=hard-error. Mirror-ить eval
  CLI поведінку — n8n / GH Action може gate-ити job-status за exit
  code-ом.
- `--skip-post` — local-debug-режим (не пошту); `--internal-api-key=`,
  `--post-timeout-ms=`, `--post-retries=` — overrides.

**Status decoder**:

| Status | recall@4 vs threshold            | Action                                           |
| ------ | -------------------------------- | ------------------------------------------------ |
| pass   | mean ≥ `warn_threshold`          | Record. Жодного alert-у.                         |
| warn   | `kill_threshold` ≤ mean < `warn` | Sentry warning. Recommend investigation.         |
| kill   | mean < `kill_threshold` (= 0.4)  | Sentry error + **auto-flip kill-switch**.        |
| error  | CLI hard-fail (exit ≥3)          | Endpoint не отримає payload — cron alert окремо. |

**Reaction playbook**: [`docs/observability/runbook.md`](../observability/runbook.md)
секції `RagQualityGateDegraded`, `RagQualityGateKillSwitch`,
`RagEvalAutomationAlert`.

## See also

- [`pr-plan-2026-05.md`](../planning/pr-plan-2026-05.md) § PR-20 / PR-22
- [Hard Rule #15](../governance/rules/15-governance-and-doc-language.md) —
  governance + Ukrainian docs
- [`apps/server/src/modules/ai-memory/`](../../apps/server/src/modules/ai-memory/)
  — real retrieval pipeline (consumer of golden-set @ PR-21)
- [`docs/observability/runbook.md`](../observability/runbook.md) — alert
  reaction
- [`apps/server/src/routes/internal/eval-rag.ts`](../../apps/server/src/routes/internal/eval-rag.ts) —
  endpoint
- [`apps/server/src/lib/featureFlags/runtimeKillSwitch.ts`](../../apps/server/src/lib/featureFlags/runtimeKillSwitch.ts) —
  kill-switch registry
- [`scripts/rag-eval-weekly.mjs`](../../scripts/rag-eval-weekly.mjs) —
  weekly wrapper script
- [`ops/n8n-workflows/28-rag-eval-weekly-cron.json`](../../ops/n8n-workflows/28-rag-eval-weekly-cron.json) —
  n8n WF-28 cron
