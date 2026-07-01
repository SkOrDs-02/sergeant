<!-- AUTO-GENERATED: false - authored execution log -->

# Browser user journey execution log — 2026-07-01

> **Last validated:** 2026-07-01 by @claude. **Next review:** 2026-07-15.
> **Status:** Active

Canonical loop: [`browser-user-journey-loop.md`](./browser-user-journey-loop.md).
Попередній прогін: [`browser-user-journey-execution-2026-06-30.md`](./browser-user-journey-execution-2026-06-30.md).

## Мета прогону

Підняти покриття ledger-рядків з cold-load до **action-level** browser proof:
глибокі Playwright-флоу для core-модулів (Група B), справжній live-стрім
HubChat (Група C — розблоковано провайдерським ключем у env, поза репо),
offline/PWA (Група D). Кожен фейл — класифікація product / UX / harness / env,
стабільний `id`, fix або documented exception, post-fix retest.

## Контекст запуску

- Середовище: керований remote-контейнер (Linux), Chromium передвстановлений
  (`/opt/pw-browsers`), локальний PostgreSQL 16.13 (без Docker-демона —
  docker-compose шлях недоступний, локальний PG його заміняє).
- Гілка: `claude/top-5-complex-tasks-3hjxfd`.
- База: `postgresql://hub:hub@127.0.0.1:5432/hub` (дефолт smoke-конфіга).
- Секрети: провайдерський ключ живе лише в env серверного процесу на час
  live-проб; у файли репо, логи й Playwright-артефакти не потрапляє.

## Оркестрація

Гібрид за патерном `web-ux-cycle`: read-only фан-аут (gap-мапа ledger↔спеки +
драфти нових спек per-module) — паралельними агентами; прогони тестів —
серіалізовано в основній сесії (один локальний сервер+БД, паралельні прогони
конфліктували б).

## Evidence log

| Час (Kyiv)       | Група      | Команда                                                            | Результат                                                                  | Знахідки                                                  | Наступний крок                         |
| ---------------- | ---------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------- |
| 2026-07-02 00:4x | 0 Baseline | локальний PostgreSQL 16 start + `CREATE ROLE hub` + `createdb hub` | passed                                                                     | none                                                      | install                                |
| 2026-07-02 00:4x | 0 Baseline | `pnpm install --frozen-lockfile`                                   | passed (exit 0)                                                            | none                                                      | міграції                               |
| 2026-07-02 00:5x | 0 Baseline | `pnpm --filter @sergeant/server db:migrate:dev` (локальний PG)     | **failed**: `extension "vector" is not available`                          | BRJ2-002 (env gap: pgvector відсутній у системному PG 16) | встановити pgvector / переоцінити шлях |
| 2026-07-02 01:0x | 0 Baseline | `pnpm docs:gen-graph` після перенумерації ADR                      | passed (473 nodes / 441 edges)                                             | BRJ2-001 fixed                                            | ADR-gate                               |
| 2026-07-02 01:0x | 0 Baseline | `node scripts/docs/check-adr-graph.mjs`                            | passed (69 ADR, consistent)                                                | —                                                         | link checker                           |
| 2026-07-02 01:1x | 0 Baseline | `node scripts/docs/check-markdown-links.mjs`                       | passed (усі 6130 internal links резолвляться; було 26 broken pre-existing) | BRJ2-003 fixed                                            | freshness                              |
| 2026-07-02 01:1x | 0 Baseline | `pnpm docs:check-freshness-coverage`                               | passed (після додавання 4 маркерів)                                        | BRJ2-004 fixed                                            | CI re-run на PR #90                    |
| 2026-07-02 01:1x | 0 Baseline | `node --test` docs-automation suite (CI-список)                    | passed (278/278)                                                           | —                                                         | Playwright baseline                    |

## Знахідки

### BRJ2-001: колізія номерів ADR 0066/0067/0068 ламає `docs:gen-graph` і ADR-gate

- **Type:** doc-drift (pre-existing на `main`, не спричинено цим прогоном).
- **Repro:** `pnpm docs:gen-graph` → `node adr:0068: duplicate`, exit 1;
  CI `ADR graph` + on-disk parity-тести червоні.
- **Причина:** harness-rollout 2026-06-29 (PR #72–75) видав ADR-ам номери
  0066/0067/0068, які вже були зайняті (agent-find retrieval 06-08,
  engagement mechanisms 06-20, pricing v4 06-27); 0069 не був внесений у
  README-індекс.
- **Fix (за рішенням власника 2026-07-01, у цьому ж PR):** harness-ADR
  перенумеровано 0066→0070, 0067→0071, 0068→0072 (`git mv` + правка всіх
  зворотних посилань: harness-доки, governance-доки, tools/README,
  `snapshot.mjs`, `AGENTS.md § Harness version`); ai-pr-checklist лишився
  на легітимно вільному 0069 і внесений у README-індекс разом з 0070–0072;
  next-ADR ноту зсунуто на 0073. Хедер 0070 нормалізовано до стандартного
  list-формату (`Status`/`Supersedes`).
- **Retest:** `pnpm docs:gen-graph` зелений після перенумерації (див.
  evidence log).

### BRJ2-002: локальний PG без `pgvector` блокує міграції

- **Type:** env gap (це середовище, не продукт).
- **Repro:** `db:migrate:dev` → `extension "vector" is not available` (0A000).
- **Fix:** встановити `postgresql-16-pgvector` у контейнері; якщо пакет
  недоступний — задокументувати як env-exception і ганяти smoke проти
  міграцій до першої vector-залежної (якщо вони йдуть пізніше). Open.

### BRJ2-003: 26 broken internal links у harness-доках (pre-existing)

- **Type:** doc-drift (harness-rollout доки писались repo-root-style шляхами).
- **Fix:** виправлено глибину відносних шляхів у `harness-engineering-v1.md`,
  `governance/{ai-pr-checklist,harness-versioning,snapshot}.md`,
  `tools/entropy-janitors/README.md`; два фантомні таргети
  (`hard-rules.md`, `ai-markers.md`) перенаправлено на реальні
  (`rules/21-pino-redaction-policy.md`, `AGENTS.md § AI markers`).
- **Retest:** `check-markdown-links` — усі лінки резолвляться.

### BRJ2-004: 4 файли без freshness-маркерів (pre-existing, Rule #10)

- **Type:** doc-drift.
- **Fix:** додано маркери у `tools/agent-snapshot/README.md`,
  `tools/entropy-janitors/README.md`,
  `docs/04-governance/governance/entropy-janitors/README.md`, `WORKLOG.md`.
- **Retest:** `docs:check-freshness-coverage` зелений.

_(далі — формат: `BRJ2-NNN`, тип, репро, fix/exception, retest)_

## Підсумок

_(заповнюється при закритті прогону)_
