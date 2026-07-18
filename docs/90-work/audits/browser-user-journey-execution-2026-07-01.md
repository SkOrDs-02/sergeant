<!-- AUTO-GENERATED: false - authored execution log -->

# Browser user journey execution log — 2026-07-01

> **Last touched:** 2026-07-18 by @dimastahov16012003. **Next review:** 2026-10-16.
> **Status:** Closed — execution snapshot завершено.

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

| Час (Kyiv)       | Група            | Команда                                                                                                       | Результат                                                                       | Знахідки                                                                                                                                                                                                                                                                                                                                                                                                                 | Наступний крок                         |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 2026-07-02 00:4x | 0 Baseline       | локальний PostgreSQL 16 start + `CREATE ROLE hub` + `createdb hub`                                            | passed                                                                          | none                                                                                                                                                                                                                                                                                                                                                                                                                     | install                                |
| 2026-07-02 00:4x | 0 Baseline       | `pnpm install --frozen-lockfile`                                                                              | passed (exit 0)                                                                 | none                                                                                                                                                                                                                                                                                                                                                                                                                     | міграції                               |
| 2026-07-02 00:5x | 0 Baseline       | `pnpm --filter @sergeant/server db:migrate:dev` (локальний PG)                                                | **failed**: `extension "vector" is not available`                               | BRJ2-002 (env gap: pgvector відсутній у системному PG 16)                                                                                                                                                                                                                                                                                                                                                                | встановити pgvector / переоцінити шлях |
| 2026-07-02 01:0x | 0 Baseline       | `pnpm docs:gen-graph` після перенумерації ADR                                                                 | passed (473 nodes / 441 edges)                                                  | BRJ2-001 fixed                                                                                                                                                                                                                                                                                                                                                                                                           | ADR-gate                               |
| 2026-07-02 01:0x | 0 Baseline       | `node scripts/docs/check-adr-graph.mjs`                                                                       | passed (69 ADR, consistent)                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                        | link checker                           |
| 2026-07-02 01:1x | 0 Baseline       | `node scripts/docs/check-markdown-links.mjs`                                                                  | passed (усі 6130 internal links резолвляться; було 26 broken pre-existing)      | BRJ2-003 fixed                                                                                                                                                                                                                                                                                                                                                                                                           | freshness                              |
| 2026-07-02 01:1x | 0 Baseline       | `pnpm docs:check-freshness-coverage`                                                                          | passed (після додавання 4 маркерів)                                             | BRJ2-004 fixed                                                                                                                                                                                                                                                                                                                                                                                                           | CI re-run на PR #90                    |
| 2026-07-02 01:1x | 0 Baseline       | `node --test` docs-automation suite (CI-список)                                                               | passed (278/278)                                                                | —                                                                                                                                                                                                                                                                                                                                                                                                                        | Playwright baseline                    |
| 2026-07-02 01:3x | 0 Baseline       | smoke через `start-smoke-webserver.mjs`                                                                       | **failed**: скрипт жорстко викликає `pnpm db:up` (docker compose), демона немає | BRJ2-006 (env gap; обхід — ручний стек + `PW_SKIP_WEBSERVER=1`)                                                                                                                                                                                                                                                                                                                                                          | ручний стек                            |
| 2026-07-02 01:4x | 0 Baseline       | перший прогін `@critical`                                                                                     | **failed**: Playwright 1.59 хоче chromium rev 1217, передвстановлено 1194       | BRJ2-007 (env gap; fixed — symlink-шим 1217→1194, Chromium 141)                                                                                                                                                                                                                                                                                                                                                          | re-run                                 |
| 2026-07-02 01:5x | A+B+C+D Baseline | `PW_SKIP_WEBSERVER=1 playwright test --grep @critical` (ручний стек: API :3000 + preview :4173, локальний PG) | **19 passed / 3 failed (2.5m)**                                                 | 3 фейли — усі в `deep-module-crud.spec.ts` (finyk expense, nutrition pantry, fizruk body journal) = ті самі SQLite dual-write cache races, що зафіксовані у [deep-module-crud execution 2026-06-30](./deep-module-crud-browser-execution-2026-06-30.md) (browser runs 3–4). Відтворено 1:1 у Linux-середовищі → product defect, не env-флейк. Це і є причина червоного `Critical-flow E2E` на `main` (частина BRJ2-005). | fix phase: dual-write races            |

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

### BRJ2-002: локальний PG без `pgvector` ≥0.7 блокує міграції

