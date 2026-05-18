# 0016 — CHANGELOG release-cut automation

> **Last validated:** 2026-05-18 by @codex. **Next review:** 2026-08-16.
> **Status:** In progress

## TL;DR

CHANGELOG.md уже містить багатий, manually-curated narrative (multi-paragraph entries з PR-mentions, file refs, technical rationale). Заміна цього на auto-generated commit-subject dump знизила б якість. Реальний gap — **немає git tags**, тому неможливо відповісти на «що шипнулось у release X» без читання commit history. Ця ініціатива додає **release-cut script**: коли maintainer хоче відрізати release, одна команда промотує `## [Unreleased]` у `## [YYYY-MM-DD]`, додає свіжий порожній `## [Unreleased]` згори, створює git tag, штовхає його. Author workflow не міняється.

## Чому зараз

- CHANGELOG header містить TODO з 2026-Q1: «наступний крок — підключити автоматичну генерацію». Цей TODO застарів — manual-rich style свідомо обраний і працює добре.
- `git tag --sort=-creatordate` повертає **порожньо**. Жодного tagged release у репо. Це означає:
  - Немає способу швидко reproducce "що було в production на дату X"
  - `whats-new/releases.ts` тримає TypeScript-side версії незалежно від git, ризик drift
  - Rollback workflow (per ADR-0042) посилається на "previous version" без чіткої референси
- Phase 0 audit 2026-05-17 (PR #2963) явно ідентифікував це як **medium-severity drift**, відкладений у окрему ініціативу

## Скоуп

### In scope

- **Phase 1** — `pnpm changelog:cut` script: rename Unreleased → dated section, add new empty Unreleased, create git tag, push
- Видалення застарілого TODO з CHANGELOG.md header
- Документація як cut release

### Out of scope (свідомо)

- Auto-generation entries з commit subjects (втратило б manual narrative)
- SemVer bump automation (немає npm publish; CalVer YYYY-MM-DD достатньо)
- Daily cron — release cut це ручне рішення maintainer-а, не daily ritual
- CI drift gate на Unreleased section — section заповнюється людиною, не валідується

## План змін

### Phase 1 — Release cut (committed) — ETA 2026-05-31

**Acceptance:** maintainer запускає `pnpm changelog:cut "2026-05-17"` (date arg optional, default = today UTC); скрипт renames `## [Unreleased]` у `## [2026-05-17]`, вставляє fresh empty `## [Unreleased]` згори, створює tag `v2026.05.17`, штовхає у origin.

| PR         | Що ввозиться                                                      | Файли                                               |
| ---------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| **PR-1.1** | `scripts/changelog/cut-release.mjs` + `pnpm changelog:cut` script | `scripts/changelog/cut-release.mjs`, `package.json` |
| **PR-1.2** | Remove TODO з CHANGELOG header; додати release-cut docs link      | `CHANGELOG.md`                                      |

**Script behavior:**

1. Read CHANGELOG.md
2. Validate: `## [Unreleased]` section exists AND has at least one bullet under it (no empty release)
3. Parse target date — argv[2] or `new Date().toISOString().slice(0,10)`
4. Compute tag: `v` + date з `-` → `.` (e.g. `v2026.05.17`)
5. Validate: tag not already exists
6. Rewrite CHANGELOG.md:
   - Rename `## [Unreleased]` → `## [<date>]`
   - Insert new `## [Unreleased]\n\n### Added\n\n### Changed\n\n### Fixed\n\n` above renamed section
7. `git add CHANGELOG.md`
8. `git commit -m "chore(release): cut <tag>"`
9. `git tag <tag> HEAD`
10. Print push instructions (don't auto-push — leave it to maintainer choice)

**Dry-run mode:** `pnpm changelog:cut --dry-run` prints планований diff без write/commit/tag.

## Критерії DONE

### Phase 1

- [ ] `pnpm changelog:cut --dry-run` показує що буде зроблено без side-effects
- [ ] `pnpm changelog:cut` (без dry-run) перейменовує section, додає fresh Unreleased, commit-ить, тегає
- [ ] Script відмовляється cut-ити порожній Unreleased (validation)
- [ ] Script відмовляється cut-ити з повторно існуючим tag (validation)
- [ ] CHANGELOG.md header не містить більше TODO про auto-generation
- [ ] Перший cut виконаний (тег `v2026.05.17` або новіший — створено)

## Ризики

| Ризик                                       | Митигація                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Maintainer cut-ить порожній release**     | Pre-flight check: Unreleased section МАЄ містити ≥1 bullet з реальним контентом (не лише headers `### Added`) |
| **Tag conflict — двічі cut на той же день** | Validation на `git tag -l <tag>` перед створенням                                                             |
| **Forgot to push tag → orphan**             | Print explicit `git push --follow-tags origin main` instruction; не auto-push без явного flag                 |
| **CHANGELOG format diverges**               | Script працює тільки якщо знайдено exact `## [Unreleased]` header; інакше fail з clear error                  |

## Власник / ETA

- **Owner:** @Skords-01
- **Implementation agent:** Claude Code (current session)
- **ETA Phase 1:** 2026-05-17 (today — простий скрипт)
- **First release cut:** maintainer вирішує коли (немає cadence forced)

## Backlog — Можливі доповнення (NOT committed)

### Phase 2 (proposed) — Skeleton scaffolder

- `pnpm changelog:skeleton` — додає під Unreleased порожні bullets для PR-ів що merged-нулись після last release tag
- Скелет автор enrich-ить вручну (manual narrative style preserved)
- **Trigger to start:** maintainer звітує що пропускає згадки про merged PRs у Unreleased section

### Phase 3 (proposed) — Sync TS releases.ts з CHANGELOG

- `whats-new/releases.ts` (canonical source для product `whats-new` UI) drift detection vs CHANGELOG dates
- CI gate: новий dated section у CHANGELOG МАЄ мати corresponding entry у `releases.ts`
- **Trigger to start:** хоча б один drift incident помічено

## Посилання

- [Phase 0 audit](https://github.com/Skords-01/Sergeant/pull/2963) — Drift item #5 з якого виросла ця ініціатива
- [`CHANGELOG.md`](../../CHANGELOG.md) — target файл, Keep a Changelog format
- [`apps/web/src/core/whatsNew/releases.ts`](../../apps/web/src/core/whatsNew/releases.ts) — TS-side releases (out of scope Phase 1, Phase 3 розгляне sync)
- [ADR-0042](../adr/0042-password-hashing-strategy.md) — приклад rollback-mention що потребує versioned reference (саме тому треба git tags)
