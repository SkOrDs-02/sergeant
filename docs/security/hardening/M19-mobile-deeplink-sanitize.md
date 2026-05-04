# M19 — Mobile shell deep-link query/fragment unsanitised

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Closed 2026-05-04 — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784).

| Field          | Value                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| **Severity**   | Medium                                                                                                   |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                                                                |
| **Owner**      | mobile                                                                                                   |
| **Effort**     | 0.25 person-day                                                                                          |
| **Status**     | Closed 2026-05-04 — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784) (batched with M10 + M14) |
| **Discovered** | 2026-05-03 deep security review                                                                          |

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

- `apps/mobile-shell/src/index.ts` — `parseDeepLink` rejects
  `javascript:` / `data:` / `vbscript:` schemes (case-insensitive) and
  any path that does not start with `/`. Path is matched against an
  allowlist of prefixes (`/auth/callback`, `/finyk`, `/nutrition`,
  `/routine`, `/fizruk`, `/insights`, `/settings`, `/login`).
- `apps/web/src/core/app/ShellDeepLinkBridge.tsx` — defensive recheck
  on the web side: even if the native shell forwards an unsafe URL,
  the web layer drops it before handing it to React-Router.
- `apps/mobile-shell/src/__tests__/parseDeepLink.test.ts` — every
  unsafe-scheme entry returns `null`; valid prefixes survive.

## Verification

- **Unit:** `apps/mobile-shell/src/__tests__/parseDeepLink.test.ts` —
  every entry in the unsafe-scheme table returns `null`; the prefix
  allowlist accepts only known surfaces.
- **Defence-in-depth:** `ShellDeepLinkBridge.tsx` re-checks the path
  on the web side, so a regression in the native shell still cannot
  reach React-Router with an unsafe URL.
- **Manual:** install staging build; `adb shell am start -W -a
android.intent.action.VIEW -d "com.sergeant.app://?next=javascript:alert(1)"`
  results in the app rejecting the navigation.

## Cross-references

- [`./H1-mobile-bearer-storage.md`](./H1-mobile-bearer-storage.md)
- [`./M20-mobile-back-button-confirm.md`](./M20-mobile-back-button-confirm.md)
