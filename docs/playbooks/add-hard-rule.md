# Playbook: Додати Hard Rule

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Active

**Trigger:** "Додати новий Hard Rule" / "Додати нову обов'язкову конвенцію" / будь-яке правило, яке потрібно енфорсити для всіх контриб'юторів і AI-агентів.

## Owner surface

- Primary surface: `docs/governance/hard-rules.json`
- Coupled surface: `AGENTS.md`, `CONTRIBUTING.md`, `docs/governance/hard-rules-matrix.md`
- Governing skill: `sergeant-review-and-merge`

---

## Steps

### 1. Зарезервуй наступний номер правила

Перш ніж писати контент, **підтягни свіжий `main`** і подивись поточний максимальний номер правила:

```bash
git pull origin main
grep -E '^### [0-9]+\.' AGENTS.md | tail -1
```

Як новий номер бери `N+1`. **Не** резервуй номер без перевірки — гонки на мердж призводять до колізії слотів (так було з PR #1144 / #1146).

### 2. Запиши канонічний запис у `AGENTS.md`

Додай правило в розділ `## Hard rules (do not break)` у `AGENTS.md`, дотримуючись цієї структури:

```md
### N. Короткий імперативний заголовок

> Чому це hard rule? Один абзац-пояснення проблеми, яку правило усуває,
> бажано з лінком на реальний інцидент або PR, який його замотивував.

Пояснення правила. Включи:

- Що робити (✅ GOOD приклад)
- Чого не робити (❌ BAD приклад)
- Який ESLint-rule енфорсить (якщо є)
- Які шляхи / модулі під дією або винятки
```

Дотримуйся стилю наявних правил (особливо #8–#12, де є `GOOD`/`BAD` приклади коду).

### 3. Дзеркаль у `CONTRIBUTING.md`

Додай однорядкове резюме в секцію `### Hard rules (from AGENTS.md)` файлу `CONTRIBUTING.md`:

```md
N. **Короткий заголовок** — речення-резюме. Енфорситься через `<eslint-rule>`, якщо доречно.
```

CI-гейт `pnpm lint:hard-rules-registry` валить PR, якщо `AGENTS.md`, `CONTRIBUTING.md` і `docs/governance/hard-rules.json` дрейфують один від одного — усі троє рухаються в одному PR (Hard Rule #15).

### 4. Онови `CLAUDE.md` (якщо правило впливає на AI-флов)

Якщо правило змінює, як AI-агенти мають працювати (наприклад, додає нові pre-flight перевірки чи команди), онови розділ `## Before you write code` у `CLAUDE.md`.

### 5. Онови PR-template (якщо правило додає нову перевірку)

Якщо правило вводить новий пункт-чекбокс для PR-ів, додай його в `.github/PULL_REQUEST_TEMPLATE.md` у відповідну секцію.

### 6. Додай ESLint-енфорсмент (опційно, але бажано)

Якщо правило можна детектувати механічно:

1. Додай або розшир правило в `packages/eslint-plugin-sergeant-design/`.
2. Тести — у `packages/eslint-plugin-sergeant-design/__tests__/`.
3. Для перевірки запусти `pnpm lint:plugins`.

### 7. Додай запис у JSON-реєстр і перегенеруй матрицю

Додай новий запис у [`docs/governance/hard-rules.json`](../governance/hard-rules.json) за канонічною схемою:

```json
{
  "id": N,
  "title": "Короткий імперативний заголовок (точно як у AGENTS.md heading)",
  "scope": ["apps/web/src/**"],
  "severity": "blocker",
  "category": "lint-enforced-convention",
  "enforced_by": [
    { "kind": "eslint-rule", "ref": "sergeant-design/<rule-name>" },
    { "kind": "ci", "ref": "pnpm lint:plugins" }
  ],
  "links": [
    { "type": "agents", "ref": "#N" },
    { "type": "pr", "ref": "#1234" }
  ]
}
```

`kind` має бути одним із: `ci`, `eslint-rule`, `test`, `hook`, `branch-protection`, `codeowners`, `doc`, `convention`, `pr-template` (див. [`hard-rules.schema.json`](../governance/hard-rules.schema.json)).

`category` обов'язковий з [#1660](https://github.com/Skords-01/Sergeant/pull/1660) (ініціатива `0009-agent-os-hardening` PR 1.5). Має бути одним із:

- **`blocker-invariant`** — runtime/process-інваріант; порушення = data loss, outage або silent regression (наприклад, DB migration safety, no-force-push, no-skip-hooks). Бери для правил, у яких enforcement — це сам ран-тайм або процес.
- **`lint-enforced-convention`** — стилістичне чи процесне правило з механічним enforcement (ESLint plugin, commitlint, governance-sync, freshness). Та сама `severity: blocker`, але enforcement-гейт — це лінтер, не ран-тайм-інваріант. **Більшість нових design / convention правил ідуть сюди.**
- **`active-initiative`** — правило, що шипиться разом із явним allowlist + дедлайном (лінкований `TODO(NNNN-…): YYYY-MM-DD`). Для нового коду — blocker; наявні винятки трекаються окремо.

Легенда лежить унизу [`hard-rules-matrix.md`](../governance/hard-rules-matrix.md) і у преамбулі `## Hard rules` в `AGENTS.md`. `pnpm lint:hard-rules-registry` і `loadRegistry()` (`scripts/docs/generate-hard-rules-matrix.mjs`) відкидають правила без валідного `category`.

Далі перегенеруй індекс:

```bash
pnpm hard-rules:generate         # перезаписує docs/governance/hard-rules-matrix.md
pnpm hard-rules:check            # CI parity-перевірка (має пройти)
pnpm lint:hard-rules-registry    # sync-гейт JSON ↔ AGENTS.md ↔ CONTRIBUTING.md
```

Реєстр — це **єдине джерело правди для тулінгу**: CLI `pnpm hard-rules:list`, матрична doc і (далі) місячний policy-review-звіт усі читають його. Пропуск цього кроку робить правило невидимим для автоматики.

### 8. Онови freshness-заголовки

Pre-commit hook (`scripts/docs/bump-last-validated.mjs`) робить це автоматично, коли ти `git add` зачеплені doc-и. Після `git commit` перевір, що заголовки переписалися на сьогоднішню дату.

### 9. Commit і PR

```bash
git add AGENTS.md CONTRIBUTING.md CLAUDE.md \
        docs/governance/hard-rules.json \
        docs/governance/hard-rules-matrix.md \
        .github/PULL_REQUEST_TEMPLATE.md
git commit -m "docs(root): add Hard Rule #N — short title"
```

---

## Verification

- [ ] `grep -E '^### N\.' AGENTS.md` — правило існує з повним контентом.
- [ ] `docs/governance/hard-rules.json` — запис із цілочисельним `id: N` присутній.
- [ ] У новому записі — валідний `category` (`blocker-invariant` / `lint-enforced-convention` / `active-initiative`).
- [ ] `pnpm hard-rules:check` — матриця синхронна з JSON-реєстром.
- [ ] `pnpm lint:hard-rules-registry` — JSON ↔ AGENTS.md ↔ CONTRIBUTING.md синхронні.
- [ ] `pnpm hard-rules:list` — нове правило з'являється у CLI-дампі.
- [ ] `CONTRIBUTING.md` § Hard rules містить однорядкове дзеркало.
- [ ] Якщо стосується AI: `CLAUDE.md` оновлено.
- [ ] Якщо ESLint-енфорситься: `pnpm lint:plugins` зеленіє, `pnpm lint` ловить порушення.
- [ ] `pnpm format:check` — чисто.
- [ ] Без колізії слотів (номер правила унікальний і послідовний).

---

## See also

- [AGENTS.md](../../AGENTS.md) — канонічне (людське) місце для всіх Hard Rules.
- [docs/governance/hard-rules.json](../governance/hard-rules.json) — машино-читабельний реєстр.
- [docs/governance/hard-rules.schema.json](../governance/hard-rules.schema.json) — JSON Schema.
- [docs/governance/hard-rules-matrix.md](../governance/hard-rules-matrix.md) — авто-згенерована матриця-перехресні-посилання.
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — секція-дзеркало.
- [CLAUDE.md](../../CLAUDE.md) — pre-flight для AI-агентів.
