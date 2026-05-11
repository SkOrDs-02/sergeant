# Initiative follow-ups

> **Last validated:** 2026-05-11 by @Skords-01. **Next review:** 2026-08-09.
> **Status:** Active

<!-- AUTO-GENERATED FILE. Do not edit by hand. Regenerate via `pnpm docs:gen-initiative-followups`. -->

Зведений календар відкритих follow-up-ів з усіх ініціатив у [`docs/initiatives/`](./README.md). Source = `### Carry-over → successor` блок у кожному файлі (тільки `- [ ]`-пункти; checked-off — історія, в індекс не йдуть).

Перевірка свіжості — `pnpm docs:check-initiative-followups` (CI gate). Формат пунктів — у [`README.md` § Carry-over format](./README.md#carry-over-format).

## One-shot

| Due                   | Initiative                                  | Item                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Після baseline-week_ | [0005](./_0005-ai-cost-and-prompt-cache.md) | cost-based alert `ai_daily_cost_usd > $X` — `X` обираємо з реальних spending-numbers (зараз < $5/day на staging, ставити cap на 50× від baseline передчасно). Додати у `alert_rules.yml` поряд з `AiErrorBudgetBurnFast`.                                                         |
| —                     | [0004](./_0004-server-observability.md)     | Перевести RED-deltas і AI-latency на span attributes замість Prom histograms — опційно, залежить від вибору OTLP-backend-у (Honeycomb derived columns vs Tempo metrics-from-traces). Не блокує закриття ініціативи; буде розглянуто в успадкованій 0006-RUM-spans-web ініціативі. |
| —                     | [0005](./_0005-ai-cost-and-prompt-cache.md) | Per-route hit-rate breakdown — додати `endpoint` label на `anthropic_prompt_cache_hit_total` коли буде incident, що цього вимагає (поки що `aggregated` view достатньо).                                                                                                          |
| —                     | [0005](./_0005-ai-cost-and-prompt-cache.md) | OpenAI prompt cache (auto-cache після 1024 токенів) — окремий ADR, якщо/коли перейдемо на OpenAI або multi-provider routing. Тільки метрика, без коду — Anthropic SDK залишається primary.                                                                                        |

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
