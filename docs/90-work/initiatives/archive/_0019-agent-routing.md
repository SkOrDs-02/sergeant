# 0019 — Agent routing (`agent:route`)

> **Last touched:** 2026-06-14 by @Skords-01. **Next review:** 2026-09-12.
> **Status:** Archived — code-complete (PR-1…3 ✅, 12/12 тестів зелені). Архівовано 2026-06-14: усі кодові критерії DONE закриті; єдиний відкритий пункт — live-mode harness-wiring у SessionStart — **свідомо поза репо** (harness config не комітиться), тож у репо-скоупі робити нічого. **2026-06-08:** полагоджено регресію — `route.mjs` читав `hard-rules.json` зі старого шляху `docs/governance/` (файл переїхав у `docs/04-governance/governance/` під час docs-reorg), через що `pnpm agent:route` падав з ENOENT і 3 route-тести у `retrieval.test.mjs` були червоні. Шлях виправлено.

## TL;DR

Tier 2 поверх Initiative 0018. `agent:find` відповідає «де щось живе»; `agent:route` відповідає «з чого почати **цю** зміну» — за git-diff/гілкою виводить потрібний specialist-skill + активні hard-rules (зі scope-глобів) + suggested `agent:find`. Б'є саме в третій біль: maintainer не мусить щоразу розжовувати «це server, дій за такими правилами». Tool-agnostic primitive — **без** committed harness-хука (поважає принцип «harness config поза репо»); кожен харнес сам загортає його у свій SessionStart.

## Чому зараз

- Initiative 0018 дав retrieval-вхід; орієнтація («який skill + які правила діють») усе ще ручна — агент мусить свідомо застосувати routing-таблицю з AGENTS.md.
- Уся потрібна data вже є: `scripts/docs/skill-mapping.json` (path→skill, канонічна per Initiative 0015) і `docs/04-governance/governance/hard-rules.json` (scope-глоби). Бракує лише тонкого primitive, що їх склеює за фактичним diff-ом.
- Природне розширення agent-OS після 0018; вартість мінімальна (reuse, нуль нових залежностей).

## Скоуп

### In scope

- `pnpm agent:route` — git-diff/explicit-paths → specialist-skill(s) + active hard-rules + suggested `agent:find`; `--base`, `--json`, explicit paths.
- Reuse `skill-mapping.json` + `hard-rules.json` (нуль дубльованої routing-логіки).
- Промоція у `sergeant-start-here`.
- Tests + CI wiring.

### Out of scope

- **Committed harness-хук** (Claude `.claude/settings.json` SessionStart тощо) — свідомо ні: AGENTS.md тримає harness config поза репо. Кожен харнес загортає `agent:route` у свій session-start зі свого global config.
- Нова routing-data — лише читаємо наявну.
- `agent:where <symbol>` — субсумовано `agent:find --type export`; окремий скрипт не робимо.

## План змін

| PR       | Що ввозиться                                                                 | Файли                                         | Стан |
| -------- | ---------------------------------------------------------------------------- | --------------------------------------------- | ---- |
| **PR-1** | `agent:route` CLI (reuse skill-mapping + hard-rules scope) + npm-скрипт      | `scripts/agent/route.mjs`, `package.json`     | ✅   |
| **PR-2** | Tests (server/migration/web routing + universal-rules) у docs-automation job | `scripts/agent/__tests__/retrieval.test.mjs`  | ✅   |
| **PR-3** | Промоція у start-here                                                        | `.agents/skills/sergeant-start-here/SKILL.md` | ✅   |

## Критерії DONE

- [x] `pnpm agent:route` за git-diff виводить skill(s) + active hard-rules + suggested `agent:find`; `--json` machine-readable
- [x] Reuse `skill-mapping.json` + `hard-rules.json` (нуль дубльованої routing-логіки); label без SKILL.md (напр. `docs`) рендериться як «no specialist skill», не як хибний `Read`
- [x] Tests у CI (server→server-api+#1, migration→data-and-migrations+#4, web→web-ui+universal)
- [x] `sergeant-start-here` згадує `agent:route`
- [ ] Live-mode: harness-wiring у SessionStart (поза репо) + заміри, чи менше «розжовування» на старті _(observational)_

## Ризики

| Ризик                                                   | Митигація                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **skill-mapping.json дрейфує від реальних skill-дирів** | `exists`-перевірка SKILL.md у route; label без каталогу рендериться окремо, не як `Read`      |
| **Спокуса закомітити Claude-специфічний хук у репо**    | Свідомо out-of-scope; AGENTS.md — джерело правди; harness-wiring живе в global config харнеса |
| **glob-matcher розходиться з рештою gate-ів**           | Підтримує лише `**`/`*` (як scope-глоби hard-rules); покрито тестами на реальних шляхах       |
| **Дубль routing-логіки з open-work generator**          | Та сама `skill-mapping.json` — один source of truth для обох                                  |

## Власник / ETA

- **Owner:** @Skords-01
- **Implementation agent:** Claude Code
- **ETA:** code-complete; live-mode acceptance — за наявності реальної сесійної роботи.

## Посилання

- [Initiative 0018 — Agent semantic retrieval](../0018-agent-semantic-retrieval.md) (Tier 1, sibling)
- [ADR-0066](../../../04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md)
- [`scripts/docs/skill-mapping.json`](../../../../scripts/docs/skill-mapping.json) — канонічна path→skill мапа (Initiative 0015)
- [`docs/04-governance/governance/hard-rules.json`](../../../04-governance/governance/hard-rules.json) — scope-глоби для active-rules
- [`AGENTS.md` § Harness config lives outside the repo](../../../../AGENTS.md#harness-config-lives-outside-the-repo)
