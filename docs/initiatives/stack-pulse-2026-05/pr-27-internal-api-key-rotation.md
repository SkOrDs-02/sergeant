# PR-27: `INTERNAL_API_KEY` rotation мechanism

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Planned

|                    |                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Medium (M12)                                                                                                      |
| **Linked finding** | M12 (`00-overview.md`)                                                                                            |
| **Owner**          | TBD (sponsor: @Skords-01)                                                                                         |
| **Effort**         | 2 дні                                                                                                             |
| **Risk**           | Medium (rotation процедура потребує zero-downtime; mistake = locked-out internal admin)                           |
| **Touches**        | `apps/server/src/env/env.ts`, `apps/server/src/http/requireInternalIp.ts`, `tools/openclaw`, `ops/n8n-workflows/` |
| **Trigger**        | next security audit OR suspected leak                                                                             |

## Контекст

`INTERNAL_API_KEY` — single shared-secret for всіх internal endpoints (`apps/server/src/routes/internal/*`):

- `internal/index.ts` — admin operations
- `internal/mono.ts` — Monobank webhook intake
- `internal/openclaw.ts` — code-bot internal callback
- `internal/alerts.ts` — Sentry alerts router

Один key — один rotation event ламає всіх consumer-ів одночасно. Поточно: жодних tools для rotation, жодного TTL, жодного audit-log хто і коли key використовував.

Risk:

- Leak detection — нема способу побачити «цей key compromised» без full env-search у logs.
- Rotation вимагає coordinated update у Railway + n8n + tools/openclaw + Monobank webhook secret.
- Жоден internal-call не tagged для post-mortem.

## Scope

### 1. `internal_api_keys` table

```sql
-- apps/server/src/migrations/048_internal_api_keys.sql
CREATE TABLE internal_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash        TEXT NOT NULL UNIQUE,        -- bcrypt(actual_key)
  name            TEXT NOT NULL UNIQUE,        -- 'mono-webhook', 'n8n-alerts', 'openclaw-callback', 'admin-cli'
  scopes          TEXT[] NOT NULL,             -- ['mono.write', 'alerts.read', ...]
  expires_at      TIMESTAMPTZ NOT NULL,        -- TTL обов'язковий
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT NOT NULL,
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);
CREATE INDEX internal_api_keys_name_active_idx
  ON internal_api_keys (name)
  WHERE revoked_at IS NULL AND expires_at > NOW();
```

### 2. Hash-based lookup

`apps/server/src/http/requireInternalIp.ts` (rename → `requireInternalApiKey.ts`):

```ts
// Header: X-Internal-Api-Key: <raw-key>
// Lookup: bcrypt.compare(rawKey, row.key_hash) WHERE name = expectedName AND not revoked AND not expired
// Update: last_used_at = NOW()
```

### 3. Dual-key rotation pattern

При rotation — додаємо новий key з тим самим `name`, обидва valid 24 год:

```ts
// Multiple rows з name='mono-webhook' allowed, але lookup бере any non-revoked
```

Після migration consumer-ів — старий key `revoked_at = NOW()` через CLI.

### 4. CLI tool

`tools/openclaw` — telegram bot з commands:

- `/internal-key list` — список (name, expires, last_used)
- `/internal-key create <name> <ttl-days> <scopes>` — generate + return raw key (одноразово)
- `/internal-key revoke <name|id>` — revoke
- `/internal-key audit <since>` — usage stats

### 5. Backward compatibility

Single env-var `INTERNAL_API_KEY` lишається валідним bootstrap-key з `name='bootstrap'` + 30-day expiry. Після rotation — drop env-var.

### 6. Documentation

`docs/security/internal-api-keys.md` — runbook для rotation, audit, revocation.

## Out of scope

- mTLS для internal calls (Railway → server) — окремий ADR.
- IP allowlist — частково існує (`requireInternalIp` middleware), доповнює key-auth, не замінює.

## Acceptance criteria (DoD)

- [ ] Migration `048_internal_api_keys.sql` merged.
- [ ] `apps/server/src/http/requireInternalApiKey.ts` (rename middleware) працює з DB-lookup + bcrypt.
- [ ] All `apps/server/src/routes/internal/*` consume new middleware.
- [ ] `tools/openclaw` має `/internal-key` group commands з role-check `ops`.
- [ ] Bootstrap-row seeded з env-INTERNAL_API_KEY на startup.
- [ ] Sentry tag `internal_key_name` додається на кожен internal request.
- [ ] `docs/security/internal-api-keys.md` з rotation runbook.
- [ ] Тест: rotation simulation — два keys одночасно valid → старий revoked.

## Тести

- `apps/server/src/__tests__/internal-api-key.integration.test.ts` (Testcontainers).
- `tools/openclaw/src/__tests__/internal-key-commands.test.ts`.
- Manual: 30-day key expiry → 401 з clear error message.

## Rollout

1. PR-1: migration + middleware (env-key still primary).
2. PR-2: CLI commands + bootstrap-seed.
3. PR-3 (after consumers ready): drop env-INTERNAL_API_KEY.

## Risks & mitigations

| Risk                                                      | Mitigation                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Bootstrap-key migration ламає running services при deploy | Two-phase: code підтримує **обидва** (env + DB) 7 днів, потім drop env-fallback     |
| `last_used_at` write додає DB-load на кожен internal call | Throttle: update тільки якщо `now - last_used > 60s`                                |
| Compromised raw-key unrecoverable                         | Audit logs + key-name tagging дозволяють targeted revocation з minimal blast-radius |
| Bcrypt slow на every internal call                        | LRU cache key_hash → key_name (5min TTL); cache invalidate на revoke                |

## Touchpoints (file:line)

- `apps/server/src/http/requireInternalIp.ts` — rename + extend
- `apps/server/src/routes/internal/index.ts`
- `apps/server/src/routes/internal/mono.ts`
- `apps/server/src/routes/internal/openclaw.ts`
- `apps/server/src/routes/internal/alerts.ts`
- `apps/server/src/migrations/048_internal_api_keys.sql` — new
- `apps/server/src/env/env.ts` — INTERNAL_API_KEY lишається 30d (bootstrap)
- `tools/openclaw/src/agents/ops/internalKey.ts` — new commands
- `ops/n8n-workflows/03-sentry-alert-routing.json` — update header to use new key
- `ops/n8n-workflows/18-nightly-security-audit.json` — те саме
- `docs/security/internal-api-keys.md` — new

## Refs

- [OWASP API Security Top 10 — Broken Authentication](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)
- ADR на secrets-management policy (якщо є)
