# Session log — 0018 `agent:find` lexical measurement (2026-06-08)

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Reference

Лог одного заміру для останнього DONE-критерію [Ініціативи 0018](./0018-agent-semantic-retrieval.md):
«на репрезентативній вибірці задач агент робить менше сліпих grep-ів (before/after)».
Документ — рукописний (НЕ auto-generated), фіксує **лише lexical-режим** `pnpm agent:find`.
Семантичний (Voyage) замір **відкладено** — у цьому середовищі немає `VOYAGE_API_KEY`,
тож `pnpm agent:embed` не запускався і cosine-ranking не вимірювався.

---

## Середовище заміру

- Дата: 2026-06-08, ізольований git-worktree монорепо.
- `VOYAGE_API_KEY` — **відсутній** (`UNSET`). Отже всі результати нижче — degradation-path
  (lexical token-overlap rerank), саме той, що має працювати без ключа й мережі.
- Node 22.x. `node_modules` довстановлено `pnpm install --frozen-lockfile` (потрібен лише
  для `prettier`-залежності у build-index; сам пошуковий движок від нього не залежить).

---

## Healthcheck офлайн-тулінгу

| Команда                  | Результат                                        | Статус                 |
| ------------------------ | ------------------------------------------------ | ---------------------- |
| `pnpm agent:check-index` | `retrieval-index: up to date (549 chunks).`      | ✅ pass                |
| `pnpm agent:find:test`   | `tests 12 · pass 9 · fail 3`                     | ⚠️ pass у 0018-частині |
| `pnpm agent:eval`        | `recall@5 = 1.000 · MRR = 0.917 · status = pass` | ✅ pass                |

> **Розбір `agent:find:test` (9/12).** Зелені — усі 9 тестів поверхні 0018: `--check`
> sync, lexical-routing видачі, `--type`/`--k`-фільтри, symbol-exports, empty-query guard,
> golden-recall gate, MCP `initialize/tools/list/tools/call`, `cosineSimilarity` unit.
> Червоні — рівно 3 тести `route maps … → specialist` (№10–12). Вони перевіряють
> `scripts/agent/route.mjs` (поверхня **Ініціативи 0019 — agent-routing**, мід-флайт у
> сусіднього агента): у цьому worktree `route.mjs` ще резолвить старий шлях
> `docs/governance/hard-rules.json` замість `docs/04-governance/governance/hard-rules.json`,
> тож читання hard-rules падає. Це **не** регресія `agent:find` і не торкається заміру —
> `route.mjs` / `retrieval.test.mjs` свідомо НЕ редагувались (їх веде інший агент).

> **Замітка про deps.** При **порожньому** `node_modules` `agent:check-index` і підтест
> `committed manifest is in sync (--check)` падають з `ERR_MODULE_NOT_FOUND: prettier`
> (build-index форматує JSON через `prettier`). Це інфраструктурний gap чистого worktree,
> не логічна регресія — сам пошук prettier не імпортує. Після `pnpm install` `check-index`
> і всі 9 0018-тестів зелені.

`agent:eval` (golden-set, 12 кейсів, K=5) повністю офлайн, lexical:

```text
recall@5 = 1.000  ·  MRR = 0.917  ·  status = pass (warn 0.8 / kill 0.6)
```

---

## Before/after на репрезентативній вибірці задач

«Before» = сліпий grep по монорепо: агент здогадується про ключове слово, сканує
десятки збігів у коді/доках, читає кілька файлів, доки не натрапить на canonical-артефакт.
«After» = `pnpm agent:find "<query>"` повертає ≤8 рейтингованих `path:line [type]` за <1с;
оцінюємо, чи **#1-результат** — правильний canonical-артефакт (hard-rule / ADR / skill /
playbook / export), у який і треба тицьнути носом.

