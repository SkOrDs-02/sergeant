# H5 — `getTrustedOrigins()` includes `exp://` in production

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-04 — `exp://` gated behind `NODE_ENV !== "production"`, ops override via `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES`).

| Field          | Value                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**   | High (CVSS 7.0, AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:N)                                                                           |
| **Sprint**     | [Sprint 2](./sprint-2.md)                                                                                                      |
| **Owner**      | backend                                                                                                                        |
| **Effort**     | 0.25 person-day                                                                                                                |
| **Status**     | Closed (2026-05-04 — `exp://` gated behind `NODE_ENV !== "production"`, ops override via `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES`) |
| **Discovered** | 2026-05-03 deep security review                                                                                                |

## Summary

The manual `getTrustedOrigins()` array in `apps/server/src/auth.ts` registered
`exp://` unconditionally. `exp://` is the Expo Go development scheme and is
not bound to a single application — any other Expo Go app on the same device
can claim it. In production (where users are on the published `sergeant://`
scheme — see `apps/mobile/app.config.ts → scheme: "sergeant"`) `exp://`
should not be a trusted origin.

Note: the upstream `@better-auth/expo` plugin's `init()` already gates
`exp://` behind `process.env.NODE_ENV === "development"`, but Better Auth
merges the plugin's list with the manual `trustedOrigins` array. The
production leak came from our manual array, not from the plugin.

## Affected files

- `apps/server/src/auth.ts` — manual `getTrustedOrigins()` and the new
  `getTrustedNativeSchemes()` helper.
- `apps/server/src/auth.test.ts` — production / dev / override regression
  tests that lock the gate in place.
- `.env.example` — documents `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES`.
- `apps/mobile/app.config.ts` — confirms `scheme: "sergeant"` is the
  production deep-link scheme. (`com.sergeant.app` is the iOS bundle id,
  not a URL scheme — earlier audit notes conflated the two.)

## Evidence

The audit traced `getTrustedOrigins()` (manual helper in `auth.ts`) and
observed `exp://` in the resulting array regardless of `NODE_ENV`. The
`@better-auth/expo` plugin already gates `exp://` behind
`NODE_ENV === "development"` in its `init()` (verified in
`node_modules/@better-auth/expo/dist/index.js`), so the production leak was
entirely on our side.

## Impact

1. **CSRF-like login redirect attack.** A malicious Expo Go app can host a UI
   that triggers a login flow against our backend with a redirect to `exp://`
   and intercept the session cookie or bearer in the deep link.
2. **OAuth callback hijack.** Apple/Google OAuth providers honour the trusted
   origin list when constructing redirect URIs; an attacker-controlled
   `exp://` consumer can capture authorization codes.
3. **Compromise scope:** any user who installs a malicious Expo Go app and
   signs in to our service through it.

## Recommendation

- Gate `exp://` behind `process.env.NODE_ENV !== "production"` in the
  manual `getTrustedOrigins()` array.
- Introduce `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES` env-var (comma-separated)
  for ops overrides (e.g. staging needs `sergeant-staging://`). The
  override **replaces** the entire defaults — there is no merge mode by
  design (the only realistic use-case is "remove `exp://` even in dev").
- Default schemes: production → `["sergeant://"]`; dev →
  `["sergeant://", "exp://"]`. The production scheme is `sergeant://`
  (Expo `scheme` field in `apps/mobile/app.config.ts`), not
  `com.sergeant.app://` (which is the iOS bundle id).
- Document the env-var in `.env.example` and `apps/mobile-shell/README.md`.

## Correction points

- `apps/server/src/auth.ts` — keep `expo()` plugin call as-is (its `init()`
  already gates `exp://` correctly), but replace the static array in
  `getTrustedOrigins()` with a call to a new `getTrustedNativeSchemes()`
  helper:

```ts
function getTrustedNativeSchemes(): string[] {
  const override = process.env.BETTER_AUTH_TRUSTED_NATIVE_SCHEMES;
  if (override !== undefined) {
    return override
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.NODE_ENV === "production") return ["sergeant://"];
  return ["sergeant://", "exp://"];
}
```

- `apps/server/src/auth.test.ts` — three regression tests: prod (no
  `exp://`), dev (both), explicit override (replaces defaults).
- `.env.example` — `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES` block under the
  Better Auth section.

## Verification

- **Unit (locked in 2026-05-04):** with `NODE_ENV=production` and the
  env-var unset, `auth.options.trustedOrigins` does not contain `exp://`
  but contains `sergeant://`. See
  `apps/server/src/auth.test.ts` (`H5: trustedOrigins у production НЕ
містять exp://`). Two sibling tests cover dev defaults and the explicit
  override path.
- **Unit:** with `NODE_ENV=development` and no override, both
  `sergeant://` and `exp://` are present.
- **Manual:** in staging, attempt OAuth with `redirect_uri=exp://...`;
  expect Better Auth to reject with `untrusted_origin`.

## Implementation log

| Date       | Event                                                                                                                                                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-03 | Drift detected during Sprint 2 prep; card opened.                                                                                                                                                                                                                                                                             |
| 2026-05-04 | Closed: added `getTrustedNativeSchemes()` helper in `apps/server/src/auth.ts` (gates `exp://` behind dev), introduced `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES` env-var, three regression tests in `auth.test.ts`, documented env-var in `.env.example`. Confirmed production scheme is `sergeant://` (not `com.sergeant.app://`). |

## Cross-references

- [`./H1-mobile-bearer-storage.md`](./H1-mobile-bearer-storage.md)
- [`../access-policy.md`](../access-policy.md)
