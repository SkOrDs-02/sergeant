# PR-29: `window.__sergeantShellNavigate` global → BroadcastChannel

> **Last touched:** 2026-07-20 by @cursoragent. **Next review:** ніколи (read-only архів).
> **Status:** Closed — PR-1 [#2526](https://github.com/Skords-01/Sergeant/pull/2526) + PR-2 (2026-07-20: global shim removed; BroadcastChannel + pre-mount queue only). Fast-forward archived 2026-07-20.

|                    |                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Low (L2)                                                                                                                          |
| **Linked finding** | L2 (`00-overview.md`)                                                                                                             |
| **Owner**          | @Skords-01                                                                                                                        |
| **Effort**         | 1 день                                                                                                                            |
| **Touches**        | `apps/web/src/core/app/ShellDeepLinkBridge.tsx`, `apps/mobile-shell/src/index.ts`, `packages/shared/src/shell/deepLinkChannel.ts` |

## Outcome

- Canonical delivery: `BroadcastChannel("sergeant-shell-deeplink")`.
- Cold-start / BC-less WebView: `window.__sergeantShellDeepLinkQueue` + `sergeant-shell-deeplink-queue` event.
- `window.__sergeantShellNavigate` **видалено** (PR-2, 2026-07-20).

## Refs

- [MDN: BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- `docs/04-governance/security/hardening/M19-mobile-deeplink-sanitize.md`
