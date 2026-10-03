# Rule 26 — Merged PRs touching canonical docs must update `docs/governance/pr-ledger/index.json`

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-09-30 by @claude
> **Next review:** 2027-04-12
> **Status:** Active

> Per-rule canonical body for Hard Rule #26. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break). The machine-readable registry lives in [`docs/governance/governance/hard-rules.json`](../hard-rules.json). 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

Canonical docs that receive PR backlinks (whitelist enforced by [`scripts/ci/update-pr-backlinks.mjs`](../../../../scripts/ci/update-pr-backlinks.mjs)):

- `docs/governance/adr/*.md` (excluding `TEMPLATE.md`, `README.md`)
- `docs/work/specs/initiatives/*.md` (excluding `archive/`, `follow-ups.md`, `README.md`)
- `docs/start/instructions/*.md` (excluding `INDEX.md`, `README.md`, `_TEMPLATE-*`)
- `docs/governance/governance/rules/*.md` (excluding `README.md`)
- `docs/work/specs/audits/*.md` (excluding `README.md`) — **додано 2026-09-15**

`docs/engineering/architecture/` лишається excluded — architecture is already covered by Phase 3 drift-detectors.

### Чому аудити повернули в скоуп (2026-09-15)

Первісне рішення виключало `docs/work/specs/audits/` з формулюванням «audits are
snapshot-natured» — зріз стану на дату, а не живий канон. Аргумент був
розумний, але практика його спростувала.

За один робочий день реєстр наскрізного огляду 2026-09-13 правився **шість
разів** (PR #38, #43, #45 закривали знахідки C2/C3/C4/C10 і переписували їхні
статуси), і **чотири рази** виявлялось, що записане в ньому розходиться з
кодом: хибне число 579 у C2, застарілий рецепт C4, неточний опис розмірів у
C10 і неіснуючий дефект PDF-експорту в M3. Кожна розбіжність коштувала часу на
з'ясування, чи це баг.

Тобто аудит тут поводиться не як знімок, а як **живий робочий документ** — той
самий жанр, що ініціативи. А саме для таких PR-беклінки й існують: питання
«які PR-и міняли статуси знахідок цього огляду?» було рівно тією git-log
археологією, проти якої писалося правило.

Виняток лишається чинним для аудитів, які справді є знімками й після публікації
не змінюються. Механізм це розрізняє сам: доки без записів у реєстрі блока не
отримують (`applyBlock`: `blockText == null and no existing block → no change`),
тож 36 наявних файлів лишаються недоторканими, доки їх не торкнеться PR.

## Enforced by

- **convention** — `pnpm docs:sync-pr-ledger` дочитує метадані змерджених PR з Bitbucket API і перебудовує блоки. Покриває лише архівні Bitbucket-PR (2026-09-23..29).
- **ci** — `pnpm docs:check-pr-ledger` (крок `pnpm lint`) звіряє реєстр ↔ блоки ↔ схему. Exit 1 на будь-якому дрейфі.
- **Повнота зараз не стережеться (з 2026-09-30).** Код повернувся на GitHub ([ADR-0102](../../adr/0102-github-actions-ci-and-autodeploy.md)), а писач реєстру вміє читати лише Bitbucket. Нагадування в `pre-push` прибрано разом із перевіркою змердженого PR на Bitbucket, а [`pr-backlinks.yml`](../../../../.github/workflows/pr-backlinks.yml) вимкнено змінною репозиторію `PR_LEDGER_ON_GITHUB`: без неї він упав би на відсутньому `BITBUCKET_TOKEN`. Повернути автоматику = навчити фетчер GitHub API (як було до 2026-09-23) і ввімкнути змінну.

### Повернення на GitHub (2026-09-30)

До моменту, поки фетчер не читає GitHub, PR, що торкаються канонічних доків, у реєстр не потрапляють самі. Це відома дірка, а не зелений гейт: `--check` і далі звіряє лише форму.

### Чому механізм змінився (2026-09-23)

До переїзду на Bitbucket правило тримали дві речі, і обидві померли одночасно: воркфлоу [`pr-backlinks.yml`](../../../../.github/workflows/pr-backlinks.yml) (`pull_request_target: closed` + `merged == true`), який після мержу відкривав follow-up PR, і `gh pr view` усередині писача. GitHub-акаунти заблоковані, Bitbucket pipelines немає, `gh` з Bitbucket не працює.

Реєстр тихо став на 2026-09-17: за наступний тиждень 27 комітів торкнулись канонічних доків, і жоден не записався. **Гейт при цьому лишався зеленим**, бо `--check` звіряє форму (реєстр ↔ блоки ↔ схема), а не повноту. Це та сама вада, що двічі глушила правило раніше, тільки з третього боку: перевірка, яка не може побачити пропущений запис, не відрізняє повний реєстр від порожнього.

Тому з 2026-09-23 до 2026-09-30 повноту стеріг окремий механізм (`pre-push` → `--stale`), а не той самий `--check`. Розбір — аудит [`2026-09-23-docs-governance-audit.md`](../../../work/specs/audits/2026-09-23-docs-governance-audit.md) § DG-3.

### Ключ запису: host + repo + number

Номер PR сам по собі не унікальний. Bitbucket почав нумерацію заново з одиниці, а в реєстрі вже лежать номери 29..3665 із трьох різних GitHub-репо. Коли Bitbucket дійде до #29, ключ по самому номеру почав би вважати два різні PR одним і мовчки перезаписав би старіший запис. Тому запис ідентифікується трійкою `host` + `repo` + `number`; обидва перші поля опційні, і їх відсутність читається як `github` + легасі-репо, щоб 60 наявних записів лишились валідними без переписування.

