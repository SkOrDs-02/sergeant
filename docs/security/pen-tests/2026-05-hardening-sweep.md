# Hardening pen-test sweep — 2026-05 (H5/H6/H8/H9)

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

| Field        | Value                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initiative   | [`0011`](../../initiatives/0011-foundation-adoption-and-process-discipline.md) Phase 3 PR 3.1                                                                                          |
| Cards        | [H5](../hardening/H5-trusted-origins-exp-scheme.md), [H6](../hardening/H6-email-verification.md), [H8](../hardening/H8-corp-per-route.md), [H9](../hardening/H9-transcribe-usd-cap.md) |
| Source PRs   | #1604 (H5), #1608 (H6), #1606 (H8), #1567 + #1613 (H9)                                                                                                                                 |
| Owner        | @Skords-01 (or external pen-tester as follow-up)                                                                                                                                       |
| Audit window | 2026-05-04 → 2026-05-06                                                                                                                                                                |

## Why this document

Each card under `docs/security/hardening/` carries a `Status: Closed` badge and
unit-test coverage. None of them, as of 2026-05-06, was confirmed end-to-end
against a running server in production-like conditions. PR 3.1 of initiative
[0011 Phase 3](../../initiatives/0011-foundation-adoption-and-process-discipline.md#фаза-3--hardening-verification-для-launch-readiness--2-тижні-2026-06-23--2026-07-07-поста-0010-launch)
fills the gap: **manual e2e reproduction** plus a written transcript of the
attack and the observed defence, so launch-readiness reviewers can verify the
fixes without re-deriving the attack from the card.

Use this document together with [`docs/playbooks/security-pen-test-checklist.md`](../../playbooks/security-pen-test-checklist.md)
— that playbook is the entry-point recipe; this file is the per-card transcript.

## Scope

In scope:

- Each of the 4 closed cards gets a **manual e2e** run.
- Each run produces: attack command, expected outcome, observed outcome,
  remediation status, residual risk.
- Two environments per card: **production-like** (NODE_ENV=production with
  staging Postgres) and **dev** (NODE_ENV=development) where dev/prod parity
  matters (H5).

Out of scope:

- Fuzzing or longitudinal load tests — covered by separate initiatives.
- Browser-side attacks (CSP / clickjacking) — owned by C2 + L4 cards.
- Mobile native scheme handlers — owned by mobile-shell harness.

## Result summary

| Card | Production                                               | Dev                | Notes                                              |
| ---- | -------------------------------------------------------- | ------------------ | -------------------------------------------------- |
| H5   | mitigated                                                | dev-only allowance | `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES` override path |
| H6   | mitigated (`/api/mono/connect` 403 without verification) | mitigated          | Legacy users default-flag-off ✅                   |
| H8   | mitigated (CORP same-origin on 200/401)                  | mitigated          | Public endpoints kept `cross-origin` per design    |
| H9   | mitigated (boot fails on `AI_QUOTA_DISABLED=true`)       | mitigated          | USD-cap pre-charge + post-success accounting       |

> **Reading the table.** "mitigated" = e2e attack confirms the fix is live and
> blocks the abuse path; "mitigated (X)" = mitigation works under the named
> condition; "dev-only allowance" = behaviour is intentional in development
> per the H5 card and not a regression.

---

## H5 — Trusted-origins `exp://` leak in production

**Reference:** [`docs/security/hardening/H5-trusted-origins-exp-scheme.md`](../hardening/H5-trusted-origins-exp-scheme.md), PR #1604.

### Threat model

`getTrustedOrigins()` historically merged `["sergeant://", "exp://"]` into
Better Auth's allowlist unconditionally. `exp://` is the Expo dev-tunnel
scheme, which means a determined attacker could craft a redirect URI like
`exp://malicious.local/--/auth/callback` and trick Better Auth into accepting
it as a "trusted" mobile origin during OAuth callback. In production this
would let an attacker pivot OAuth code-grants to a non-Sergeant client.

### As-shipped fix (commit reference)

`apps/server/src/auth.ts:392-403` — `getTrustedNativeSchemes()` returns
`["sergeant://"]` when `NODE_ENV === "production"` and `["sergeant://", "exp://"]`
otherwise. Optional `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES` override replaces
the entire defaults (deliberately not additive — see card §Recommendation).

### Reproduction — production env

```bash
# 1) Boot the API in a production-like profile against staging Postgres.
export NODE_ENV=production
export DATABASE_URL=$STAGING_DATABASE_URL
export BETTER_AUTH_SECRET=$STAGING_BETTER_AUTH_SECRET
unset BETTER_AUTH_TRUSTED_NATIVE_SCHEMES
pnpm --filter @sergeant/server start
# 2) From a separate shell, attempt OAuth callback with exp:// scheme.
curl -i \
  -H 'Origin: exp://attacker.local' \
  -H 'Referer: exp://attacker.local/' \
  "http://localhost:5000/api/auth/callback/google?state=abc&code=xyz"
```

**Expected:** Better Auth rejects the request before invoking the OAuth
exchange — HTTP 400 / 403 with `code: "INVALID_ORIGIN"` (or equivalent
Better Auth taxonomy). Server log shows
`auth_origin_rejected origin=exp://attacker.local`.

**Observed (2026-05-06):** same as expected. `exp://` is absent from the
runtime allowlist; Better Auth surfaces the `Untrusted origin` failure path.

### Reproduction — dev env

```bash
# Identical command, but dev profile keeps exp:// in the allowlist.
export NODE_ENV=development
unset BETTER_AUTH_TRUSTED_NATIVE_SCHEMES
pnpm --filter @sergeant/server dev
curl -i \
  -H 'Origin: exp://localhost' \
  "http://localhost:5000/api/auth/callback/google?state=abc&code=xyz"
```

**Expected:** request reaches the OAuth-exchange path (the underlying call
will still fail because `code=xyz` is fake, but the **origin** is accepted).

**Observed (2026-05-06):** matches. Dev tunnels through Expo continue to work.

### Override path

```bash
# Ops emergency: temporarily allow only sergeant:// even in dev.
export BETTER_AUTH_TRUSTED_NATIVE_SCHEMES="sergeant://"
pnpm --filter @sergeant/server dev
# Re-run the dev curl above — request is rejected. Override is replace,
# not merge, by design (see card §Recommendation).
```

### Residual risk

- An operator with Railway env-write access can re-add `exp://` to
  `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES`; this is intentional (ops break-glass).
  Tracked under the `secret-ownership-register.md` access-policy review.
- No automated CI check asserts the prod default. The unit test in
  `apps/server/src/auth.test.ts` covers the function but not the env-var
  override matrix end-to-end. Consider expanding under H5 follow-up.

---

## H6 — Email verification not gating sensitive actions

**Reference:** [`docs/security/hardening/H6-email-verification.md`](../hardening/H6-email-verification.md), PR #1608.

### Threat model

A user could sign up with `victim@gmail.com`, set a password, and immediately
connect a Mono profile — granting the squatter access to the victim's bank
statements once the legitimate owner ever re-attempts sign-up.

### As-shipped fix

`apps/server/src/auth.ts:158-170` — `requireEmailVerification` now reads
`env.REQUIRE_EMAIL_VERIFICATION` (default `false` to keep legacy users
working). Crucially, `apps/server/src/http/requireVerifiedEmail.ts` is
**unconditional**: `/api/mono/connect` always rejects with 403 if the
authenticated user has `email_verified=false`, regardless of the global
flag. A squatter cannot bypass the gate by waiting for ops to flip the
flag back off.

### Reproduction — `/api/mono/connect` without verification (gate must fire)

```bash
# 1) Sign up via API (or via the SPA), with REQUIRE_EMAIL_VERIFICATION=false
#    so we land in the legacy-flow.
export REQUIRE_EMAIL_VERIFICATION=false
pnpm --filter @sergeant/server dev

# 2) Sign-up → leaves email_verified=false in the user row.
curl -s -c /tmp/cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"squatter@example.test","password":"p455w0rd!!"}' \
  http://localhost:5000/api/auth/sign-up

# 3) Attempt to connect Mono — must return 403 with EMAIL_NOT_VERIFIED code.
curl -i -b /tmp/cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"token":"x"}' \
  http://localhost:5000/api/mono/connect
```

**Expected:** HTTP 403, body `{"error":"...","code":"EMAIL_NOT_VERIFIED"}`.
Server log: `requireVerifiedEmail_blocked subject=u:<id>`.

**Observed (2026-05-06):** matches.

### Reproduction — verified user proceeds

```bash
# 4) Force-verify in DB (skips the email round-trip for the e2e).
psql "$DATABASE_URL" \
  -c "UPDATE \"user\" SET \"emailVerified\" = true WHERE email='squatter@example.test';"

# 5) Re-attempt the connect — request reaches the Mono handler.
curl -i -b /tmp/cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"token":"valid-mono-token"}' \
  http://localhost:5000/api/mono/connect
```

**Expected:** HTTP 200 (success path) or 4xx from Mono itself, **never**
`EMAIL_NOT_VERIFIED`.

**Observed (2026-05-06):** matches.

### Reproduction — legacy flag flip (`REQUIRE_EMAIL_VERIFICATION=true`)

```bash
# 6) Restart server with the global gate on.
export REQUIRE_EMAIL_VERIFICATION=true
pnpm --filter @sergeant/server dev

# 7) Try to sign in as an *unverified* legacy user — must be blocked at
#    sign-in level by Better Auth itself.
curl -i \
  -H 'Content-Type: application/json' \
  -d '{"email":"legacy-unverified@example.test","password":"p455w0rd!!"}' \
  http://localhost:5000/api/auth/sign-in
```

**Expected:** HTTP 403 / Better Auth `EMAIL_NOT_VERIFIED` taxonomy.

**Observed (2026-05-06):** matches Better Auth contract.

### Residual risk

- Legacy users with `email_verified=false` still exist in the prod DB.
  Switching the global flag to `true` would lock them out. The mitigation
  plan is documented at `docs/launch/email-verification-sweep.md` (created
  in PR 3.4 of this initiative; link added once that PR lands).
- Password-change while signed in is currently routed through Better Auth
  internals; when a dedicated `/api/auth/password` route lands, drop
  `requireVerifiedEmail()` into the chain. Tracked in card §Deferred.

---

## H8 — `Cross-Origin-Resource-Policy` per-route override

**Reference:** [`docs/security/hardening/H8-corp-per-route.md`](../hardening/H8-corp-per-route.md), PR #1606.

### Threat model

`apps/server/src/http/security.ts` configures Helmet with
`crossOriginResourcePolicy: { policy: "cross-origin" }` so the SPA on Vercel
can fetch the API. The same header would be returned for **every** API route
including session-protected ones (`/api/me`, `/api/mono/*`, `/api/chat/*`),
which turns the API into a CORB-bypass surface usable by attacker-controlled
origins (login-state oracle via `<img src="https://api.../api/me">`).

### As-shipped fix

`apps/server/src/http/requireSession.ts:25-27` — `setSameOriginCorp(res)` is
called **before** the session resolves, so the override applies uniformly to
200, 401 and 500 responses (otherwise the 401 vs 200 split itself becomes the
oracle).

### Reproduction — protected route (200)

```bash
# 1) Sign in to obtain the session cookie.
pnpm --filter @sergeant/server dev
curl -s -c /tmp/cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"verified@example.test","password":"p455w0rd!!"}' \
  http://localhost:5000/api/auth/sign-in

# 2) Hit /api/me from an attacking origin and inspect headers.
curl -i -b /tmp/cookies.txt \
  -H 'Origin: https://evil.example' \
  http://localhost:5000/api/me | grep -i 'cross-origin-resource-policy'
```

**Expected:** `Cross-Origin-Resource-Policy: same-origin` header on the 200
response.

**Observed (2026-05-06):** matches.

### Reproduction — protected route (401)

```bash
# 3) Same origin attack but without cookies — must still pin same-origin.
curl -i \
  -H 'Origin: https://evil.example' \
  http://localhost:5000/api/me | grep -i 'cross-origin-resource-policy'
```

**Expected:** HTTP 401, header `Cross-Origin-Resource-Policy: same-origin`.

**Observed (2026-05-06):** matches. The fix sets the header in
`requireSession()` **before** `await getSessionUser(req)`, so even the
auth-failure path has the override.

### Reproduction — `/api/mono/*` and `/api/chat/*`

```bash
# 4) Repeat for /api/mono/accounts (requireSession()).
curl -i -b /tmp/cookies.txt \
  http://localhost:5000/api/mono/accounts | grep -i 'cross-origin-resource-policy'

# 5) /api/chat does NOT use requireSession() at the middleware level — it
#    calls getSessionUser() inside the handler so anonymous (IP-keyed)
#    chat is supported. CORP is therefore inherited from helmet's
#    cross-origin default. This is intentional per H8 card §Recommendation.
curl -i \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' \
  -d '{"messages":[]}' \
  http://localhost:5000/api/chat | grep -i 'cross-origin-resource-policy'
```

**Expected:** `/api/mono/accounts` → `same-origin`. `/api/chat` →
`cross-origin` (intentional; `/api/chat` is not session-only). The
login-state oracle is closed because `/api/me` and `/api/mono/*` (the two
high-signal endpoints) flip same-origin even on 401.

**Observed (2026-05-06):** matches the Recommendation. Note the asymmetry
with `/api/chat` is a known design call — see PR 3.2 (`session-protection`
integration test) for the programmatic confirmation that no other sensitive
endpoint regressed back to `cross-origin`.

### Reproduction — public endpoints kept cross-origin

```bash
# 6) /healthz, /api/csp-report, /api/metrics/web-vitals must stay
#    cross-origin per the H8 card.
for ep in /healthz /api/csp-report /api/metrics/web-vitals; do
  echo "=== $ep ==="
  curl -i http://localhost:5000$ep 2>/dev/null | grep -i 'cross-origin-resource-policy'
done
```

**Expected:** all three return `cross-origin`.

**Observed (2026-05-06):** matches.

### Residual risk

- `/api/chat` is intentionally cross-origin to support the public quota path;
  the residual oracle is "is this user logged in" (different rate-limit
  numbers in the response body would leak it). Mitigation: response shapes
  for logged-in vs anonymous chat are kept structurally identical (counter
  numbers normalised), tracked in `chat-anonymous-parity.md` as a separate
  card.

---

## H9 — `transcribe` USD-cap pre-charge + boot-time `AI_QUOTA_DISABLED` guard

**Reference:** [`docs/security/hardening/H9-transcribe-usd-cap.md`](../hardening/H9-transcribe-usd-cap.md), PRs #1567 and #1613.

### Threat model

`POST /api/transcribe` accepts up to 10 MB of audio per request and the
existing rate-limit + count-quota are not denominated in USD. A compromised
account with 100 daily slots can burn $4–$8/day on Groq Whisper alone;
without a USD ledger there is no inline circuit breaker.

A second issue: `AI_QUOTA_DISABLED=true` is a billing kill-switch that is
fine in CI/test but catastrophic in production. Originally it logged a
`warn` at module-load and continued; an operator could leave it set and burn
the entire Anthropic / Groq budget before noticing.

### As-shipped fixes

- `apps/server/src/env/env.ts:442-452` — production startup throws if
  `AI_QUOTA_DISABLED=true`. The server refuses to listen on the port.
- `apps/server/src/modules/transcribe/transcribe.ts:151-152` —
  `assertTranscribeUsdCap()` is invoked **after** body buffering and MIME
  validation but **before** the Groq call, so the cap blocks the spend
  pre-flight (HTTP 402 + `code: "TRANSCRIBE_USD_CAP"`).
- `apps/server/src/modules/transcribe/transcribe.ts:175` —
  `recordTranscribeUsdSpend()` UPSERTs into `ai_usage_daily.usd_micros`
  on success (post-charge ledger).

### Reproduction — production boot guard

```bash
# 1) Production-mode boot with the kill-switch ON must fail at startup.
export NODE_ENV=production
export RAILWAY_ENVIRONMENT=production
export AI_QUOTA_DISABLED=true
export DATABASE_URL=$STAGING_DATABASE_URL
export BETTER_AUTH_SECRET=$STAGING_BETTER_AUTH_SECRET
pnpm --filter @sergeant/server start
echo "exit=$?"
```

**Expected:** process exits non-zero with the message
`AI_QUOTA_DISABLED MUST NOT be set in production. ...`. The HTTP server
never binds to `:5000`.

**Observed (2026-05-06):** matches. Boot-time `Error` thrown from
`assertStartupEnv` in `apps/server/src/env/env.ts:448`.

### Reproduction — USD-cap pre-charge with 9 MB audio

```bash
# 2) Generate a real ~9 MB WAV so `Buffer.length` matches the cap math
#    that the handler uses (10 MB limit, ~$0.04 per 10 MB).
sox -n -r 44100 -c 2 /tmp/9mb.wav synth 60 sine 1000 vol 0.1
ls -lh /tmp/9mb.wav   # ≈ 10 MB raw-PCM header + 60 s payload

# 3) Boot dev profile with a tiny cap so the second call exceeds it.
export NODE_ENV=development
export TRANSCRIBE_USD_CAP_DAILY_MICROS=10000   # $0.01
unset AI_QUOTA_DISABLED
pnpm --filter @sergeant/server dev

# 4) Sign in (to obtain the session cookie used by requireSession()).
curl -s -c /tmp/cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"verified@example.test","password":"p455w0rd!!"}' \
  http://localhost:5000/api/auth/sign-in

# 5) First call — body fits under the cap (estimate ~$0.036 > $0.01,
#    so this *first* call is already blocked because the pre-charge
#    estimator alone exceeds the daily cap).
curl -i -b /tmp/cookies.txt \
  -H 'Content-Type: audio/wav' \
  --data-binary @/tmp/9mb.wav \
  http://localhost:5000/api/transcribe?language=uk
```

**Expected:** HTTP 402, body
`{"error":"Денний ліміт витрат на голосову транскрипцію вичерпано. Спробуйте завтра.","code":"TRANSCRIBE_USD_CAP","cap_usd":0.01,"spent_usd":0}`.
Pino warn event `transcribe.usd_cap_hit` with `subject`, `bucket`,
`spent_micros`, `cap_micros`, `audio_bytes`. Prometheus
`transcribe_usd_cap_events_total{outcome="cap_hit"}` increments by 1.

**Observed (2026-05-06):** matches.

### Reproduction — happy path with default cap (post-success ledger)

```bash
# 6) Reset the env to default cap ($1.00/day) and try a smaller audio.
export TRANSCRIBE_USD_CAP_DAILY_MICROS=1000000
sox -n -r 22050 -c 1 /tmp/5s.wav synth 5 sine 440 vol 0.2
curl -i -b /tmp/cookies.txt \
  -H 'Content-Type: audio/wav' \
  --data-binary @/tmp/5s.wav \
  http://localhost:5000/api/transcribe?language=uk

# 7) Inspect the ledger row.
psql "$DATABASE_URL" \
  -c "SELECT subject_key, usage_day, bucket, request_count, usd_micros
        FROM ai_usage_daily
        WHERE bucket LIKE 'transcribe:%' ORDER BY usage_day DESC LIMIT 1;"
```

**Expected:** HTTP 200 with `text` and `durationSec`. `ai_usage_daily` row
has `usd_micros > 0` (≈ 20 micros for a 5 s clip), `request_count = 1`,
`bucket = 'transcribe:whisper-large-v3-turbo'`.

**Observed (2026-05-06):** matches. Note: the unit-test suite at
`apps/server/src/modules/transcribe/usdCap.test.ts` mocks the DB; PR 3.3 of
this initiative adds a real-Postgres e2e to close that gap.

### Residual risk

- Multipart-S3 pre-flight upload is still deferred (card §Deferred). The
  current handler buffers up to 10 MB in Express memory; cost is bounded by
  the USD-cap, but memory pressure is not.
- Per-IP and per-user-USD ledger correlation (slow-burn detection) is not
  implemented; tracked separately.

---

## Verification checklist

- [x] H5 production-env reproduction — `exp://` callback rejected, dev allowed
- [x] H5 `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES` override is replace-only
- [x] H6 `/api/mono/connect` 403 without `email_verified=true`
- [x] H6 `/api/mono/connect` 200 once `emailVerified` flipped in DB
- [x] H6 legacy users (`REQUIRE_EMAIL_VERIFICATION=false`) keep working
- [x] H8 `Cross-Origin-Resource-Policy: same-origin` on `/api/me` 200 + 401
- [x] H8 same-origin override applies on `/api/mono/*`
- [x] H8 public endpoints (`/healthz`, `/api/csp-report`, `/api/metrics/web-vitals`)
      kept `cross-origin` per design
- [x] H9 production startup fails when `AI_QUOTA_DISABLED=true`
- [x] H9 9 MB audio request returns 402 + friendly error when cap exceeded
- [x] H9 successful 5 s clip increments `ai_usage_daily.usd_micros`

## Follow-ups

- [ ] Re-run the sweep against the **production** Railway service (this run
      used a staging Postgres). Owner: `@Skords-01`. Target: pre-launch
      `2026-Q3` window (post-0010 launch).
- [ ] Pair this transcript with an external pen-tester engagement before
      the public launch — see `docs/launch/launch-readiness.md` for the
      gate checklist.
- [ ] PR 3.2 (programmatic `requireSession()` introspection) closes the
      H8-coverage gap that this manual sweep can only spot-check.
- [ ] PR 3.3 (real-audio e2e for transcribe) closes the H9 mock-test gap.
- [ ] PR 3.4 (`docs/launch/email-verification-sweep.md` — added by that PR)
      closes the H6 legacy-user residual risk before the global flag flips
      to `true`.

## Related documents

- [`docs/playbooks/security-pen-test-checklist.md`](../../playbooks/security-pen-test-checklist.md) — the recipe that points to this transcript
- [`docs/security/hardening/README.md`](../hardening/README.md) — full hardening backlog
- [`docs/security/disaster-recovery.md`](../disaster-recovery.md) — recovery posture for security incidents
- [`docs/initiatives/0011-foundation-adoption-and-process-discipline.md`](../../initiatives/0011-foundation-adoption-and-process-discipline.md) — owning initiative
