# PR-29: `window.__sergeantShellNavigate` global → BroadcastChannel

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **Severity**       | Low (L2)                                                                                              |
| **Linked finding** | L2 (`00-overview.md`)                                                                                 |
| **Owner**          | TBD (sponsor: @Skords-01)                                                                             |
| **Effort**         | 1 день                                                                                                |
| **Risk**           | Medium (mobile-shell деплой syncing з web; mismatched versions можуть тимчасово drop-нути deep links) |
| **Touches**        | `apps/web/src/core/app/ShellDeepLinkBridge.tsx`, `apps/mobile-shell/src/index.ts`                     |
| **Trigger**        | next deep-link-related bug (cross-document message reliability)                                       |

## Контекст

`apps/mobile-shell/src/index.ts` (Capacitor wrapper) шле deep-links у web app через global function:

```ts
// apps/mobile-shell/src/index.ts
window.__sergeantShellNavigate?.(url);

// apps/web/src/core/app/ShellDeepLinkBridge.tsx
window.__sergeantShellNavigate = (url: string) => navigate(parseDeepLink(url));
```

Issues:

1. Race condition — Capacitor може shoot перед reactshell mount (window prop undefined).
2. Не ідіоматичний — глобальний mutable function.
3. Не testable — потрібно mock window, не browser-API.
4. SSR-unsafe (хоча app SPA).

`BroadcastChannel` API — стандарт, persistent listener, reliable cross-context messaging (web ↔ shell ↔ workers).

## Scope

### 1. BroadcastChannel-based bridge

```ts
// packages/shared/src/shell/deepLinkChannel.ts
export const SHELL_DEEPLINK_CHANNEL = "sergeant-shell-deeplink";

export interface DeepLinkMessage {
  url: string;
  source: "shell" | "web";
  timestamp: number;
}
```

### 2. Web side

```ts
// apps/web/src/core/app/ShellDeepLinkBridge.tsx
useEffect(() => {
  const ch = new BroadcastChannel(SHELL_DEEPLINK_CHANNEL);
  ch.onmessage = (ev) => {
    const msg = ev.data as DeepLinkMessage;
    if (msg.source === "shell") navigate(parseDeepLink(msg.url));
  };
  return () => ch.close();
}, []);
```

### 3. Shell side

```ts
// apps/mobile-shell/src/index.ts
const ch = new BroadcastChannel(SHELL_DEEPLINK_CHANNEL);
function dispatchDeepLink(url: string) {
  ch.postMessage({ url, source: "shell", timestamp: Date.now() });
}
```

### 4. Pre-mount queue

Якщо web bridge ще не mounted, shell може push messages — BroadcastChannel persists. **Або** малий queue у `localStorage` як fallback (для дуже старих browser-ів).

### 5. Backward-compat shim

3 місяці після deploy — `window.__sergeantShellNavigate` lишається (no-op + console.warn). Після — drop.

## Out of scope

- Перехід на Capacitor `App.addListener("appUrlOpen")` API (вже частково використовується).
- Переписання deep-link parsing logic (`parseDeepLink.test.ts` covers existing).

## Acceptance criteria (DoD)

- [ ] `packages/shared/src/shell/deepLinkChannel.ts` — channel name + message type.
- [ ] `apps/web/src/core/app/ShellDeepLinkBridge.tsx` — BroadcastChannel listener.
- [ ] `apps/mobile-shell/src/index.ts` — BroadcastChannel sender; window-global shim з `console.warn`.
- [ ] Mobile-shell + web версії synced: `expected_protocol_version` shipped разом.
- [ ] `apps/mobile-shell/src/__tests__/deepLinkBridge.test.ts` covers BroadcastChannel.
- [ ] `apps/web/src/test/integration/shell-deeplink.test.ts` (new) — E2E через jsdom + BroadcastChannel polyfill.

## Тести

- Unit: BroadcastChannel mock (`vitest`) — message-flow round-trip.
- Integration: real BroadcastChannel у jsdom polyfill.
- Manual: Capacitor app cold-start + deep link from `mailto://` → web navigates.

## Rollout

1. PR-1: BroadcastChannel sender + listener (window-global lишається як alias).
2. PR-2 (3 місяці після, після iOS / Android Vault adoption): drop window-global.

## Risks & mitigations

| Risk                                                           | Mitigation                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| BroadcastChannel не підтримується у старих WKWebView (<iOS 15) | localStorage fallback у packages/shared/src/shell/                        |
| Mobile-shell ship-ить нову версію до web → window-global no-op | Версія protocol_version у message; mismatched → fallback на window-global |
| Web без shell → БroadcastChannel listener leaks                | `useEffect` cleanup: `ch.close()`                                         |

## Touchpoints (file:line)

- `apps/web/src/core/app/ShellDeepLinkBridge.tsx` — listener
- `apps/web/src/main.tsx` — window-global setup (зняти)
- `apps/mobile-shell/src/index.ts` — sender
- `apps/mobile-shell/src/__tests__/deepLinkBridge.test.ts` — existing tests
- `apps/mobile-shell/src/__tests__/parseDeepLink.test.ts` — existing tests
- `packages/shared/src/shell/deepLinkChannel.ts` — new

## Refs

- [MDN: BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- [Capacitor App.addListener](https://capacitorjs.com/docs/apis/app#addlistenerappurlopen-)
- `docs/security/hardening/M19-mobile-deeplink-sanitize.md`
