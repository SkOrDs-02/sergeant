---
name: council-roundtable
description: Orchestrator skill для `/council <питання>` — round-table персон у фіксованому порядку (Locked #8) з фінальним cofounder synthesis. Phase 5 (PR-E).
---

# Council round-table — `/council <питання>`

> **Last validated:** 2026-05-11 by Devin (PR-E). **Next review:** 2026-08-09.
> **Status:** Active (PR-E, Phase 5). Live SKILL is copied to `~/.openclaw/workspace/skills/council-roundtable/SKILL.md` on Gateway start.

## Призначення

Round-table — це multi-persona спосіб отримати збалансовану відповідь на cross-domain питання. Один виклик `/council <питання>` запускає **fixed sequence** з п'яти спеціаліст-персон (Locked decision #8), а потім **cofounder synthesis** агрегує їхні думки у фінальне рішення.

Trigger: повідомлення з префіксом `/council <питання>`. Без аргументу — попроси одне речення про що радимось.

Audit trigger label: `council` (фіксується у `openclaw_invocations.metadata.council = true` + `metadata.councilStep = <persona | "synthesis">`).

## Default sequence (Locked #8)

```
devops → eng → pm → growth → finance → cofounder (synthesis)
```

- `devops` (Олексій) — reliability, incidents, n8n health, deploy/server signal.
- `eng` (Артем) — architecture, code, schema, security, repo state.
- `pm` (Олена) — roadmap, JTBD, prioritization, customer signal.
- `growth` (Марта) — funnel, content, retention, releases impact.
- `finance` (Ірина) — MRR, runway, unit-econ, cash-flow constraint.
- `cofounder` (Сергій) — synthesis: synthesize specialists' input → recommendation → followup.

Sequence — **фіксована** (cost predictability, deterministic audit trail). Якщо founder хоче інший порядок або підмножину — це `/council <persona-1> <persona-2> "питання"` варіант (handled окремо у runtime; ця SKILL.md описує default).

## Pre-flight gates

1. **Rate-limit** — звичайний DM rate-limit; council не обходить (1 запит / хв).
2. **Budget headroom** — `/api/internal/openclaw/budget` повертає `remainingUsd`; council вимагає `remainingUsd ≥ councilUsdBudget` (default `$2.00`, env `OPENCLAW_COUNCIL_USD_BUDGET`). Якщо ні — fail-fast з повідомленням «Council вимагає ≥ $X budget headroom; зараз залишок $Y. Спробуй окрему /persona або завтра».
3. **Iteration cap per persona** — `min(3, maxIterations)`. Сумарно ≤ 4×3 + 4 (synthesis) = 16 turn-ів; орієнтовно ~$0.5 у sonnet-cost-і. Synthesis-persona отримує `min(4, maxIterations)`.

## Виконання

1. **Announce** — short reply: `«Рада розпочата. Присутні: devops → eng → pm → growth → finance → cofounder synthesis.»` Це підтверджує founder-у, що команда йде по фіксованому порядку.
2. **Specialist turns (5×, sequential)** — для кожної persona з `defaultSequence` (окрім synthesis-persona):
   - Reply `*<displayName>* думає…` (MarkdownV2 escape).
   - Запустити agent-turn під цією persona з `metadataExtras: { council: true, councilStep: <persona> }`.
   - Якщо turn-and `ok=false` — abort з повідомленням `«Council aborted on persona=<X>. Дивись logs / спробуй окрему /<X>.»` Жодного rollback — частково записані specialist replies лишаються у audit.
   - Зберегти `{ persona, reply }` у локальний accumulator.
3. **Synthesis turn (1×)** — після всіх specialist replies:
   - Reply `*Cofounder synthesis…*`.
   - Запустити agent-turn під `synthesisPersona` (`cofounder` за замовч.) з prompt-template:

     ```
     Оригінальне питання: <Q>

     Думки ради з різних кутів:
     --- <displayName_1> ---
     <reply_1>

     --- <displayName_2> ---
     <reply_2>
     ...

     Твоє завдання як cofounder-фасилітатора:
     1) Брифли збіги і розбіжності між specialist-думками.
     2) Сформулюй рекомендацію з 1–3 наступних кроків.
     3) Якщо рішення вимагає повної фіксації — запропонуй record_decision.
     Будь стислий, лідь з висновку.
     ```

   - Synthesis persona — повний tool-set (cofounder). Може дотягнути `recall_memory`, `record_decision`, etc.

## Tools (orthogonal — persona-allowlist)

Council orchestrator **не розширює** tool-allowlist персон. Кожна persona використовує свій allowlist з `agents.<persona>.tools` (`openclaw.example.json`). Якщо persona не має `query_app_db`, у council-turn-і вона теж не має. Усі write-tools (Tier C `n8n_*`, `create_github_issue`, etc.) — **тільки** через approval gate (PR-D). Сама не натискай — питай founder-а через DM.

## Acceptance contract

- `/council чи вводимо B2B в Q3?` → 5 specialist replies (devops/eng/pm/growth/finance) + 1 cofounder synthesis.
- Кожна specialist-reply — окреме повідомлення з `*<displayName>*` header-ом (MarkdownV2).
- Synthesis — окреме повідомлення, починається з висновку (≤ 3 кроки followup).
- Audit: 6 invocation-rows з `metadata.council = true`, `councilStep ∈ {"devops","eng","pm","growth","finance","synthesis"}`.

## Anti-patterns

- ❌ Не паралель-callай personas. Sequential — bo Anthropic-client один (rate-limit shared) + cost predictability. Phase 4+ може piloti parallel якщо rate-limit ≥ 2 RPS і LLM-cost tracking стабільний.
- ❌ Не пропускай persona якщо вона `ok=false` — abort одразу. Council без full quorum — це інший instrument (per-persona `/devops`, `/eng`).
- ❌ Не пропускай synthesis. Без cofounder synthesis council — це просто 5 окремих відповідей, founder не отримує agreed-upon рекомендацію.
- ❌ Не використовуй `councilUsdBudget` як hard-limit на спожитий cost — це **headroom precondition** (мінімальний бюджет щоб **спробувати**), а не post-hoc enforcement. Реальний spend контролюється per-call cap-ом у `llm_input` hook-і.
- ❌ Не змінюй sequence runtime-ом. Якщо потрібен ad-hoc subset — це окремий path `/council <persona-1> <persona-2> "Q"`; default-sequence — фіксована (Locked #8).

## Зв'язок з іншими skills

- Persona skills (`sergeant-devops`, `sergeant-eng`, `sergeant-pm`, `sergeant-growth`, `sergeant-finance`, `sergeant-cofounder`) — джерело tool-allowlist + tone для кожного turn-у.
- Strategic modes (`/plan`, `/analyze`, `/okr`) — НЕ комбінуються з `/council`. Modes — single-persona structured framework; council — multi-persona round-table. Якщо founder викликає `/plan` після council-synthesis-у — це наступний turn під cofounder-ом.
- `morning-digest` — daily 09:00 Kyiv heartbeat (cofounder one-shot); не плутати з council on-demand round-table.

## Reference

- Migration plan: [`docs/planning/openclaw-migration-plan.md § Phase 5`](../../../../docs/planning/openclaw-migration-plan.md).
- Locked decisions #4 (council cap `$2.0`) і #8 (default sequence): [`docs/planning/openclaw-migration-plan.md § Locked decisions`](../../../../docs/planning/openclaw-migration-plan.md#locked-decisions).
- Legacy implementation reference (grammy bot fallback): [`tools/openclaw/src/openclaw/handler-commands.ts`](../../../../tools/openclaw/src/openclaw/handler-commands.ts) `bot.command("council", …)`.
- Plugin-side budget gate helper: [`packages/openclaw-plugin/src/hooks/council.ts`](../../../../packages/openclaw-plugin/src/hooks/council.ts).