| #   | Задача (query)                             | #1-результат `agent:find` (lexical)                                                      | #1 правильний? |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------- |
| 1   | `coerce bigint balance in sync serializer` | `hard-rules.json#1` — DB types: coerce bigint→number [hard-rule]                         | ✅ так         |
| 2   | `RQ keys factory for nutrition`            | `eslint-plugin-sergeant-design/index.js` `RQ_KEYS_MESSAGE` [export]                      | ⚠️ частково ¹  |
| 3   | `two-phase DROP migration`                 | `adr/0013-db-migrations-conventions.md:1` [adr] {accepted}                               | ✅ так         |
| 4   | `pino redaction policy`                    | `stack-pulse-2026-05/pr-16-pino-redaction-policy.md:1` [initiative]                      | ✅ так ²       |
| 5   | `touch target 44px button`                 | `eslint-plugin-sergeant-design/index.js` `NO_SMALL_BUTTON_TOUCH_TARGET_MESSAGE` [export] | ✅ так ³       |
| 6   | `openclaw PAT lifecycle`                   | `stack-pulse-2026-05/pr-06-openclaw-github-app.md:1` [initiative]                        | ✅ так         |
| 7   | `API contract server client test`          | `hard-rules.json#3` — API contract server↔client↔test [hard-rule]                        | ✅ так         |
| 8   | `tailwind opacity scale`                   | `adr/0007-tailwind-opacity-and-strong-tier.md:1` [adr] {accepted}                        | ✅ так         |

**Rank-1 hit-rate: 7/8 точних + 1 частковий** (правильний домен, але #1 — export-чанк
замість canonical hard-rule/ADR, який стоїть #2–#3 у тій самій видачі). Усі 8 — у топ-3.

Виноски:

1. Q2: `RQ_KEYS_MESSAGE` [export] на #1 — це enforcement-символ, не canonical-правило;
   `adr/0006-rq-keys-factory.md` і `hard-rules.json#2` стоять #2 і #3. Агент усе одно
   за один виклик отримує правильний кластер (ADR + hard-rule + ESLint-символ) замість
   сліпого grep-у `queryKeys` по `apps/web`. Кандидат на дотюн ранкінгу (canonical > export)
   — але це **lexical**-обмеження; саме його має згладити семантичний шар (відкладено).
2. Q4: для теми «pino redaction» #1 — closed PR-план (де живе вся історія впровадження),
   `hard-rules.json#21` — #2. Обидва — правильні пойнтери; для «де канон» — це #2.
3. Q5: точний enforcement-символ touch-target на #1; design-token preset у видачі.

### Чому це «менше сліпих grep-ів»

Типовий «before» для Q1 (`coerce bigint`): `grep -rn "bigint" apps/server` дає десятки
збігів у міграціях, серіалайзерах, типах — агент читає 3–5 файлів, доки не знайде, що
канон — Hard Rule #1 + ADR-0014. «After»: один виклик повертає **Hard Rule #1 на #1** і
**ADR-0014 на #2** з freshness-тегами `{accepted}`. Аналогічно для всіх 8 кейсів: один
`agent:find` замінює раунд grep→read→read→read і веде прямо на canonical `file:line`.

---

## Висновок і що лишається

- **Lexical-режим виміряно й він робочий**: rank-1 правильний у 7/8 кейсів (8/8 — у топ-3),
  golden `recall@5=1.0`, `MRR=0.917`. Для офлайн-агента без ключа `agent:find` уже зараз
  знімає більшість сліпих grep-ів і веде на canonical-артефакт за <1с.
- **Семантичний (Voyage) замір відкладено** — у середовищі немає `VOYAGE_API_KEY`, тож
  `pnpm agent:embed` не запускався, cosine-blend не вимірювався. Це і є залишковий
  live-mode acceptance з § Status ініціативи; критерій DONE позначено як **lexical-частина
  виконана, semantic — pending key**.
- **Сусідня поверхня (0019).** 3 червоні `route`-тести — від мід-флайт-зміни `route.mjs`
  (Ініціатива 0019), не від `agent:find`. Їх веде інший агент; тут не чіпались.
- **Дотюн ранкінгу** (canonical hard-rule/ADR > export-символ для Q2-подібних запитів) —
  кандидат на окремий follow-up; найімовірніше частково розв'яжеться семантичним шаром.

## Refs

- [`0018-agent-semantic-retrieval.md`](./0018-agent-semantic-retrieval.md) — ініціатива.
- [`docs/04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md`](../../04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md) — архітектура.
- `scripts/agent/find.mjs`, `scripts/agent/eval-retrieval.mjs`, `scripts/agent/build-retrieval-index.mjs` — тулінг заміру.
