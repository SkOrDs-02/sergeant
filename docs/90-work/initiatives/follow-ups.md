# Initiative follow-ups

> **Last validated:** 2026-07-06 by @Skords-01. **Next review:** 2026-10-04.
> **Status:** Active

<!-- AUTO-GENERATED FILE. Do not edit by hand. Regenerate via `pnpm docs:gen-initiative-followups`. -->

Зведений календар відкритих follow-up-ів з усіх ініціатив у [`docs/90-work/initiatives/`](./README.md). Source = `### Carry-over → successor` блок у кожному файлі (тільки `- [ ]`-пункти; checked-off — історія, в індекс не йдуть).

Перевірка свіжості — `pnpm docs:check-initiative-followups` (CI gate). Формат пунктів — у [`README.md` § Carry-over format](./README.md#carry-over-format).

## One-shot

| Due                        | Initiative                            | Item                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-07-02` ⚠ overdue     | [0017](./0017-hub-tabs-mount-perf.md) | confirm `hub_tab_switch_perf` Settings P50 ≤ 2 s + P95 ≤ 3 s, Reports P50 ≤ 1.5 s + P95 ≤ 3 s, long-task P95 ≤ 5. Owner pins numbers in this Outcome.                                                               |
| `2026-07-02` ⚠ overdue     | [0017](./0017-hub-tabs-mount-perf.md) | confirm `aggregateReport` P95 ≤ 50 ms; if > 50 ms, re-open Sprint 3 (Web Worker for aggregate) as a discrete follow-up against this initiative.                                                                     |
| _After RUM targets pinned_ | [0017](./0017-hub-tabs-mount-perf.md) | rename file to `_0017-hub-tabs-mount-perf.md` (Status → Done) per [`docs/90-work/initiatives/README.md` Completed-prefix](./README.md#completed-prefix--nnnn-) and update the active-initiative row in `README.md`. |

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
