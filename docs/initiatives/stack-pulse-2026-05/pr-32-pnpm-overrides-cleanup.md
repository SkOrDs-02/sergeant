# PR-32: `pnpm.overrides` quarterly cleanup

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                              |
| ------------------ | ---------------------------------------------------------------------------- |
| **Severity**       | Low (L5)                                                                     |
| **Linked finding** | L5 (`00-overview.md`)                                                        |
| **Owner**          | TBD (sponsor: @Skords-01)                                                    |
| **Effort**         | 0.5 дня (quarterly recurring)                                                |
| **Risk**           | Medium (override removal може surface latent dependency conflicts)           |
| **Touches**        | `package.json` (`pnpm.overrides`), `pnpm-lock.yaml`                          |
| **Trigger**        | quarterly (next 2026-08-05) — або раніше при upstream-fix announcement       |

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
    }
  }
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

- [ ] Кожен override у `package.json` має comment-block з Why/Drop-when/Last-reviewed.
- [ ] `scripts/check-pnpm-overrides-staleness.mjs` + CI step.
- [ ] `docs/governance/pnpm-overrides-policy.md`.
- [ ] Audit-result: ≥1 override dropped (якщо було можливо).

## Тести

- `scripts/__tests__/check-pnpm-overrides-staleness.test.mjs` — fixture-based.
- `pnpm install --frozen-lockfile` зелений після cleanup.
- `pnpm lint:overrides` (новий npm-script).

## Rollout

- Single PR per quarter. Auto-reminder через scheduled GitHub Action.

## Risks & mitigations

| Risk                                                                      | Mitigation                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Drop override → latent CVE re-emerges                                      | Pre-merge: `pnpm audit` + Renovate report                                 |
| Comment-block ламає `pnpm` JSON parsing                                    | Comments живуть в окремому `pnpm-overrides.md`; CI script links them      |

## Touchpoints (file:line)

- `package.json` — `pnpm.overrides` block
- `pnpm-overrides.md` — new (rationale book)
- `scripts/check-pnpm-overrides-staleness.mjs` — new
- `docs/governance/pnpm-overrides-policy.md` — new

## Refs

- [pnpm overrides docs](https://pnpm.io/package_json#pnpmoverrides)
- ADR-0050 TypeScript major version policy (referenced override)
