---
name: sergeant-mode-plan
description: Strategic mode — `/plan <topic>`. Веде structured 4-step planning session (Goal → Context → Options → Decision + Followup). Orthogonal до persona — комбінується з будь-якою (default — cofounder).
---

# Strategic mode: Plan — `/plan <topic>`

> **Last validated:** 2026-05-10 by Devin (PR-C3). **Next review:** 2026-08-08.
> **Status:** Active (PR-C3, opt-in per Locked decision #6). Live SKILL is copied to `~/.openclaw/workspace/skills/sergeant-mode-plan/SKILL.md` on Gateway start.

## Призначення

Strategic mode — orthogonal до persona. Persona визначає **хто думає** (cofounder / eng / growth / …), mode визначає **як думати**. `/plan` запускає 4-крокову planning-сесію поверх будь-якої persona; default — cofounder.

Trigger: повідомлення, що починається з `/plan <topic>`. Без `<topic>` — попроси одне речення про що планувати.

Audit trigger label (per [`tools/openclaw/src/agents/strategic-modes.ts`](../../../../tools/openclaw/src/agents/strategic-modes.ts)): `strategic_plan`.

## Framework — 4 кроки

Веди розмову у чотирьох явно іменованих кроках:

1. **GOAL** — уточни ціль (clarifying questions). Що success looks like? Який metric / proof-point показує, що ми досягли?
2. **CONTEXT** — підтягни релевантні дані через tools (`recall_memory`, `read_strategy_docs`, `query_app_db`, `get_stripe_metrics`, `get_posthog_stats`). Не перевантажуй — достатньо 2–3 ключові факти.
3. **OPTIONS** — згенеруй 2–3 варіанти з trade-offs (cost / time / risk). Уникай single-option-narrative — навіть якщо один варіант явно сильніший, опиши інший з чесними мінусами.
4. **DECISION + FOLLOWUP** — рекоменд один з options з обґрунтуванням. Запропонуй founder-у зафіксувати рішення (через `record_decision`, якщо доступно у persona-allowlist) і визнач weekly-review checkpoint (через `set_reminder`).

Якщо founder уже на step ≥ 2 (передав context або option), **не починай з 1 знову** — продовж з його кроку.

## Тон

Прямий, без warm-up preamble. Ukrainian. Якщо комбінується з cofounder — додай опонент-mode (challenge припущень, шукай слабкі місця у плані founder-а перед DECISION).

## Tools (orthogonal — використовуй persona-allowlist)

Strategic mode НЕ розширює tool-allowlist persona. Якщо persona не має `query_app_db`, plan-mode теж не має. Mode задає **framework**, persona — **права доступу**.

Типові tools у plan-mode (за наявності у persona):

- **GOAL/CONTEXT:** `recall_memory`, `read_strategy_docs`, `query_app_db`, `get_*_stats` (Stripe, PostHog, Sentry, server).
- **DECISION FOLLOWUP:** `record_decision` (якщо доступний), `set_reminder` (weekly checkpoint).
- **Write-tools** (`create_github_issue`, `n8n_trigger`) — **тільки** через approval gate (PR-D). Сам не натискай — пропонуй founder-у.

> Future write tools (PR-D): `commit_to_strategy_doc` — записати fixed DECISION у `docs/strategy/<topic>.md` як ADR-lite. Поки що не у registry — propose у тексті, founder сам commit-ить.

## Acceptance contract

- `/plan churn-reduction-q3` → 4-step session з явними labels (GOAL / CONTEXT / OPTIONS / DECISION+FOLLOWUP).
- Кожен крок має action — clarifying-question (1), tool-call (2), 2–3 trade-off variants (3), рекомендація + followup (4).
- Не пропускати OPTIONS — навіть якщо рішення «очевидне», 1+ alternative з чесними мінусами обов'язковий.

## Anti-patterns

- ❌ Не починай одразу з рекомендації (DECISION-first). Founder-у потрібен structured trace, не лише висновок.
- ❌ Не змішуй кроки в одному повідомленні — кожен крок — окрема відповідь, founder має шанс перенаправити.
- ❌ Не пропонуй `record_decision`, якщо persona не має цього tool у allowlist. Заміни на «запропоную, як ти волієш зафіксувати — у `docs/strategy/`, у Telegram-топіку, чи у memory».

## Зв'язок з іншими modes

- `/analyze` — root-cause аналіз (передує plan, якщо проблема не зрозуміла).
- `/okr` — review активних OKR (контекст для plan-mode topic-у).

## Reference

Primer-джерело: [`tools/openclaw/src/agents/strategic-modes.ts`](../../../../tools/openclaw/src/agents/strategic-modes.ts) `PLAN_PRIMER`. Текст у цьому SKILL.md — canonical у OpenClaw runtime; primer у внутрішньому боті залишається до Phase 7 cutover.
