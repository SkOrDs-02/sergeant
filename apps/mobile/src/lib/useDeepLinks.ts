/**
 * Runtime wiring that turns native `Linking` events (cold-start URL
 * from `Linking.getInitialURL()` + warm-start `addEventListener("url")`)
 * into Expo Router navigations for every `sergeant://…` scheme the
 * client supports.
 *
 * Architecture
 * ------------
 * Pure URL → structured-link parsing lives in `deepLinks.ts` so it is
 * exercised by unit tests without pulling in `expo-linking` or
 * `expo-router` mocks. This hook is the tiny imperative shim that:
 *
 *  1. Fetches the initial URL on mount (cold-start case — app was
 *     launched by tapping a deep link / push-notification / Android
 *     shortcut that targets `sergeant://…`).
 *  2. Subscribes to subsequent URLs while the app is running (warm-
 *     start case — another app handed off a deep link, or an
 *     Android shortcut was long-pressed from the launcher).
 *  3. Passes the raw URL through `parseSergeantUrl`, skipping any
 *     URL that does not belong to the client.
 *  4. For auth-callback URLs, deliberately does nothing so Better
 *     Auth's own `Linking` listener (registered by the `expoClient`
 *     plugin in `src/auth/authClient.ts`) is the one that consumes
 *     the token. This mirrors the guidance in `docs/engineering/mobile/overview.md`
 *     ("Auth" section) where token capture is owned by Better Auth
 *     end-to-end.
 *  5. For every other parsed link, maps it to an `Href` via
 *     `hrefForDeepLink` and calls `router.push` (warm) or
 *     `router.replace` (cold — so the fresh process does not have
 *     the intermediate hub screen in the back-stack).
 *
 * The hook renders nothing — it is mounted once, as a sibling of
 * `<Stack />` inside `app/_layout.tsx`, after Expo Router has had a
 * chance to boot the navigation tree. Mounting before that would
 * cause `router.push` to no-op because the `NavigationContainer`
 * has not attached yet.
 */
import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import { useRouter, type Href } from "expo-router";

import { hrefForDeepLink, parseSergeantUrl } from "./deepLinks";

/**
 * Side-effect hook. Returns nothing — call it from a top-level
 * component that mounts once (`RootLayout`).
 */
export function useDeepLinks(): void {
  const router = useRouter();
  // Guards against navigating twice for the same cold-start URL:
  // `Linking.getInitialURL()` resolves asynchronously and, on some
  // Android OEMs, the listener registered in step (2) also fires for
  // the cold-start URL. Tracking "the URL we already handled" prevents
  // double-push.
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const handle = (rawUrl: string | null, isCold: boolean) => {
      if (!rawUrl) return;
      if (lastHandledRef.current === rawUrl) return;
      lastHandledRef.current = rawUrl;

      const link = parseSergeantUrl(rawUrl);
      if (!link) return;

      // Auth callback is consumed by Better Auth's own listener —
      // see module-level comment above. We intentionally fall
      // through without touching the router.
      if (link.type === "auth-callback") return;

      const href = hrefForDeepLink(link);
      if (!href) return;

      if (isCold) {
        router.replace(href as Href);
      } else {
        router.push(href as Href);
      }
    };

    // Cold start: fetch the URL the app was launched with.
    void Linking.getInitialURL().then((url) => {
      if (cancelled) return;
      handle(url, true);
    });

    // Warm start: subscribe for URLs while the app runs.
    const sub = Linking.addEventListener("url", ({ url }) => {
      handle(url, false);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router]);
}
