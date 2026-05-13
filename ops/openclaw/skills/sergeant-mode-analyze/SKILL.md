---
name: sergeant-mode-analyze
description: Strategic mode — `/analyze <anomaly>`. Веде hypothesis-driven root-cause аналіз (Anomaly → Hypotheses → Evidence → Ranked conclusion). Orthogonal до persona — комбінується з будь-якою (default — devops / eng для incidents, cofounder для business anomalies).
---

# Strategic mode: Analyze — `/analyze <anomaly>`

> **Last validated:** 2026-05-10 by Devin (PR-C3). **Next review:** 2026-08-08.
> **Status:** Active (PR-C3, opt-in per Locked decision #6). Live SKILL is copied to `~/.openclaw/workspace/skills/sergeant-mode-analyze/SKILL.md` on Gateway start.

## Призначення

Strategic mode — orthogonal до persona. `/analyze <anomaly>` запускає hypothesis-driven root-cause framework поверх будь-якої persona. Default зразково — `devops` для infra/Sentry incidents, `growth` для funnel-drops, `cofounder` для cross-domain anomalies. Mode задає **як думати**, persona — **звідки дані**.

Trigger: повідомлення з префіксом `/analyze <anomaly>`. Без `<anomaly>` — попроси одне речення (метрика + delta + період).

Audit trigger label (per [`tools/openclaw/src/agents/strategic-modes.ts`](../../../../tools/openclaw/src/agents/strategic-modes.ts)): `strategic_analyze`.

## Framework — 4 кроки

Веди розмову у чотирьох явно іменованих кроках, як hypothesis-driven debug:

1. **ANOMALY** — переформулюй що саме anomalous: значення / період / відхилення від baseline. Якщо метрика ambiguous (наприклад «signups просіли») — задай clarifying: за який період, скільки delta, проти якого baseline.
2. **HYPOTHESES** — згенеруй 3–5 потенційних причин (від найбільш-ймовірних до edge-cases). Для кожної — який tool / query підтвердить чи спростує: `query_app_db`, `get_sentry_issues`, `read_workflow_logs`, `read_telegram_topic`, `get_posthog_stats`, `seo_gsc_query`, `get_stripe_metrics`.
3. **EVIDENCE** — для **топ-2** гіпотез фактично зроби tool-call. Не перевіряй усі п'ять — зосередься на тих, що можна швидко spike-нути (≤2 tool-calls). Якщо evidence слабке — явно скажи це.
4. **RANKED CONCLUSION** — упорядкуй гіпотези за weight-of-evidence. Якщо одна явно домінує — назви її **primary cause**; решту — у `contributing` або `rejected` з коротким обґрунтуванням. Якщо primary не виявлений — явно скажи «evidence inconclusive, потрібен ще один tool-call: <який>».

## Тон

**Direct, incident-mode**. Без warm-up, без hedging. Якщо дані недостатні — say so plainly і вкажи яких саме fact-ів бракує. Ukrainian.

## Tools (orthogonal — використовуй persona-allowlist)

Strategic mode НЕ розширює tool-allowlist persona. Якщо persona не має `get_sentry_issues`, analyze-mode теж не має — пропонуй founder-у переключитись (`/Олексій /analyze ...` для devops або `/Софія /analyze ...` для data).

Типові tools у analyze-mode (за наявності у persona):

- **HYPOTHESES:** список tool-options — текстуально, без виклику.
- **EVIDENCE (топ-2):** `get_sentry_issues`, `query_app_db`, `read_workflow_logs`, `get_posthog_stats`, `get_stripe_metrics`, `seo_gsc_query`, `read_telegram_topic`.
- **CONCLUSION:** `record_decision` (якщо доступний у persona) — зафіксувати root-cause + remediation у memory.

> Future write tools (PR-D): `mute_alert` (Sentry / PagerDuty) для primary-cause, що уже визнана benign. Поки що не у registry — propose у тексті.

## Acceptance contract

- `/analyze падіння signups вчора` → 4-step session з явними labels (ANOMALY / HYPOTHESES / EVIDENCE / RANKED CONCLUSION).
- HYPOTHESES має **3+ варіанти** (не лише «це з API»).
- EVIDENCE робить **2 фактичні tool-call**-и (а не speculative).
- CONCLUSION ranking explicit: primary / contributing / rejected — або «inconclusive» з наступним step.

## Anti-patterns

- ❌ Не починай одразу з гіпотези («це через deploy P»). Спершу — ANOMALY reformulation з конкретними числами.
- ❌ Не запускай >2 tool-call-ів у EVIDENCE-кроці. Mode — про focus, не про exhaustive sweep.
- ❌ Не пиши «можливо повільніше ніж очікувалось». Числа і delta vs baseline — обов'язкові.
- ❌ Не пропонуй remediation у RANKED CONCLUSION без явного флагу «це для plan-mode follow-up». Analyze закінчується на root-cause; remediation — окремий `/plan`.

## Зв'язок з іншими modes

- `/plan` — структуроване рішення, як виправити (analyze → plan handoff).
- `/okr` — якщо anomaly стосується KR-progress, перенаправ на okr-mode для контексту.

## Reference

Primer-джерело: [`tools/openclaw/src/agents/strategic-modes.ts`](../../../../tools/openclaw/src/agents/strategic-modes.ts) `ANALYZE_PRIMER`. Текст у цьому SKILL.md — canonical у OpenClaw runtime.
