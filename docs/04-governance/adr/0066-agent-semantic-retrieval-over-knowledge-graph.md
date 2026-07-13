# ADR-0066: Agent semantic retrieval over the knowledge graph

> **Last touched:** 2026-07-13 by @github-actions[bot]. **Next review:** 2026-10-11.
> **Status:** Active

- **Status:** Accepted
- **Date:** 2026-06-08
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/04-governance/adr/0058-knowledge-graph-schema.md`](./0058-knowledge-graph-schema.md) — джерело нод/ребер, що індексуються
  - [`docs/04-governance/adr/0059-symbol-extraction-via-typescript-compiler-api.md`](./0059-symbol-extraction-via-typescript-compiler-api.md) — `symbol-index.json` як ще одне джерело пойнтерів
  - [`docs/04-governance/adr/0028-pgvector-ai-memory.md`](./0028-pgvector-ai-memory.md) — наявний production-RAG-стек (Voyage + pgvector), який ми **не** перевикористовуємо як стор (див. Decision)
  - [`docs/02-engineering/architecture/ai-memory.md`](../../02-engineering/architecture/ai-memory.md), [`docs/02-engineering/architecture/rag-eval.md`](../../02-engineering/architecture/rag-eval.md) — embedding-конвеєр і eval-harness, який перевикористовуємо
  - [`docs/90-work/initiatives/0018-agent-semantic-retrieval.md`](../../90-work/initiatives/archive/_0018-agent-semantic-retrieval.md) — план виконання

---

## Context and Problem Statement

У Sergeant **достатньо** машино-читабельного знання про себе: `knowledge-graph.json` (10 типів нод, 6 типів ребер), `symbol-index.json` (≈298 експортів із usage-графом), 33 skills, 61 playbook, 62 ADR, 26 hard rules, per-file freshness/lifecycle-маркери. Проблема не в **кількості** артефактів, а в **активації**: агент на старті задачі мусить _здогадатися_, котрий із цих сотень файлів релевантний. Наслідки спостережувані щодня:

- **Палений час/токени** — агент grep-ає монорепо наосліп замість одного точного пойнтера.
- **Хибні висновки** — агент читає не той (або застарілий) файл і робить неправильний висновок.
- **Maintainer розжовує контекст щоразу** — бо нічого не тицяє агента носом у потрібний артефакт у _момент_ задачі.

Усе наявне знання — **pull**: лежить як файли, які треба свідомо відкрити. Бракує одного запитуваного входу, що на природномовний запит («де серіалізація bigint балансу», «який playbook для нового SQL-міграційного кроку») повертає рейтинговані `file:line`-пойнтери з типом артефакту.

`knowledge-graph.json` уже агрегує ноди — але він queryable лише структурно (за `id`/`type`/`edge`), не семантично. Немає шару «схоже за змістом».

## Considered Options

1. **Committed build-time retrieval index + CLI/MCP entrypoint** — генератор чанкує ноди графа + секції docs + symbol-index, ембедить через Voyage, пише **маніфест** чанків у git і **вектори** у gitignored content-hash cache. Запит — `pnpm agent:find "<q>"` (+ тонкий MCP-врапер): ембедить запит, cosine по локальному індексу, повертає top-K пойнтерів. Lexical-фолбек (BM25-подібний) працює без `VOYAGE_API_KEY`.
2. **Перевикористати production `ai_memories` (pgvector)** — додати `source='repo'`, інжестити docs у той самий стор, запит через наявний `POST /api/ai-memory/recall`.
3. **Чисто lexical** — keyword/BM25 поверх графа+symbol-index, без ембеддингів узагалі.
4. **Do nothing** — лишити агентам grep + ручний вибір skill за routing-таблицею.

## Decision

Обираємо **Option 1 — committed build-time index + entrypoint**, з обовʼязковим **lexical-фолбеком** (тобто Option 3 як degraded-режим усередині Option 1).

Конкретно:

- **Джерела індексу:** `knowledge-graph.json` (ноди core+extended), секції canonical-docs (`docs/04-governance/adr`, `docs/00-start/playbooks`, `docs/04-governance/governance/rules`, `docs/02-engineering/architecture`, `.agents/skills/**/SKILL.md`), `symbol-index.json` (export → file:line + owning-package).
- **Чанкінг:** одна нода/секція = один чанк; кожен чанк несе `{ id, type, path, line, title, text, tier }`. `type` повторює enum нод графа + `export` + `doc-section`.
- **Сторідж (ключове):** **маніфест** `docs/04-governance/governance/retrieval-index.json` (чанки без векторів — diffable, queryable, у git) + **вектори** у `.cache/retrieval/<contentHash>.bin` (**gitignored**, регенерується лазі за content-hash). Жодних векторів у git → нема noisy diff (мітигація болю з ADR-0058).
- **Ембеддинги:** той самий `voyage-3.5-lite` (1024d), що й `ai-memory` — спільний клієнт/budget-guard, але **окремий код-шлях** (не runtime-стор).
- **Entrypoint:** `pnpm agent:find "<query>" [--type skill|adr|...] [--k 8] [--json]` + тонкий MCP-tool `agent_find`, що викликає той самий движок. Вивід — рейтингований список `path:line — <title> [<type>]` зі score.
- **Degradation:** нема `VOYAGE_API_KEY` → автоматично lexical-режим (token-overlap rerank поверх маніфесту). Агент завжди отримує відповідь, навіть офлайн.
- **Якість:** перевикористати golden-set + `eval-rag-recall.mjs` harness (ADR-0028/`rag-eval.md`) з окремим golden-сетом «query → expected chunk id» для repo-retrieval; gate `recall@K`/`MRR`.

## Rationale

- **Чому не runtime `ai_memories` (Option 2):** той стор `HALFVEC(1024)`, **партиційований per `user_id`**, із CHECK-enum source-ів під продуктові домени (`chat`/`finyk`/`nutrition`/…) і вимагає **живого сервера + Postgres + BullMQ**. Агент у CI чи локальній сесії їх не має — прив'язка retrieval-тулу до бекенду зробила б його недоступним саме там, де він найпотрібніший. Repo-знання — не user-data; змішувати їх у одному партиційованому сторі семантично хибно.
- **Чому committed-маніфест + cache, а не SQLite/runtime (узгоджено з ADR-0058):** ADR-0058 уже обрав «JSON over SQLite: Git-friendly, no runtime» для графа. Той самий принцип: маніфест diff-иться у PR, працює без native-deps і без сервера. Вектори тримаємо поза git (binary, регенеровані) — отримуємо Git-friendliness без noisy binary diff.
- **Чому lexical-фолбек обовʼязковий:** інакше тул німіє без API-ключа (CI без секретів, офлайн-сесія). Degraded-режим гарантує, що агент **завжди** має кращу за сліпий grep відповідь.
- **Чому reuse Voyage/eval, а не нова залежність:** клієнт, budget-guard і `eval-rag-recall.mjs` уже існують і протестовані; новий код — лише чанкер + cosine + CLI. Мінімальна площа.
- **Чому це б'є саме у три болі:** один вхід замість сліпого grep (час/токени), пойнтер із freshness-tier і типом (менше хибних висновків — видно, чи джерело Active/Deprecated), і push-точка для SessionStart-хука та start-here (менше розжовування).

## Consequences

### Positive

- Один запитуваний семантичний вхід над усім наявним знанням; агент перестає grep-ати наосліп.
- Decoupled від runtime — працює у CI, локально, офлайн (lexical), без сервера/БД.
- Перевикористовує Voyage + eval-harness; нова площа коду мінімальна.
- Маніфест diff-иться у PR — видно, що додалось/змістилось в індексі.
- Природний споживач для майбутнього SessionStart-auto-routing і symbol-lookup (Tier 2 ініціативи).

### Negative

- Ще один generated-артефакт із `--check`-gate (Hard Rule #24) → треба wired у `pnpm lint` і regen у `docs:gen-daily`. Мітигація: дотримуємось наявного generator-and-validator патерну.
- Ембеддинг-стійл: маніфест/вектори можуть відстати від docs. Мітигація: content-hash інвалідація + `--check` у CI (як `docs:check-graph`).
- Voyage-вартість на regen. Мітигація: ембедимо лише чанки зі зміненим content-hash; budget-guard спільний з ai-memory.

### Neutral

- Не змінює `ai_memories`, `knowledge-graph.json`-генератор чи `symbol-index.json` — лише **читає** їхній вихід.
- Не вводить нових рантайм-залежностей у застосунки (тул живе у `scripts/` + опційний MCP).

## Compliance

- `pnpm agent:check-index` (CI gate, wired у `pnpm lint`) — exit 1, якщо committed `retrieval-index.json` ≠ regenerated із поточних джерел (Hard Rule #24 — catalog має `--check` generator).
- Маніфест `retrieval-index.json` має `<!-- AUTO-GENERATED: ... -->`-семантику через схему (Hard Rule #25 — generated-артефакт).
- Repo-retrieval golden-set + `recall@K`/`MRR` gate через наявний `eval-rag-recall.mjs` режим (узгоджено з `rag-eval.md`).
- Lifecycle/freshness-маркери на нових docs (Hard Rule #10) + discoverability з AGENTS.md (Hard Rule #15 doc-sync).

## Links

- [`docs/90-work/initiatives/0018-agent-semantic-retrieval.md`](../../90-work/initiatives/archive/_0018-agent-semantic-retrieval.md)
- [`docs/04-governance/adr/0058-knowledge-graph-schema.md`](./0058-knowledge-graph-schema.md)
- [`docs/02-engineering/architecture/rag-eval.md`](../../02-engineering/architecture/rag-eval.md)

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                             | Merged     |
| -------------------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| [#292](https://github.com/Skords-01/Sergeant/pull/292)   | docs(docs): fix documentation drift found in 2026-07-13 audit     | 2026-07-13 |
| [#3573](https://github.com/Skords-01/Sergeant/pull/3573) | docs(agents): archive initiative 0018 (agent:find, code-complete) | 2026-06-14 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
