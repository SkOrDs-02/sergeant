# 0018 — Agent semantic retrieval (agent:find)

> **Last touched:** 2026-07-20 by @cursoragent. **Next review:** 2026-10-18.
> **Status:** Archived — code-complete (Phases 1–4, усі 7 DONE-критеріїв закриті). Архівовано 2026-06-14: lexical заміряно 2026-06-08 ([session-log](session-log-0018-agent-find-measurement-2026-06-08.md)), semantic (Voyage) заміряно 2026-06-14 ([session-log](session-log-0018-semantic-measurement-2026-06-14.md)) — recall@5=1.0 (= lexical), MRR 0.917→0.958, усі 12 golden-кейсів у semantic-режимі без degradation. Live-mode acceptance закрито; у репо-скоупі робити нічого.

## TL;DR

Sergeant має багатий машино-читабельний індекс себе (`knowledge-graph.json`, `symbol-index.json`, 33 skills, 61 playbook, 62 ADR), але все знання — **pull**: агент мусить здогадатися, що відкрити. Будуємо один семантичний вхід `pnpm agent:find "<query>"` (+ MCP-tool `agent_find`), що повертає рейтинговані `file:line`-пойнтери з типом і freshness-tier артефакту. Перевикористовуємо Voyage + eval-harness зі стеку `ai-memory`, але як **committed build-time індекс** (decoupled від runtime-БД), з lexical-фолбеком на випадок відсутності API-ключа. Архітектура — у [ADR-0066](../../../04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md).

## Чому зараз

- Спостережуваний патерн: агент grep-ає монорепо наосліп → палить час/токени, інколи читає не той/застарілий файл → хибні висновки.
- Maintainer розжовує контекст щоразу, бо немає шару, що тицяє агента носом у потрібний артефакт у момент задачі.
- Уся дорога інфраструктура (граф, symbol-index, Voyage-конвеєр, golden-eval) **уже стоїть** — бракує тонкого retrieval-входу поверх неї. Вартість входу мінімальна саме зараз.
- `eval-rag-recall.mjs` має `--mode=live` як placeholder — ця ініціатива дає йому перше реальне застосування на repo-retrieval.

## Скоуп

### In scope

