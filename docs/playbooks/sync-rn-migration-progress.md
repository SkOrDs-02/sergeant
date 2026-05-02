# Playbook: Sync RN Migration Progress

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-28.
> **Status:** Active

**Trigger:** один або кілька PR-ів із `port-web-screen-to-mobile.md` ([#445](https://github.com/Skords-01/Sergeant/pull/445), [#446](https://github.com/Skords-01/Sergeant/pull/446), …) змерджені, треба оновити tracker [`docs/mobile/react-native-migration.md`](../mobile/react-native-migration.md).

---

## Steps

### 1. Зібрати список merged PR-ів

```bash
# Або від користувача (наприклад: «синкни прогрес по #443, #444, #445»),
# або через GitHub UI / git CLI:
git log --oneline --merges main | head -20
```

Кожен PR має відповідати щонайбільше одному ряду / чекбоксу в трекері.

### 2. Прочитати `docs/mobile/react-native-migration.md`

Знайти **точне місце** (рядок таблиці, чекбокс, фазову секцію), яке відповідає кожному merged PR-у.

```bash
grep -n "<screen-or-section-keyword>" docs/mobile/react-native-migration.md
```

Не покладайся лише на назву PR-а — переконайся, що порт реально wired in:

```bash
# Чи компонент справді існує і використовується в apps/mobile?
find apps/mobile/src apps/mobile/app -name "*<keyword>*"
grep -rn "<ComponentName>" apps/mobile/app apps/mobile/src
```

### 3. Оновити рядки в трекері

- Постав чекбокс / переміщай item у відповідну фазу.
- Додай номер merged PR-а поруч із item-ом, якщо це конвенція документа (перевір сусідні рядки).
- Якщо PR покрив **частину** секції — постав тільки відповідні sub-items.
- Не реструктуруй секції, не зачеплені цим sync-ом.

### 4. Прогнати prettier

```bash
pnpm exec prettier --write docs/mobile/react-native-migration.md
git diff docs/mobile/react-native-migration.md
```

Diff має містити **тільки** zміни прогресу + автоформатування. Якщо бачиш semantic-зміни — відкоти і досліди.

### 5. Створити PR

- Branch: `devin/<unix-ts>-docs-rn-progress-sync`.
- Commit: `docs(docs): sync rn-migration progress (PR #X/#Y/#Z)` (scope `docs`, AGENTS.md rule #5).
- PR description (`.github/PULL_REQUEST_TEMPLATE.md`):
  - Перерахуй кожен merged PR з one-liner-ом, що він портнув.
  - Явно: «docs-only — без code diff-ів».
  - Лінк на [`docs/playbooks/port-web-screen-to-mobile.md`](port-web-screen-to-mobile.md), якщо PR-и слідували йому.

---

## Verification

- [ ] Кожен листед PR відображено точно одним апдейтом у трекері.
- [ ] Кожний апдейт відповідає реально wired-in коду в `apps/mobile/`.
- [ ] `pnpm format:check docs/mobile/react-native-migration.md` — green.
- [ ] PR-діф містить **тільки** `docs/mobile/react-native-migration.md` (нічого більше).
- [ ] CI-job `commitlint` — green (scope `docs`, тип `docs`).

## Notes

- Якщо під час sync-у виявив **інші** неточності в трекері (не повʼязані з listed PR-ами) — НЕ виправляй у цьому PR. Відкрий окремий sync, щоб blast radius лишався мінімальним.
- Якщо merged PR не змінив реальний код в `apps/mobile/` (наприклад, був чисто docs-only) — не став чекбокс «ported» лише через те, що merge відбувся.
- Anti-pattern: одночасний sync і «причепити кілька дрібних правок doc-tree-у» — рев'юер не зможе швидко перевірити «це справді просто sync».

## See also

- [port-web-screen-to-mobile.md](port-web-screen-to-mobile.md) — як зробити сам порт (single source of truth).
- [prettier-pass-on-docs.md](prettier-pass-on-docs.md) — якщо CI лає prettier на цьому doc-у поза sync-flow.
- [`docs/mobile/react-native-migration.md`](../mobile/react-native-migration.md) — сам tracker.
- [AGENTS.md](../../AGENTS.md) — rule #5 (commit scope enum), rule #7 (no `--no-verify`).
