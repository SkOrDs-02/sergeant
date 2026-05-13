# Initiative follow-ups

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

<!-- AUTO-GENERATED FILE. Do not edit by hand. Regenerate via `pnpm docs:gen-initiative-followups`. -->

Зведений календар відкритих follow-up-ів з усіх ініціатив у [`docs/initiatives/`](./README.md). Source = `### Carry-over → successor` блок у кожному файлі (тільки `- [ ]`-пункти; checked-off — історія, в індекс не йдуть).

Перевірка свіжості — `pnpm docs:check-initiative-followups` (CI gate). Формат пунктів — у [`README.md` § Carry-over format](./README.md#carry-over-format).

## One-shot

_Жодного відкритого one-shot follow-up-у._

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
