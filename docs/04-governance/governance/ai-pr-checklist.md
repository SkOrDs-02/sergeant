# AI-PR Checklist та guard workflow

> **Last validated:** 2026-06-29 by @Kilo-session. **Next review:** 2026-09-27.
> **Status:** Active

Цей документ пояснює **навіщо** в Sergeant існує AI-Generation Signals секція
в PR-шаблоні та **як** саме `.github/workflows/ai-pr-checklist.yml` її
валідує. Механізм — частина harness-engineering v1 (див.
`E:\Temp\kilo\harness-plan.md` §4).

---

## Навіщо це потрібно

AI-генерований код має інші патерни помилок, ніж людський:

- надмірна абстракція (factory-of-factory);
- непотрібний `try/catch` навколо `internal code` (Hard Rule «no error
  handling for impossible scenarios»);
- дублікати хелперів з `packages/shared/lib/`;
- розбіжність з оновленою документацією;
- забутий `AI-NOTE` / `AI-DANGER` маркер.

Checklist у шаблоні PR змушує агентів (і людей, які їх використовують)
**свідомо** пройти ці 6 пунктів перед відкриттям PR — guard workflow
перетворює їх із побажання на обов'язковий gate, але **тільки** коли PR
справді має AI-сигнали. Human-only PR не зачіпаються.

---

## Як працює автодетект

`.github/workflows/ai-pr-checklist.yml` запускається на кожен
`pull_request` event. Detect-step перевіряє три джерела сигналів:

| Сигнал | Патерн | Чому надійний |
|---|---|---|
| `Co-authored-by` trailer | `Co-authored-by: ... (Claude\|GPT\|Codex\|Cursor\|Kilo\|Devin\|Anthropic\|OpenAI\|noreply@anthropic)` | Claude Code / Codex / Kilo / Devin додають цей trailer за замовчуванням |
| `Generated with` marker | рядок у commit message, що починається з `Generated with` | GitHub Copilot, деякі wrapper-и Claude ставлять цей маркер |
| AI маркери у файлах | `AI-NOTE` / `AI-CONTEXT` / `AI-DANGER` / `AI-LEGACY` / `AI-GENERATED` у змінених файлах | Enforced by `eslint-plugin-sergeant-design/ai-marker-syntax` |

Якщо **хоча б одне** з перших двох джерел дало ≥1 хіт — прапор
`ai_signals = true`. Marker-only сигнали не блокують (можуть бути
залишені людьми для контексту).

---

## Що саме валідується

Коли `ai_signals = true`, workflow витягує PR body і перевіряє наявність
шести required substrings — кожен відповідає чекбоксу з шаблону:

```
1. "No unnecessary abstraction"
2. "No defensive"
3. "No duplicate helpers"
4. "Documentation"
5. "AI markers"
6. "AI-LEGACY"
```

Якщо body не містить жодного з них — workflow fail-ить з повідомленням,
яке саме вказує, які пункти пропущені.

---

## Escape hatch: human-authored PR

Human-only PR (без AI сигналів) — bypass автоматично, workflow навіть
не виконує enforce-step. **Дві** умови для bypass:

1. **Автоматичний bypass** — жодного `Co-authored-by` trailer чи
   `Generated with` у коммітах PR.
2. **Ручний bypass** (коли детект помилково спрацював): PR body має
   містити `N/A — human-authored`, або maintainer приліпив label
   `ai-pr/override`.

Label `ai-pr/override` створюється вручну. Це другий рівень bypass для
edge-case-ів (наприклад, Claude допомагав із commit message, але весь
код писала людина).

---

## Що робити, якщо workflow дає false negative

False negative = workflow каже «AI signals detected», але PR писала
людина. Найчастіша причина — людина скопіпастила commit message з
`Co-authored-by: Claude` trailer (бо так зручно).

**Рішення:** додайте в PR body рядок `N/A — human-authored` —
workflow побачить його і bypass-ить. Або maintainer приліпить
`ai-pr/override` label з коротким коментарем.

False positive (workflow не помітив AI сигналів) — bypass не потрібен,
але варто повідомити maintainer-у, щоб додали патерн у detect-step.

---

## Пов'язані документи

- ADR [`0069-ai-pr-checklist.md`](../adr/0069-ai-pr-checklist.md) —
  контекст рішення, alternatives, наслідки
- Workflow [`.github/workflows/ai-pr-checklist.yml`](../../../../.github/workflows/ai-pr-checklist.yml)
- PR template [`.github/PULL_REQUEST_TEMPLATE.md`](../../../../.github/PULL_REQUEST_TEMPLATE.md) § *AI-Generation Signals*
- Hard Rules (зокрема #15 — read governance before coding)
- AI markers: [`docs/04-governance/governance/ai-markers.md`](./ai-markers.md)
  (якщо існує) — повний список marker-ів і syntax

---

## Локальний debug

Щоб перевірити detect-step локально перед push:

```bash
# Co-authored-by у останніх 10 коммітах
git log --pretty=%B -n 10 | grep -iE 'Co-authored-by'

# Generated-with маркери
git log --pretty=%B -n 10 | grep -iE 'Generated with'

# AI marker-и у змінених файлах
git log --pretty= --name-only -n 10 \
  | grep -v '^$' \
  | xargs -I{} grep -lE 'AI-(NOTE|CONTEXT|DANGER|LEGACY)' {} 2>/dev/null
```

Якщо всі три повернули 0 хітів — workflow буде bypass.