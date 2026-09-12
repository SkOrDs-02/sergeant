# Rule 26 — Merged PRs touching canonical docs must update `docs/governance/pr-ledger/index.json`

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-08-16 by @claude
> **Next review:** 2027-04-12
> **Status:** Active

> Per-rule canonical body for Hard Rule #26. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break). The machine-readable registry lives in [`docs/governance/governance/hard-rules.json`](../hard-rules.json). 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

Canonical docs that receive PR backlinks (whitelist enforced by [`scripts/ci/update-pr-backlinks.mjs`](../../../../scripts/ci/update-pr-backlinks.mjs)):

- `docs/governance/adr/*.md` (excluding `TEMPLATE.md`, `README.md`)
- `docs/work/specs/initiatives/*.md` (excluding `archive/`, `follow-ups.md`, `README.md`)
- `docs/start/instructions/*.md` (excluding `INDEX.md`, `README.md`, `_TEMPLATE-*`)
- `docs/governance/governance/rules/*.md` (excluding `README.md`)

`docs/work/specs/audits/` and `docs/engineering/architecture/` are intentionally excluded — audits are snapshot-natured, architecture is already covered by Phase 3 drift-detectors.

## Enforced by

- **ci** — [`.github/workflows/pr-backlinks.yml`](../../../../.github/workflows/pr-backlinks.yml) — `pull_request_target: closed` + `merged == true` trigger. After merge, the workflow runs `scripts/ci/update-pr-backlinks.mjs --pr <NUMBER>` and opens a follow-up PR `docs/pr-backlinks-<NNNN>` with the ledger + in-doc block updates. Loop-guarded against follow-up PRs (`head_ref` starting with `docs/pr-backlinks-` is skipped).
- **ci** — `pnpm docs:check-pr-ledger` (wired in `pnpm lint`) — verifies that the ledger ↔ in-doc blocks ↔ JSON schema are in sync. Exit 1 on any drift.

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
(`docs/04-governance/…` → `docs/governance/…`). Разом це 291 «дотик», жоден
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

| PR                                                       | Title                                                              | Merged     |
| -------------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| [#508](https://github.com/Skords-01/Sergeant/pull/508)   | fix(docs): reconcile canonical docs with current repo              | 2026-07-29 |
| [#2900](https://github.com/Skords-01/Sergeant/pull/2900) | docs(docs): hard rules 24/25/26 for Initiative 0014 (HR follow-up) | 2026-05-15 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