- **Phase 1** — чанкер + committed-маніфест `retrieval-index.json` + `pnpm agent:find` CLI з lexical-режимом (без ембеддингів).
- **Phase 2** — Voyage-ембеддинги у gitignored content-hash cache + семантичний ranking + degradation на lexical без ключа.
- **Phase 3** — `--check`-gate (Hard Rule #24) + regen у `docs:gen-daily` + repo-retrieval golden-set і `recall@K`/`MRR` через `eval-rag-recall.mjs`.
- **Phase 4** — тонкий MCP-tool `agent_find` + промоція у `sergeant-start-here` як перший крок орієнтації.

### Out of scope

- Зміни в `ai_memories` runtime-сторі чи `POST /api/ai-memory/recall` (свідомо не чіпаємо — див. ADR-0066 Rationale).
- SessionStart auto-routing і `agent:where` symbol-lookup — це Tier 2, окрема ініціатива (споживатимуть цей індекс).
- Переписування `knowledge-graph.json` / `symbol-index.json`-генераторів — лише читаємо їхній вихід.

## План змін

### Phase 1 — Lexical-кістяк (committed) — ETA TBD після погодження

**Acceptance:** `pnpm agent:find "coerce bigint balance"` повертає `≤8` рейтингованих `path:line — title [type]` пойнтерів за <1с, без `VOYAGE_API_KEY`.

| PR         | Що ввозиться                                                                  | Файли                                                                                           |
| ---------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **PR-1.1** | Чанкер: граф-ноди + canonical-doc-секції + symbol-index → маніфест            | `scripts/agent/build-retrieval-index.mjs`, `docs/04-governance/governance/retrieval-index.json` |
| **PR-1.2** | `pnpm agent:find` CLI (lexical token-overlap rerank, `--type`/`--k`/`--json`) | `scripts/agent/find.mjs`, `package.json`                                                        |
| **PR-1.3** | `retrieval-index.schema.json` + `.gitignore` для `.cache/retrieval/`          | `docs/04-governance/governance/schemas/retrieval-index.schema.json`, `.gitignore`               |

### Phase 2 — Семантичний шар (committed)

**Acceptance:** з `VOYAGE_API_KEY` той самий запит повертає семантично-релевантні пойнтери (не лише keyword-overlap); без ключа — автоматичний lexical-фолбек, нуль помилок.

| PR         | Що ввозиться                                                       | Файли                                                      |
| ---------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| **PR-2.1** | Voyage-ембеддер чанків у content-hash cache (reuse budget-guard)   | `scripts/agent/embed-chunks.mjs`, `.cache/retrieval/*.bin` |
| **PR-2.2** | Cosine ranking + degradation-логіка (semantic → lexical без ключа) | `scripts/agent/find.mjs` (extend)                          |

### Phase 3 — Gates і якість (committed)

**Acceptance:** stale-маніфест валить CI; repo-retrieval `recall@K` ≥ baseline.

| PR         | Що ввозиться                                                                 | Файли                                                                                   |
| ---------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **PR-3.1** | `pnpm agent:find:check` (content-hash diff vs committed) wired у `pnpm lint` | `scripts/agent/build-retrieval-index.mjs` (`--check`), `package.json`                   |
| **PR-3.2** | Regen у `docs:gen-daily` + Hard Rule #24-реєстрація каталогу                 | `package.json`, `docs/04-governance/governance/hard-rules.json`, `knowledge-graph.json` |
| **PR-3.3** | Repo-retrieval golden-set + `eval-rag-recall.mjs`-режим                      | `scripts/eval/golden-retrieval.json`, `scripts/eval-rag-recall.mjs` (extend)            |

### Phase 4 — MCP + промоція (committed)

**Acceptance:** агент у будь-якій сесії викликає `agent_find` як перший крок орієнтації замість сліпого grep; `sergeant-start-here` його рекомендує.

| PR         | Що ввозиться                                                            | Файли                                                                               |
| ---------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **PR-4.1** | Тонкий MCP-tool `agent_find` поверх движка з find.mjs                   | `scripts/agent/mcp-server.mjs` (або наявний MCP-host), `.mcp.json`                  |
| **PR-4.2** | Промоція у `sergeant-start-here` + `docs/00-start/agents/onboarding.md` | `.agents/skills/sergeant-start-here/SKILL.md`, `docs/00-start/agents/onboarding.md` |

## Критерії DONE

- [x] `pnpm agent:find "<q>"` працює офлайн (lexical) і повертає рейтинговані `path:line [type]` пойнтери
- [x] З `VOYAGE_API_KEY` ранжування семантичне; без ключа — graceful lexical-фолбек, нуль крашів _(blend cosine+lexical у `find.mjs`; degradation покрита тестом + `cosineSimilarity` unit)_
- [x] `pnpm agent:check-index` блокує merge при stale-маніфесті; каталог зареєстровано під Hard Rule #24 _(scope + enforced_by + matrix у синхроні)_
- [x] Маніфест регенерується у `docs:gen-daily`; вектори — у gitignored cache (нуль binary-diff у git)
- [x] Repo-retrieval golden-set + `recall@K`/`MRR` gate проходить ≥ baseline _(recall@5=1.0, MRR=0.92; гейт у docs-automation тестах)_
- [x] MCP-tool `agent_find` доступний; `sergeant-start-here` його промотує
- [x] Заміряно (**lexical**): на репрезентативній вибірці з 8 реальних задач `agent:find` дає правильний canonical-артефакт rank-1 у 7/8 (8/8 у топ-3), замінюючи раунд сліпих grep-ів — before/after у [session-log 2026-06-08](session-log-0018-agent-find-measurement-2026-06-08.md). Заміряно (**semantic, Voyage**) 2026-06-14: 548 чанків ембеджено (`pnpm agent:embed`), усі 12 golden-кейсів ранжуються в semantic-режимі без degradation — recall@5=1.0 (= lexical), MRR 0.917→0.958 (cosine-blend піднімає, напр., «focus visible» з rank-2 на rank-1) — [session-log 2026-06-14](session-log-0018-semantic-measurement-2026-06-14.md). Залишковий live-mode acceptance закрито

## Ризики

| Ризик                                                           | Митигація                                                                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Ще один generated-артефакт, який стає stale**                 | `--check`-gate у CI (як `docs:check-graph`) + content-hash інвалідація + regen у `docs:gen-daily`                     |
| **Vendor lock / вартість Voyage на regen**                      | Ембедимо лише змінені (за content-hash) чанки; спільний budget-guard з ai-memory; lexical-режим повністю безкоштовний |
| **Lexical-режим дає низьку якість і агенти його ігнорують**     | Phase 3 golden-eval вимірює recall обох режимів; якщо lexical < поріг — піднімаємо як known-limitation у docs         |
| **Маніфест роздувається з symbol-index (≈300 → тисячі чанків)** | Tier-фільтр з графа (core завжди, extended за `--type`); symbol-чанки тільки `export`-рівня, не кожен identifier      |
| **Дубль з наявним runtime-recall плутає агентів**               | ADR-0066 чітко розділяє: `agent_find` = repo-знання (build-time), `ai-memory/recall` = user-data (runtime)            |

## Власник / ETA

- **Owner:** @Skords-01
- **Implementation agent:** Claude Code
- **ETA:** TBD — старт після founder-погодження ADR-0066; Phase 1 ≈ невеликий (lexical-кістяк), Phase 2–4 інкрементально.

## Посилання

- [ADR-0066 — Agent semantic retrieval over the knowledge graph](../../../04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md)
- [`docs/02-engineering/architecture/ai-memory.md`](../../../02-engineering/architecture/ai-memory.md) — embedding-конвеєр, який перевикористовуємо
- [`docs/02-engineering/architecture/rag-eval.md`](../../../02-engineering/architecture/rag-eval.md) — eval-harness і `recall@K`/`MRR` метрики
- [`docs/04-governance/governance/knowledge-graph.json`](../../../04-governance/governance/knowledge-graph.json) — головне джерело нод для індексу
- [`docs/04-governance/governance/symbol-index.json`](../../../04-governance/governance/symbol-index.json) — export-пойнтери
- Rule #24 [`catalog-check-generator.md`](../../../04-governance/governance/rules/24-catalog-check-generator.md), Rule #25 [`auto-generated-marker.md`](../../../04-governance/governance/rules/25-auto-generated-marker.md)