- **Type:** env gap (це середовище, не продукт).
- **Repro:** `db:migrate:dev` → `extension "vector" is not available` (0A000);
  після встановлення Ubuntu-пакета 0.6.0 — `type "halfvec" does not exist`
  (42704; `halfvec` з'явився у pgvector 0.7).
- **Fix (за дозволом власника):** підключено офіційний PGDG apt-репозитарій →
  `postgresql-16-pgvector` 0.8.4 → `ALTER EXTENSION vector UPDATE`.
- **Retest:** `db:migrate:dev` → `migrate_ok` (1 982 мс, повна схема).

### BRJ2-005: `pnpm check` / `Test coverage` / `Critical-flow E2E` червоні на `main`

- **Type:** pre-existing product/CI gap (НЕ спричинено цим PR).
- **Evidence:** CI-ран `main@4ac3206` (28479344176, 2026-06-30): `check` →
  step «Format, lint, test, build» failure; `Test coverage (vitest)` → step
  «Run vitest with coverage» failure; `Critical-flow E2E` → step «Run
  critical-flow E2E suite» failure. Ті самі три джоби падають на PR #90 з
  тим самим підписом — база червона до гілки.
- **Fix:** поза скоупом docs-PR; діагностика — наступний крок цього прогону
  (локально відтворити `pnpm check` на змігрованій базі). Open.

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

## Fix-фаза: deep-CRUD dual-write races (BRJ2-005, E2E-гілка)

Діагностика — 3 паралельні read-only агенти (finyk create-clobber /
nutrition delete-resurrection / fizruk reload-loss) + живі Playwright-зонди.
Три кореневі продуктові фікси (коміт `615ce86`):

1. **nutrition** — `pantryChanged` порівнював `items` за референсом, а
   snapshot-екстрактор щоразу будує нові масиви → спурйозний
   `pantry-upsert` на кожен persist → петля overlay→persist→refresh, у
   якій stale in-flight upsert знімав tombstone щойно видаленого item
   (upsert `deleted_at = NULL` з runtime `clientTs`). Фікс: value-based
   порівняння items + інверсія тесту, що закріплював ref-семантику.
2. **fizruk** — `useDailyLog` писав через dual-write у структурну
   таблицю `fizruk_daily_log`, а читав з legacy LS/kv-ключа
   `fizruk_daily_log_v1` (розбіжність джерела читання і цілі запису) —
   після reload запис «зникав». Фікс: read-шлях мігровано на
   SQLite-overlay (дзеркало `useMeasurements`) + drain legacy-ключа у
   `residualImport` на boot.
3. **finyk + всі 3 модулі** — fire-and-forget dual-write-и
   інтерлівились: stale refresh міг бути останнім notify, і overlay
   клоберив оптимістичний UI-стан (з ескалацією у спурйозний
   blob-delete через diff-writer). Фікс: single-flight черга +
   «вікна мутацій» у `sqliteReadGate` (notify відкладається, поки є
   in-flight записи; останній запис бурсту доставляє єдиний
   causally-latest snapshot).

Супутнє: `dayKeyFromTx` переведено на Kyiv-anchor (доменний інваріант);
harness-фікси спеки — dispatchEvent для virtuoso-ряду/кнопки модалки,
раннє захоплення undo-тоста (TTL ~5с), роль-локатор після undo,
повторний expand дня після undo.

**Env-нотатки прогону:** (а) довгоживучий локальний PG накопичує
server-sync стан спільного тест-юзера між прогонами (routine ловив
«воскреслі» хабіти минулих прогонів через sync-реплей) — для CI-паритету
базу треба перестворювати перед фінальним прогоном (у CI вона свіжа
щоджоба); (б) системний PostgreSQL у контейнері спорадично зупиняється —
перевіряти `service postgresql status` перед прогоном.

## Підсумок

**Повна `@critical` сюїта: 22/22 passed (59.7s)** — проти свіжої БД,
свіжого auth-стейту, production preview build з фіксами. Всі 4 deep-CRUD
тести (finyk/nutrition/routine/fizruk) зелені: create → edit →
reload-persist → delete → undo-restore. Юніти зачеплених модулів:
162/162; typecheck чистий. Це закриває E2E-гілку BRJ2-005 — після мержу
`Critical-flow E2E` на `main` має стати зеленим. Гілки `pnpm check` /
`Test coverage` BRJ2-005 — окремий наступний крок (діагностика
локальним `pnpm check`).
