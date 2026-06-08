# H4 — No rotation procedure for AES-256-GCM data-encryption keys

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Closed (2026-06-01) — Phase 1 PR [#1679](https://github.com/Skords-01/Sergeant/pull/1679) (Better Auth); Phase 2 brings Mono `mono_connection.token_*` under the same versioned KeyRing (migration `074_mono_token_key_version.sql`).

| Field          | Value                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | High (CVSS 7.5, AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N)                                                                                                                                                                                                                                                                                                                            |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                                                                                                                                                                                                                                                                                                                                       |
| **Owner**      | backend                                                                                                                                                                                                                                                                                                                                                                         |
| **Effort**     | 1.5 person-days                                                                                                                                                                                                                                                                                                                                                                 |
| **Status**     | **Closed (2026-06-01)** — Phase 1 PR [#1679](https://github.com/Skords-01/Sergeant/pull/1679); Phase 2 lands the Mono side                                                                                                                                                                                                                                                      |
| **Discovered** | 2026-05-03 deep security review                                                                                                                                                                                                                                                                                                                                                 |
| **Resolved**   | Phase 1: KeyRing infra (`apps/server/src/lib/keyRing.ts`) + Better Auth versioned ciphertext (`enc:v2:k<N>:…`). Phase 2: Mono `mono_connection.token_*` under the same KeyRing — `token_key_version SMALLINT` column (migration 074), versioned writes via `MONO_TOKEN_ENC_KEYS`, transparent legacy decrypt + best-effort lazy re-encrypt (`mono_token_lazy_reencrypt_total`). |

## Phase split

This card was implemented in two phases because Better Auth and Mono store
ciphertext in fundamentally different shapes (TEXT prefix vs. separate BYTEA
columns), and the migration cost differs accordingly.

| Phase   | Scope                                                                                                                 | Status                                                                            | Tracking  |
| ------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| Phase 1 | KeyRing parser, Better Auth `account.{accessToken,refreshToken,idToken}`, env, runbook                                | Closed (2026-05-04) — PR [#1679](https://github.com/Skords-01/Sergeant/pull/1679) | This card |
| Phase 2 | `mono_connection.token_*` migration `074_mono_token_key_version.sql` + `mono/crypto.ts` + KeyRing read/lazy-reencrypt | **Closed (2026-06-01)**                                                           | This card |

Both phases are now closed: Mono key rotation uses the same zero-downtime
versioned KeyRing as Better Auth. Existing legacy (unversioned) Mono
ciphertext decrypts transparently — `mono_connection.token_key_version` is
`NULL` for those rows and read as key version 1 — and is lazily re-encrypted
to the current version on the next successful read. See the updated procedure
in [`docs/03-operations/runbooks/encryption-key-rotation.md`](../../03-operations/runbooks/encryption-key-rotation.md).

## Summary

`MONO_TOKEN_ENC_KEY` and `BETTER_AUTH_TOKEN_ENC_KEY` are AES-256-GCM master
keys used to wrap Mono OAuth tokens and Better Auth session payloads. There is
no `keyId` byte in the ciphertext, no DB column tracking which key encrypted a
row, and no documented rotation procedure. Rotating after a leak therefore
requires an offline pass that decrypts every row with the old key and
re-encrypts with the new one — a multi-hour outage with no rollback path.

## Affected files

- `apps/server/src/auth/encryptingAdapter.ts`
- `apps/server/src/modules/mono/crypto.ts:22–55`
- `apps/server/src/migrations/*` — no `*_key_version` columns exist.
- `docs/security/secret-ownership-register.md` — keys are listed but rotation
  cadence is "annually" with no procedure.

## Evidence

```ts
// apps/server/src/modules/mono/crypto.ts (excerpt)
export type EncryptedToken = { ciphertext: Buffer; iv: Buffer; tag: Buffer };
//   no `keyId` field; only the env-var holds key identity
```

`mono_connection.token_*` columns store the three buffers as bytea; there is
no `token_key_version` column.

## Impact

1. **Mandatory downtime to rotate.** A leaked key forces a maintenance window
   long enough to re-encrypt every active connection.
2. **No partial rotation.** We cannot rotate per-tenant or per-record;
   rotation is all-or-nothing.
3. **No re-encryption telemetry.** We cannot tell from a row whether it has
   been migrated to the new key.
4. **Disaster-recovery gap.** [`disaster-recovery.md`](../disaster-recovery.md)
   does not cover the "leaked key" scenario.

## Recommendation

- Prefix the ciphertext with a 1-byte `keyId` (or store it as a separate
  column) and keep a `keyId → key` map sourced from
  `MONO_TOKEN_ENC_KEYS=v1:hex,v2:hex` plus
  `MONO_TOKEN_ENC_KEY_CURRENT_VERSION=v2`.
- Decrypt with the per-row key; encrypt with the current key.
- Add a **lazy re-encryption** pass: on every successful read, if the row's
  key version is not current, write back with the new key in the same
  transaction.
- Document rotation in `docs/03-operations/runbooks/encryption-key-rotation.md` (new) and
  link from [`disaster-recovery.md`](../disaster-recovery.md).

## Correction points

- `apps/server/src/modules/mono/crypto.ts` — extend `EncryptedToken` with
  `keyVersion: number`; emit `Buffer.concat([Uint8Array.from([keyVersion]),
iv, tag, ciphertext])` so legacy rows with no version byte fail fast.
- `apps/server/src/auth/encryptingAdapter.ts` — same shape change.
- `apps/server/src/migrations/03X_token_key_version.sql` — add
  `mono_connection.token_key_version SMALLINT NOT NULL DEFAULT 1`.
- `apps/server/src/lib/keyRing.ts` (new) — single helper that reads
  `MONO_TOKEN_ENC_KEYS` / `BETTER_AUTH_TOKEN_ENC_KEYS` and returns a
  `{ current: Buffer; byVersion: Map<number, Buffer> }` interface.
- `apps/server/src/modules/mono/connection.ts` —
  on read: decrypt with `byVersion.get(keyVersion)`; if `keyVersion !==
current`, re-encrypt and `UPDATE` the row in the same Drizzle transaction.
- `docs/03-operations/runbooks/encryption-key-rotation.md` (new) — step-by-step procedure:
  generate new key → add to env-var list → bump current → deploy → monitor
  re-encrypt counter → after 30 days remove old key.

## Verification

- **Unit:** encrypt with `v1`, persist; decrypt with current `v2` set →
  expect re-encrypt path to succeed and write `keyVersion=2`.
- **Migration smoke test:** existing rows on staging decrypt and re-encrypt
  without orphaning any connection.
- **Runbook dry-run:** founder + one engineer execute the rotation runbook in
  staging end-to-end; runbook updates land in the same PR if any step is
  unclear.
- **Monitoring:** new metric `crypto.lazy_reencrypt_total{table=...}` is
  emitted per re-encrypted row; staging baseline = 0 once rotation completes.

## Cross-references

- [`../secret-ownership-register.md`](../secret-ownership-register.md)
- [`../disaster-recovery.md`](../disaster-recovery.md)
- [`./M3-pino-redact-paths.md`](./M3-pino-redact-paths.md) — re-encrypted
  payloads still need redaction in error logs.
