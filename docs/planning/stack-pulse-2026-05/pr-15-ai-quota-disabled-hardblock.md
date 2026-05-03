# PR-15: `AI_QUOTA_DISABLED=1` hard-block у production

> **Last validated:** 2026-05-03 by Devin. **Next review:** 2026-08-03.
> **Status:** Planned

|              |                                        |
| ------------ | -------------------------------------- |
| **Severity** | High (H9)                              |
| **Owner**    | TBD                                    |
| **Effort**   | 0.5 дня                                |
| **Risk**     | Low                                    |
| **Touches**  | `apps/server/src/env*`, AI-quota guard |

## Контекст

```yaml
# .github/workflows/extended-e2e.yml:56
env:
  AI_QUOTA_DISABLED: "1"
```

Це fail-open «kill switch» для AI-квот, коли тести гонять реальний Anthropic API без burning-у user-quota. **Sensible** для test environments.

Ризик: якщо змінна випадково встановиться у production (helm-chart, Railway secret-mistake, copy-paste ENV-variable з staging до prod) — **AI quota guard повністю вимкнений**, користувачі можуть burn-нути unlimited Anthropic budget.

## Scope

### 1. Production hard-block

- `apps/server/src/env/index.ts` (PR-01 unify):
  ```ts
  envSchema.refine(
    (env) => !(env.NODE_ENV === "production" && env.AI_QUOTA_DISABLED),
    { message: "AI_QUOTA_DISABLED MUST NOT be set in production" },
  );
  ```
- `assertStartupEnv()` падає на production-startup, якщо `AI_QUOTA_DISABLED=true`.

### 2. Test-only enforcement

- `AI_QUOTA_DISABLED` allowed-set: `NODE_ENV=test` або `NODE_ENV=development`.
- У production runtime — **завжди** активний quota guard.

### 3. Spend-cap fallback

- Незалежно від `AI_QUOTA_DISABLED`, додати daily $-cap на Anthropic spend через separate lookup до `cost_tracking` table.
- При spend > daily cap — graceful 429 з зрозумілим message.

### 4. Documentation

- `docs/observability/ai-cost-monitoring.md` — щоденний spend dashboard, alert на 80% daily-cap.

## Out of scope

- Per-user quota limits beyond Anthropic-tier — окремий roadmap.

## Acceptance criteria (DoD)

- [ ] Server fails at startup якщо production + `AI_QUOTA_DISABLED=true`.
- [ ] `cost_tracking` table існує (можливо вже є — якщо ні, ADR + migration).
- [ ] Daily cap enforced незалежно від env-flag.
- [ ] Sentry alert на denied-quota-by-cap → notify (Slack hook).
- [ ] Тест: env `NODE_ENV=production` + `AI_QUOTA_DISABLED=true` → server stops.

## Тести

- `apps/server/src/env/__tests__/production-startup.test.ts` (PR-01) — extra case для AI_QUOTA_DISABLED.
- `apps/server/src/ai/__tests__/quota-guard.test.ts` — daily-cap behavior.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                                      | Mitigation                                                |
| --------------------------------------------------------- | --------------------------------------------------------- |
| `extended-e2e.yml` runs з `AI_QUOTA_DISABLED=1` ламається | Додати `NODE_ENV=test` явно у workflow env                |
| Daily cap занадто consrvative → genuine users 429-ed      | Cap високий (e.g. $100/day), monitoring перед strict-mode |

## Touchpoints (file:line)

- `apps/server/src/env.ts` — quota-disabled flag
- `apps/server/src/ai/quotaGuard.ts` — quota guard logic
- `.github/workflows/extended-e2e.yml:56` — додати NODE_ENV=test
- `docs/observability/ai-cost-monitoring.md` — новий

## Refs

- ADR-0028 (якщо існує — про AI cost-control)
- Anthropic billing dashboard
