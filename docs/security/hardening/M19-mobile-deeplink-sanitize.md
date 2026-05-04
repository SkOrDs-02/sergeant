# M19 — Mobile shell deep-link query/fragment unsanitised

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | mobile                          |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`apps/mobile-shell/src/index.ts:173–205` `parseDeepLink` returns
`${parsed.pathname}${parsed.search}${parsed.hash}` verbatim. A crafted
`?next=javascript:alert(1)` (or `data:`/`vbscript:`) reaching React-Router /
`<a href={next}>` becomes a JS-context XSS without ever crossing a server
boundary.

## Recommendation

Sanitise on the web side of `__sergeantShellNavigate`:

```ts
function isSafePath(p: string) {
  return p.startsWith("/") && !/^javascript:|^data:|^vbscript:/i.test(p);
}
```

Whitelist allowed path prefixes (`/auth/callback`, `/finyk`, `/nutrition`,
…) so a future regression cannot repurpose the deep-link surface.

## Correction points

- `apps/mobile-shell/src/index.ts:173–205` — apply `isSafePath` and
  prefix-allowlist before forwarding.
- `apps/web/src/core/shell-bridge.ts` (or equivalent) — defensive recheck
  on the web side.
- `apps/mobile-shell/src/__tests__/deepLink.test.ts` — assert each unsafe
  scheme is rejected.

## Verification

- **Unit:** every entry in the unsafe-scheme table returns `null` /
  `false`.
- **Manual:** install staging build; `adb shell am start -W -a
android.intent.action.VIEW -d "com.sergeant.app://?next=javascript:alert(1)"`
  results in the app rejecting the navigation.

## Cross-references

- [`./H1-mobile-bearer-storage.md`](./H1-mobile-bearer-storage.md)
- [`./M20-mobile-back-button-confirm.md`](./M20-mobile-back-button-confirm.md)
