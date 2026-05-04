# H5 — `getTrustedOrigins()` includes `exp://` in production

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                                                |
| -------------- | ---------------------------------------------------- |
| **Severity**   | High (CVSS 7.0, AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:N) |
| **Sprint**     | [Sprint 2](./sprint-2.md)                            |
| **Owner**      | backend                                              |
| **Effort**     | 0.25 person-day                                      |
| **Status**     | Open                                                 |
| **Discovered** | 2026-05-03 deep security review                      |

## Summary

The Better Auth `expo()` plugin registers `exp://` as a trusted redirect scheme
unconditionally. `exp://` is the Expo Go development scheme and is not bound to
a single application — any other Expo Go app on the same device can claim it. In
production (where users are on the published `com.sergeant.app://` scheme)
`exp://` should not be a trusted origin.

## Affected files

- `apps/server/src/auth.ts` — `expo({...})` plugin invocation.
- `apps/mobile-shell/capacitor.config.ts` / Expo config — confirms only
  `com.sergeant.app://` is the production scheme.

## Evidence

The audit traced `getTrustedOrigins()` (Better Auth helper) and observed `exp://`
in the resulting array regardless of `NODE_ENV`. The `expo()` plugin from Better
Auth always seeds the dev scheme.

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

- Gate `exp://` behind `process.env.NODE_ENV !== "production"`.
- Introduce `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES` env-var (comma-separated) with
  production defaulting to `com.sergeant.app://` only.
- Document the policy in `docs/security/access-policy.md` and
  `apps/mobile-shell/README.md`.

## Correction points

- `apps/server/src/auth.ts` — replace the static `expo()` invocation with:

```ts
const trustedNativeSchemes = (
  process.env.BETTER_AUTH_TRUSTED_NATIVE_SCHEMES ??
  (process.env.NODE_ENV === "production"
    ? "com.sergeant.app://"
    : "com.sergeant.app://,exp://")
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

expo({ trustedRedirectURLs: trustedNativeSchemes });
```

- `docs/security/access-policy.md` — document the env-var.
- `.env.example` — add `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES=com.sergeant.app://`.

## Verification

- **Unit:** with `NODE_ENV=production` and the env-var unset,
  `getTrustedOrigins()` does not return `exp://`.
- **Unit:** with `NODE_ENV=development` and no override, `exp://` is present.
- **Manual:** in staging, attempt OAuth with `redirect_uri=exp://...`; expect
  Better Auth to reject with `untrusted_origin`.

## Cross-references

- [`./H1-mobile-bearer-storage.md`](./H1-mobile-bearer-storage.md)
- [`../access-policy.md`](../access-policy.md)
