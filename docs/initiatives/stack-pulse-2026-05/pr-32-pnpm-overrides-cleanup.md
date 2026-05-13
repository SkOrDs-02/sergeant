# PR-32: `pnpm.overrides` quarterly cleanup

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Closed (PR [#2423](https://github.com/Skords-01/Sergeant/pull/2423))

|                    |                                                                        |
| ------------------ | ---------------------------------------------------------------------- |
| **Severity**       | Low (L5)                                                               |
| **Linked finding** | L5 (`00-overview.md`)                                                  |
| **Owner**          | TBD (sponsor: @Skords-01)                                              |
| **Effort**         | 0.5 дня (quarterly recurring)                                          |
| **Risk**           | Medium (override removal може surface latent dependency conflicts)     |
| **Touches**        | `package.json` (`pnpm.overrides`), `pnpm-lock.yaml`                    |
| **Trigger**        | quarterly (next 2026-08-05) — або раніше при upstream-fix announcement |

## Контекст

Root `package.json` має `pnpm.overrides` block з pinning-ами для:

- Workaround-у buggy upstream версій (e.g., known CVE без direct upgrade-shy)
- Force consistency `@types/node@^20.19.0` (PR-05)
- Diamond-dependency conflicts

Проблема: overrides — **debt**. Кожен запис має assumption «upstream broken X version Y». Через 6+ місяців:

1. Upstream може мати fix → override непотрібний.
2. Upstream може deprecate-нути version → override перетворюється у CVE-trap.
3. Override без коментаря — нікому не зрозуміло, навіщо.

## Scope

### 1. Audit existing overrides

Кожен entry → структурований audit:

```jsonc
// package.json
{
  "pnpm": {
    "overrides": {
      // Why: <rationale>. Drop when: <condition>. Last reviewed: 2026-05-07.
      "@types/node": "^20.19.0",
      // ...
    },
  },
}
```

Заради `package.json` JSON-validity — comment-format у `package.jsonc` або у separate `pnpm-overrides.md`.

### 2. Drop unnecessary

Для кожного override:

- Чи upstream має fix у latest version?
- Чи pin still relevant?
- Чи можна замінити на `peerDependenciesMeta` policy?

### 3. CI gate: quarterly review

`scripts/check-pnpm-overrides-staleness.mjs`:

- Парсить `package.json` overrides.
- Для кожного — перевіряє «remind from `last_reviewed`» >90 днів → CI warn (не fail).

### 4. ADR / process

`docs/governance/pnpm-overrides-policy.md`:

- Кожен новий override → PR description must explain.
- Quarterly review reminder автоматично через GitHub issue (Renovate / scheduled-action).

## Out of scope

- Заміна `pnpm` на іншу package manager — backlog.
- Per-workspace overrides (вже supported pnpm v8+) — partial scope.

## Acceptance criteria (DoD)

- [x] Кожен override у `package.json` має comment-block з Why/Drop-when/Last-reviewed — винесено у [`pnpm-overrides.md`](../../../pnpm-overrides.md) (8 записів, kept у JSON-validity contract).
- [x] `scripts/check-pnpm-overrides-staleness.mjs` + npm-script `lint:overrides` (warning-only, exit 0); 90-day freshness budget.
- [x] [`docs/governance/pnpm-overrides-policy.md`](../../governance/pnpm-overrides-policy.md) — process doc (when to add / drop, quarterly review cadence).
- [x] Drift guard `scripts/check-pnpm-overrides.mjs` + npm-script `lint:pnpm-overrides` (single-major-resolution check via `pnpm why`).
- [ ] Audit-result: ≥1 override dropped — **deferred**. Усі 8 поточних overrides обґрунтовані active CVE-fixes / `@types/node@^20` (Hard Rule #19) / React 19 alignment; жоден не можна безпечно зняти зараз. Перевіряти наступним quarterly-review-ом (`2026-08-11`).

## Тести

- `pnpm install --frozen-lockfile` — зелений після cleanup.
- `pnpm lint:overrides` — `OK — 8 override(s) reviewed within 90 days.`
- `pnpm lint:pnpm-overrides` — кожен override resolve до one major.
- Fixture-based unit-test (`scripts/__tests__/check-pnpm-overrides-staleness.test.mjs`) — **deferred**: warning-only лінт, current runtime-output coverage достатній; додамо при першій модифікації скрипта.

## Rollout

- Single PR per quarter. Auto-reminder через scheduled GitHub Action.

## Risks & mitigations

| Risk                                    | Mitigation                                                           |
| --------------------------------------- | -------------------------------------------------------------------- |
| Drop override → latent CVE re-emerges   | Pre-merge: `pnpm audit` + Renovate report                            |
| Comment-block ламає `pnpm` JSON parsing | Comments живуть в окремому `pnpm-overrides.md`; CI script links them |

## Touchpoints (file:line)

- `package.json` — `pnpm.overrides` block
- `pnpm-overrides.md` — new (rationale book)
- `scripts/check-pnpm-overrides-staleness.mjs` — new
- `docs/governance/pnpm-overrides-policy.md` — new

## Refs

- [pnpm overrides docs](https://pnpm.io/package_json#pnpmoverrides)
- ADR-0050 TypeScript major version policy (referenced override)
