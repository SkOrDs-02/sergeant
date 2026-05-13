---
name: sergeant-mode-okr
description: Strategic mode — `/okr`. Огляд активних OKR з прогресом, bottleneck-аналізом, next-actions. Orthogonal до persona — default cofounder (синтез), допускається з growth / finance для domain-specific KR.
---

# Strategic mode: OKR — `/okr`

> **Last validated:** 2026-05-13 by Devin (PR-C3). **Next review:** 2026-08-11.
> **Status:** Active (PR-C3, opt-in per Locked decision #6). Live SKILL is copied to `~/.openclaw/workspace/skills/sergeant-mode-okr/SKILL.md` on Gateway start.

## Призначення

Strategic mode — orthogonal до persona. `/okr` запускає огляд активних OKR + progress + bottleneck + next-actions. Default persona — `cofounder` (cross-domain синтез). Допускається з `growth` (acquisition KRs), `finance` (revenue / unit-econ KRs), `data` (analytics KRs).

Trigger: повідомлення з префіксом `/okr` (без аргументів). Якщо founder додає `<topic>` (наприклад `/okr q3 retention`) — звужуй scope до відповідного KR.

Audit trigger label (per [`tools/openclaw/src/agents/strategic-modes.ts`](../../../../tools/openclaw/src/agents/strategic-modes.ts)): `strategic_okr`.

## Phase 3 skeleton — обмеження

Phase 3 — opt-in per Locked decision #6. `docs/strategy/<okr>.md` каталог ще не scaffolded (це окремий PR з frontmatter: `objective`, `kr[]`, `current_state`, `last_review_at`). Поки що:

- **Якщо `read_strategy_docs` повертає порожньо** → впади на `recall_memory("okr quarterly objectives")` для cofounder-memory snapshot-у.
- **Якщо memory теж порожнє** → явно скажи «OKR ще не scaffolded» і запропонуй framework на kick-off (Objective + 3–5 KRs + baseline + target + owner).

Mode НЕ створює `docs/strategy/*.md` сам — це Phase 4 territory (потрібен write-tool `commit_to_strategy_doc` + approval flow).

## Framework — 4 кроки

1. **ACTIVE OKRs** — прочитай з `docs/strategy/` через `read_strategy_docs`. Якщо порожньо — `recall_memory("okr quarterly objectives")`. Виведи список: `Objective: …` + `KRs: […]`.
2. **PROGRESS PER KR** — для кожного KR з виявленого списку оціни поточний стан проти target. Числа — з `query_app_db` (revenue, signups, active users, retention) або з Stripe / PostHog metric-tools (`get_stripe_metrics`, `get_posthog_stats`).
3. **BOTTLENECKS** — назви 1–2 KR, що відстають, **і конкретно чому**. Уникай мяких формулювань («можливо повільніше, ніж очікувалось») — числа і delta vs target.
4. **NEXT ACTIONS** — 1 action per bottleneck KR, з owner-ом і deadline-ом. Якщо потрібен новий OKR draft — запропонуй структуру (Objective + 3–5 KRs з baseline/target), founder сам зафіксує (`record_decision` або новий `docs/strategy/*.md`).

## Тон

Synthesis-mode (executive-level). Прямий, числовий. Без preamble. Ukrainian.

## Tools (orthogonal — використовуй persona-allowlist)

Strategic mode НЕ розширює tool-allowlist persona. `/okr` працює найкраще з `cofounder` (повний tool-set) — з вузьких persona може не вистачити tools для всіх KRs.

Типові tools у okr-mode (за наявності у persona):

- **ACTIVE OKRs:** `read_strategy_docs`, `recall_memory`.
- **PROGRESS:** `query_app_db`, `get_stripe_metrics`, `get_posthog_stats`, `seo_gsc_query` (для acquisition KRs), `get_sentry_issues` (для quality KRs).
- **NEXT ACTIONS:** `record_decision`, `set_reminder` (weekly OKR-review checkpoint).

> Future write tools (PR-D): `commit_to_strategy_doc` — створити `docs/strategy/<okr>.md` з YAML frontmatter (`objective`, `kr[]`, `current_state`, `last_review_at`). Поки що не у registry — propose draft у тексті.

## Acceptance contract

- `/okr` → 4-step session з явними labels (ACTIVE OKRs / PROGRESS PER KR / BOTTLENECKS / NEXT ACTIONS).
- PROGRESS — реальні числа з tools, не «приблизно ~X».
- BOTTLENECKS — 1–2 KRs, не більше. Якщо все по target — явно скажи «всі KRs on track, bottleneck відсутній».
- NEXT ACTIONS — actionable, з owner-ом і deadline-ом.

## Anti-patterns

- ❌ Не вигадуй OKR-цифри, якщо tool недоступний — явно скажи «no data, потрібен `<tool>` у persona-allowlist».
- ❌ Не пропускай BOTTLENECKS, якщо хочеться зробити «позитивний» огляд. Це — review, не пітч.
- ❌ Не пропонуй >1 action per KR. Mode — про focus, не про «список всього, що можна було б».
- ❌ Не commit-и нічого у `docs/strategy/*.md` сам — Phase 4 territory (write-tool + approval gate).

## Зв'язок з іншими modes

- `/plan <KR-topic>` — структуроване рішення, як закрити bottleneck KR (okr → plan handoff).
- `/analyze <KR-anomaly>` — root-cause, чому KR відстає (okr → analyze handoff).
- **Morning digest** (`schedules.morning_digest`, daily 09:00 Kyiv) — складає окремий heartbeat. OKR-mode — on-demand deep-dive.

## Reference

Primer-джерело: [`tools/openclaw/src/agents/strategic-modes.ts`](../../../../tools/openclaw/src/agents/strategic-modes.ts) `OKR_PRIMER`. Текст у цьому SKILL.md — canonical у OpenClaw runtime.
