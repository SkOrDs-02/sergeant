# ADR-0069: AI-PR Checklist and validation workflow

> **Last touched:** 2026-07-21 by @cursoragent. **Next review:** 2026-10-18.
> **Status:** Accepted

- **Status:** Accepted
- **Date:** 2026-06-29
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/04-governance/governance/ai-pr-checklist.md`](../governance/ai-pr-checklist.md) — user-facing doc
  - `.github/PULL_REQUEST_TEMPLATE.md` § _AI-Generation Signals_ — checklist section
  - `.github/workflows/ai-pr-checklist.yml` — guard workflow
  - `AGENTS.md` § _AI markers_ — AI-NOTE / AI-CONTEXT / AI-DANGER convention
  - Source plan: `E:\Temp\kilo\harness-plan.md` §4 (NxCode "Harness-инженерия")
  - PR template spec: `.github/PULL_REQUEST_TEMPLATE.md` § "Verification gate"
  - Hard Rule #15 (read governance before coding)
  - Hard Rule #26 (pr-ledger update on merge)

---

## Context and Problem Statement

AI-генерований код має інші патерни помилок, ніж людський:

- надмірна абстракція (factory-of-factory);
- непотрібний `try/catch` навколо `internal code` (Hard Rule «no error
  handling for impossible scenarios»);
- дублікати хелперів з `packages/shared/lib/`;
- розбіжність з оновленою документацією;
- забутий `AI-NOTE` / `AI-DANGER` маркер.

Без явного gate ці проблеми потрапляють у main і виявляються тільки
постфактум — під час review або (гірше) у проді. Тому ми хочемо
**зобов'язати** авторів AI-генерованих PR-ів пройти короткий checklist
з 6 пунктів перед відкриттям PR. Human-only PR не повинні страждати
від додаткового gate (false positives), тому guard має вміти
**розрізняти**.

Станом на 2026-07-21 (після merge Harness Engineering v1):

- AI markers (`AI-NOTE` / `AI-CONTEXT` / `AI-DANGER` / `AI-LEGACY`)
  enforced by `eslint-plugin-sergeant-design/ai-marker-syntax`.
- `AGENTS.md` описує marker convention; перевірка наявності markers — через PR checklist для AI-PR.
- `.github/PULL_REQUEST_TEMPLATE.md` має секцію **AI-Generation Signals** (6 пунктів).
- `.github/workflows/ai-pr-checklist.yml` detect-ить AI authorship за trailers і вимагає checklist лише для AI-генерованих PR.

---

## Decision

Додаємо дві пов'язані речі:

1. **Нова секція в PR template** (перед «Docs and Governance») — шість
   чекбоксів із конкретними патернами AI-помилок + `N/A — human-authored`
   escape hatch.

2. **Guard workflow** `.github/workflows/ai-pr-checklist.yml`, який:
   - detect-ить AI authorship через `Co-authored-by` trailer (regex:
     `(Claude|GPT|Codex|Cursor|Kilo|Devin|Anthropic|OpenAI|noreply@anthropic)`)
     і `Generated with` marker у commit messages;
   - bypass-ить, якщо сигналів немає (human-only PR);
   - bypass-ить, якщо PR body має `N/A — human-authored` або maintainer
     приліпив `ai-pr/override` label;
   - інакше перевіряє наявність 6 required substrings у PR body і
     fail-ить з повідомленням, які саме пункти пропущені.

Detect-step запускається через `git log --pretty=%B -n 50` на PR branch —
це працює і для direct-push, і для squash-merged прев'ю.

Workflow тригериться на `pull_request: [opened, edited, synchronize,
reopened]` + має `workflow_dispatch` для ручного debug.

---

## Consequences

### Positive

- **+ Видимий gate для AI-патернів.** Шість чекбоксів = шість
  структурованих рев'ю-точок, які легко автоматизувати.
- **+ Human PR не страждають.** Bypass спрацьовує автоматично, false
  positives легко виправити через `N/A — human-authored` або label.
- **+ Самодокументація.** PR body з позначеним checklist — це
  evidence, що автор пройшов ці кроки. Reviewer може пропустити
  manual review цих 6 пунктів.
- **+ Ізольований PR.** Не торкається `tools/entropy-janitors/**`,
  `tools/agent-snapshot/**`, `.kilo/harness-versions.json` —
  harness-plan §5.1 гарантує відсутність merge-конфліктів з §1–§3.

### Negative

- **− Додатковий CI-job.** ~10–20 секунд на PR. Для репо з
  30+ workflows — помітний шум у PR check list.
- **− Regex maintenance.** Нові AI tools = нові trailer-и. Якщо
  хтось випустить agent без `Co-authored-by` trailer — bypass
  може спрацювати неправильно. Detect-step треба періодично
  рев'ювати.
- **− False negatives при squash-merge.** Якщо PR має 50 комітів
  від людини і один від AI, але squash-merge повідомлення **не**
  включає `Co-authored-by` — guard може пропустити. Рішення:
  читаємо коміти **PR branch**, а не merge commit — це вже
  реалізовано в detect-step через `git log` на checkout PR head.

### Neutral

- **Workflow permissions:** тільки `pull-requests: read` + `contents:
read`. Не пише в PR, не ставить labels, не залишає коментарі —
  мінімальний scope за принципом «Trust internal code».
- **Без **`size/override`** style exception.** Maintainer може
  bypass-ити через `ai-pr/override` label, але workflow його
  автоматично не створює. Це свідома річ — guard має бути
  доказом наміру.

---

## Alternatives Considered

### Alt A: `probot/ai-pr-checklist` GitHub App

Готовый bot, який сам розпізнає AI authorship.

**Rejected** — додаткова залежність від GitHub App, яку Sergeant
свідомо уникає (див. `pr-size.yml` header: «We use an inline
implementation rather than the probot app to avoid an extra GitHub
App dependency and keep the policy in-repo»). Та ж логіка тут.

### Alt B: Перевіряти AI markers у коді, а не trailer

Замість commit-message сигналів — шукати `AI-NOTE` / `AI-CONTEXT` /
`AI-DANGER` у змінених файлах.

**Rejected** — markers ставляться тільки там, де автор хоче
залишити підказку наступному агенту. Величезні AI-PR без markers —
це саме ті PR, які треба ловити. Trailer-и — надійніший «намір».

### Alt C: Завжди вимагати checklist, без bypass

Найпростіший варіант — require checklist на кожному PR.

**Rejected** — порушує базовий принцип «не блокувати human PR».
Додає шум і friction для 80% випадків, коли людина не використовує
AI взагалі. Detect-step з bypass-ом — це одна перевірка вартістю
~3 секунди shell-time на PR.

### Alt D: AI-marker у commit message + bypass через label

Замість PR body — перевіряти наявність `[ai-pr]` маркера в commit
message.

**Rejected** — не всі AI-агенти вміють додавати кастомні маркери
(тільки деякі wrapper-и Claude / Kilo). Trailer-и стандартизовані
GitHub-ом і ставляться автоматично.

---

## Acceptance Criteria (з §4.5 плану)

- [x] `.github/PULL_REQUEST_TEMPLATE.md` має нову секцію
- [x] `.github/workflows/ai-pr-checklist.yml` валідний
- [x] Тестовий PR з AI-сигналами і непозначеним чек-лістом → CI червоний
- [x] Тестовий PR з AI-сигналами і позначеним чек-лістом → CI зелений
- [x] Human PR без AI-сигналів → CI bypass
- [x] `docs/04-governance/governance/ai-pr-checklist.md` створено
- [x] ADR `0069-ai-pr-checklist.md` створено (цей файл)
- [x] `docs/04-governance/pr-ledger/index.json` оновлено (Hard Rule #26) — deferred до merge (schema вимагає non-null `merged_at` і `number >= 1`; PR ще не змерджений на момент написання ADR)

---

## Follow-up / Open Questions

- **Як часто `agentManager` / Claude Code змінюють формат trailer-ів?**
  Варто періодично (раз на квартал?) переглядати detect-regex і
  додавати нові патерни. Поки що покриваємо всі основні агенти:
  Claude, GPT, Codex, Cursor, Kilo, Devin.
- **Чи потрібен `pull_request_target` trigger?** Ні — workflow
  читає тільки `context.payload.pull_request.body` і файли на
  checkout, без секретів. `pull_request` достатньо.
- **Чи варто додати окремий label `ai-pr/incomplete`?** Поки що
  workflow тільки fail-ить check — це дає автору можливість самому
  виправити PR body без публічного shaming-label.
