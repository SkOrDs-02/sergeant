# Initiative follow-ups

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

<!-- AUTO-GENERATED FILE. Do not edit by hand. Regenerate via `pnpm docs:gen-initiative-followups`. -->

Зведений календар відкритих follow-up-ів з усіх ініціатив у [`docs/initiatives/`](./README.md). Source = `### Carry-over → successor` блок у кожному файлі (тільки `- [ ]`-пункти; checked-off — історія, в індекс не йдуть).

Перевірка свіжості — `pnpm docs:check-initiative-followups` (CI gate). Формат пунктів — у [`README.md` § Carry-over format](./README.md#carry-over-format).

## One-shot

| Due                   | Initiative                                                   | Item                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-05-11`          | [0011](./0011-foundation-adoption-and-process-discipline.md) | A1 — підтвердити Railway env-cleanup (production + staging) і записати pre-existing-value у resolution log audit-у [`docs/audits/2026-05-04-csp-disable-retrospective.md`](../audits/2026-05-04-csp-disable-retrospective.md).                                                          |
| `2026-05-11`          | [0011](./0011-foundation-adoption-and-process-discipline.md) | A2 — експортувати Railway audit-log за період 2026-04-18 → 2026-05-04 (або зафіксувати tier-limitation, якщо community tier його не зберігає).                                                                                                                                          |
| `2026-05-11`          | [0011](./0011-foundation-adoption-and-process-discipline.md) | A3 — Sentry-query: `event.type:default AND (message:csp_disabled OR message:"csp-report")` для `apps/server` за 2026-04-18 → 2026-05-04. Записати кількість events і чи був ≥1 год gap у CSP-report rate.                                                                               |
| `2026-05-11`          | [0011](./0011-foundation-adoption-and-process-discipline.md) | A4 — додати retroactive-row у [`docs/security/secret-ownership-register.md`](../security/secret-ownership-register.md) для `CSP_DISABLE` із status `removed 2026-05-04` і lifetime `2026-04-18 → 2026-05-04`.                                                                           |
| `2026-05-11`          | [0011](./0011-foundation-adoption-and-process-discipline.md) | A5 — verify, що PR 1.3 staging-gate ([#1697](https://github.com/Skords-01/Sergeant/pull/1697)) **НЕ** покриває runtime env-var changes у Railway dashboard (це окремий клас ризику). Відкрити окрему ініціативу для cover Railway env-var change-tracking.                              |
| `2026-05-12`          | [0005](./0005-ai-cost-and-prompt-cache.md)                   | перевірити cache-hit-rate ≥60% (panel #3 у `ai-cost.json` + query #1 вище). Якщо <30% — fixture-чек `SYSTEM_PROMPT_VERSION` drift, перевірити що `system[1]` (context) не йде у `system[0]` (regression-тест `chat.test.ts:673`); за потреби — варіант A (drop cache) per ADR-0039 § 7. |
| `2026-06-30`          | [0011](./0011-foundation-adoption-and-process-discipline.md) | Phase 2.9 finalize — promote `sergeant-design/prefer-data-state` ESLint rule severity з `warn` до `error` (one-line зміна у `eslint.config.js` після baseline-week, якщо warn-rate стабільно ≤ 1).                                                                                      |
| _Після baseline-week_ | [0005](./0005-ai-cost-and-prompt-cache.md)                   | cost-based alert `ai_daily_cost_usd > $X` — `X` обираємо з реальних spending-numbers (зараз < $5/day на staging, ставити cap на 50× від baseline передчасно). Додати у `alert_rules.yml` поряд з `AiErrorBudgetBurnFast`.                                                               |
| —                     | [0004](./0004-server-observability.md)                       | Перевести RED-deltas і AI-latency на span attributes замість Prom histograms — опційно, залежить від вибору OTLP-backend-у (Honeycomb derived columns vs Tempo metrics-from-traces). Не блокує закриття ініціативи; буде розглянуто в успадкованій 0006-RUM-spans-web ініціативі.       |
| —                     | [0005](./0005-ai-cost-and-prompt-cache.md)                   | Per-route hit-rate breakdown — додати `endpoint` label на `anthropic_prompt_cache_hit_total` коли буде incident, що цього вимагає (поки що `aggregated` view достатньо).                                                                                                                |
| —                     | [0005](./0005-ai-cost-and-prompt-cache.md)                   | OpenAI prompt cache (auto-cache після 1024 токенів) — окремий ADR, якщо/коли перейдемо на OpenAI або multi-provider routing. Тільки метрика, без коду — Anthropic SDK залишається primary.                                                                                              |

Колонка `Due` — ISO-дата для дат-driven items (`⚠ overdue` на минулі), курсивом — trigger-based phrase (`Після baseline-week`, `When …`), `—` = unscheduled (TBD).

## Recurring

_Жодного recurring-чека._

## How to add a follow-up

Додайте top-level bullet до `### Carry-over → successor` секції відповідної ініціативи, дотримуючись формату:

```markdown
- [ ] **2026-05-12:** description … # one-shot, due-date
- [ ] **Recurring (weekly):** description … # recurring check
- [ ] **Після baseline-week:** description … # trigger-based
- [ ] description … # TBD (catch-all)
```

Збережіть файл, виконайте `pnpm docs:gen-initiative-followups`, закомітьте змінений `follow-ups.md` у тому самому PR-і. CI гейт `Initiative follow-ups (in sync)` перевіряє, що згенерована версія = checked-in версія.