Автор у Bitbucket-записах — слуг робочого простору (`@skords01`), а не `display_name`: Bitbucket віддає в ньому справжнє імʼя власника, а поле `author` ніде не рендериться, тож PII у трекованому файлі не дало б жодної користі.

## Why / What is enforced

Sergeant already extracts `#NNNN` PR mentions **from** docs (`generate-open-work.mjs`, `update-pr-backlinks.mjs` `touched-by` edges). The reverse direction was previously manual: when a PR merged, the canonical doc would say nothing about which PRs touched it. The asymmetry made "what PRs touched initiative 0010 this month?" a manual git-log archeology task.

This rule closes the loop: every merged PR that touches a canonical doc gets recorded in [`docs/governance/pr-ledger/index.json`](../../pr-ledger/index.json), and the latest 5 entries appear as a `## Recent PRs` block at the end of each touched doc (delimited by `<!-- AUTO-GENERATED: PR-BACKLINKS-START -->` / `END` markers).

The workflow opens a **follow-up PR** (not direct push) so Hard Rule #6 (no force-push to main) is respected and the change still goes through normal review + branch protection.

See [ADR-0061](../../adr/0061-pr-backlink-storage.md) for the storage rationale (hybrid ledger + in-doc block; rejected alternatives: JSON-only, in-doc-only, per-PR markdown files).

## Backfill

**Стан на 2026-09-12: механізм ламався двічі, і обидва рази тихо.**

Перший раз — відсутній `pnpm install` у воркфлоу (описано в коментарі
[`pr-backlinks.yml`](../../../../.github/workflows/pr-backlinks.yml)). Другий —
одразу дві дірки, які разом тримали леджер замороженим на #895 від 2026-08-28:

1. **`gh pr create` не мав дозволу.** У Settings → Actions → General вимкнено
   «Allow GitHub Actions to create and approve pull requests». Воркфлоу гілку
   пушив, PR не відкривав — на remote накопичилось **90 гілок**
   `docs/pr-backlinks-*`, з яких PR відкрито рівно один (#898, вручну). Це
   **дія власника**, кодом не лікується.
2. **Стеля в 100 файлів.** `gh pr view --json files` віддає максимум 100
   файлів, тож для більшого PR скрипт чесно не бачив жодного канонічного
   документа, друкував «did not touch any canonical doc» і виходив нулем —
   джоба зелена, крок створення PR `skipped`, у логах не відрізнити від
   «справді нічого не чіпав». Так повз леджер проїхав #1081 (956 файлів).
   Полагоджено: список файлів тепер береться посторінковим
   `gh api .../pulls/<n>/files --paginate`, а `assertCompleteFileList()`
   валить прогін, якщо прочитано менше, ніж GitHub рапортує в `changedFiles`.
   Гейт, який не може виконати свою роботу, мусить сказати це вголос —
   тест [`update-pr-backlinks.test.mjs`](../../../../scripts/ci/__tests__/update-pr-backlinks.test.mjs)
   тримає цю властивість.

**Що добрано вручну 2026-09-12:** #1043, #1046, #1064, #1067, #1068, #1070,
#1071, #1098 — усі PR періоду, які змінили **зміст** канонічного документа.

**Що свідомо НЕ добрано:** #1021 і #1081. Перший додав усі ADR як нові файли
(артефакт пересіву історії репо), другий — чисте перейменування дерева доків
(`docs/04-governance` → `docs/governance`). Разом це 291 «дотик», жоден
із яких не змінив жодного рішення. Леджер індексує зміст, а не рухи файлів:
запис про масовий переїзд витіснив би з блоку `Recent PRs` у кожному
документі саме ті PR-и, заради яких блок існує.

**Залишок:** дюжина комітів того самого періоду не має номера PR у сабджекті
(мерджилися merge-комітом або пушились у `main` напряму), тож їхню
приналежність до PR з гілки не відновити. Якщо колись знадобиться — номер
видно у вкладці Actions за прогоном `PR backlinks`, далі звичайний шлях:

```bash
node scripts/ci/update-pr-backlinks.mjs --pr <PR_NUMBER>
```

Requires `gh` CLI on PATH. Commit the resulting `docs/governance/pr-ledger/index.json` + in-doc block changes via a regular PR.

## Tracking

- Initiative — [`docs/work/specs/initiatives/archive/_0014-knowledge-graph-and-catalogs.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0014-knowledge-graph-and-catalogs.md) §Phase 5.
- ADR-0061 — [`docs/governance/adr/0061-pr-backlink-storage.md`](../../adr/0061-pr-backlink-storage.md).
- Workflow — [`.github/workflows/pr-backlinks.yml`](../../../../.github/workflows/pr-backlinks.yml).

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                              | Title                                                                                                             | Merged     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| [#1233](https://github.com/SkOrDs-02/sergeant/pull/1233)        | ci(ci): GitHub Actions CI and backend autodeploy after green CI                                                   | 2026-10-01 |
| [#92](https://bitbucket.org/skords01/sergeant/pull-requests/92) | fix(server,web): живий прогін AI-пайплайнів: обірвані відповіді OpenRouter, зламаний чат, дайджест і формат чисел | 2026-09-28 |
| [#88](https://bitbucket.org/skords01/sergeant/pull-requests/88) | fix(web): виправлення за браузерним web-аудитом 2026-09-27                                                        | 2026-09-28 |
| [#61](https://bitbucket.org/skords01/sergeant/pull-requests/61) | docs(docs): синк реєстру PR (#41-#64)                                                                             | 2026-09-26 |
| [#42](https://bitbucket.org/skords01/sergeant/pull-requests/42) | fix(web): фаза 0 аналітики Фініка v2: чесність чисел (Р4-Р7)                                                      | 2026-09-24 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 5 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
