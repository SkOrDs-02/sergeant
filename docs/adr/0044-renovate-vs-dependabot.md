# ADR-0044: Renovate as the primary dep-update tool, Dependabot as security-only fallback

- **Status:** Accepted
- **Date:** 2026-05-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/initiatives/_0008-platform-hardening.md`](../initiatives/_0008-platform-hardening.md) §Phase 3
  - [`docs/security/hardening/H2-dependabot.md`](../security/hardening/H2-dependabot.md) (Dependabot setup card)
  - [`docs/integrations/renovate-usage.md`](../integrations/renovate-usage.md)
  - [`renovate.json`](../../renovate.json), [`.github/dependabot.yml`](../../.github/dependabot.yml)

---

## Context and Problem Statement

Зараз репо має **обидва** інструменти оновлення залежностей:

- `renovate.json` — у корені, повна конфігурація з groups / schedule / automerge для devDeps patches.
- `.github/dependabot.yml` — налаштований для npm (з groups production/dev/security), github-actions і docker.

Обидва тригеряться щопонеділка о 06:00 Europe/Kyiv. Це створює **дублювання**: коли і Renovate, і Dependabot одночасно піднімають той самий pin, людина руками закриває один із двох PR-ів. У 2026-04 за тиждень було ~12 таких дубль-PR-ів.

Initiative 0008 Phase 3 явно вимагає одного офіційного рішення (`Альтернатива — Dependabot (decision у фазі 1 ADR)`). Цей ADR закриває рішення.

## Considered Options

1. **Renovate як primary, Dependabot off.** Renovate має ширшу конфігурацію (group-rules, automerge, lockFileMaintenance). Off-боард Dependabot, видалити `.github/dependabot.yml`.
2. **Dependabot як primary, Renovate off.** Dependabot простіший (native у GitHub), не вимагає Mend account. Off-боард Renovate, видалити `renovate.json`.
3. **Обидва, з різними ролями.** Renovate робить regular weekly bumps + automerge (primary). Dependabot робить тільки security-update PR-и (fallback на випадок, якщо Mend Renovate downtime або misconfig). Звузити Dependabot до `applies-to: security-updates`.
4. **Status quo (обидва на повну).** Залишити як є.

## Decision

**Option 3 — Renovate primary, Dependabot security-only fallback.**

Конкретно:

- `renovate.json` лишається без змін у scope-і (groups, schedule, automerge), додаються тільки missing groups з ініціативи (`anthropic`, `sentry`, `opentelemetry`).
- `.github/dependabot.yml` звужується: видаляються `production-deps` і `dev-deps` groups; лишається тільки `security-updates` group + github-actions + docker (бо для них Renovate і Dependabot мають різні джерела CVE-фідів — overlap корисний).
- Розклад Dependabot для npm-security змінюється з `weekly` на `daily` — security-PR має падати наступного дня після disclosure, не чекати понеділка.

## Rationale

- **Renovate перекриває 100% use-case-ів regular bumps**: groups, automerge, lockFileMaintenance, version-pinning через `rangeStrategy: pin`. Dependabot не вміє automerge без окремого `dependabot-automerge.yml` workflow — додаткова complexity.
- **Дублювати regular bumps** — стабільно ~12 duplicate-PR-ів/тиждень за 2026-04 спостереженнями. Кожен — це людина-час на review/close.
- **Security-fallback є**: якщо Mend Renovate downtime, GitHub-native Dependabot все одно піднімає security-update PR (різні провайдери CVE-фідів — Renovate бере з GitHub Advisory + npm audit, Dependabot з GitHub Advisory). Дублювання тут — feature, не bug.
- **github-actions / docker overlap ОК**: Renovate `pinDigests: true` і Dependabot `package-ecosystem: github-actions` не конфліктують часто (rare bumps), а обидва дають supply-chain-pin-rotation.

## Consequences

### Positive

- Менше duplicate-PR-noise (~12 PR/тиждень → 0 для regular bumps).
- Чітка ownership: Renovate — primary, Dependabot — backup. Якщо Renovate-PR не приходить за 24 години після release нової версії, це alert (Mend-side issue, окрема скарга).
- `renovate-usage.md` лишається SoT для контриб'юторів.

### Negative

- Дві конфігурації в репо. Майбутні зміни treba робити двічі (одну в Renovate, дзеркальну в Dependabot security-only). Митиґація — ADR + `docs/integrations/renovate-usage.md` посилається на цей ADR.
- Dependabot security-PR піднімаються за іншим schedule (daily) — двічі за тиждень може бути race з Renovate weekly. Ризик низький: race-resolved через Renovate `rebaseWhen: conflicted`.

### Neutral

- CI pipeline без змін — обидва інструменти створюють стандартні PR через GitHub API.
- Public API без змін.

## Compliance

- Зміни в `renovate.json`: додаються `anthropic`, `sentry`, `opentelemetry` groups (initiative 0008 spec).
- Зміни в `.github/dependabot.yml`: звужено npm-scope до security-only; production/dev groups видалено.
- `docs/integrations/renovate-usage.md` — оновлено з лінком на цей ADR.
- `docs/security/hardening/H2-dependabot.md` — статус оновлено: «scope reduced to security-only per ADR-0044».
