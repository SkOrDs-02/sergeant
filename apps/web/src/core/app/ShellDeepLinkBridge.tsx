import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logger } from "@shared/lib";
import {
  createDeepLinkChannel,
  isCapacitor,
  SHELL_DEEPLINK_BRIDGE_READY_KEY,
  SHELL_DEEPLINK_QUEUE_EVENT,
  SHELL_DEEPLINK_QUEUE_KEY,
  type DeepLinkMessage,
} from "@sergeant/shared";

/**
 * Bridge-компонент, який звʼязує Capacitor-shell і React Router через
 * `BroadcastChannel("sergeant-shell-deeplink")` (stack-pulse PR-29).
 *
 * Cold-start: shell push-ить шляхи у `window.__sergeantShellDeepLinkQueue`
 * до mount-у bridge-у; drain one-shot при install-і. BC-less WebView
 * (без BroadcastChannel) drain-ить queue також на `sergeant-shell-deeplink-queue`
 * custom event.
 *
 * У браузері — no-op (`isCapacitor()` guard). Маунтиться всередині
 * `<BrowserRouter>` — інакше `useNavigate()` кине.
 */

type DeepLinkBridgeWindow = Window & {
  [SHELL_DEEPLINK_QUEUE_KEY]?: string[];
  [SHELL_DEEPLINK_BRIDGE_READY_KEY]?: boolean;
};

const ALLOWED_PATH_PREFIXES: readonly string[] = [
  "/sign-in",
  "/welcome",
  "/reset-password",
  "/profile",
  "/design",
  "/pricing",
  "/status",
  "/assistant",
  "/chat",
  "/help",
  "/finyk",
  "/fizruk",
  "/nutrition",
  "/routine",
  "/coach",
  "/auth",
  "/oauth",
];

function isSafeNavPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (/(?:^|[/?#&=])(?:javascript|data|vbscript):/i.test(path)) return false;
  if (path === "/") return true;
  for (const prefix of ALLOWED_PATH_PREFIXES) {
    if (
      path === prefix ||
      path.startsWith(`${prefix}/`) ||
      path.startsWith(`${prefix}?`) ||
      path.startsWith(`${prefix}#`)
    ) {
      return true;
    }
  }
  return false;
}

const COALESCE_WINDOW_MS = 500;

interface RecentNav {
  path: string;
  timestamp: number;
  receivedAt: number;
}

export function ShellDeepLinkBridge(): null {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isCapacitor()) return;
    if (typeof window === "undefined") return;
    const w = window as DeepLinkBridgeWindow;

    let lastNav: RecentNav | null = null;

    function handleNav(
      path: string,
      timestamp: number,
      source: "broadcast" | "queue",
    ): void {
      if (!isSafeNavPath(path)) {
        logger.warn("[shell-deep-link] rejected unsafe path", {
          path,
          source,
        });
        return;
      }
      const now = Date.now();
      if (
        lastNav &&
        lastNav.path === path &&
        lastNav.timestamp === timestamp &&
        now - lastNav.receivedAt < COALESCE_WINDOW_MS
      ) {
        return;
      }
      lastNav = { path, timestamp, receivedAt: now };
      try {
        navigate(path);
      } catch (err) {
        logger.warn("[shell-deep-link] navigate failed", { source, err });
      }
    }

    function drainQueue(): void {
      const queue = w[SHELL_DEEPLINK_QUEUE_KEY];
      if (!Array.isArray(queue) || queue.length === 0) return;
      const pending = queue.splice(0, queue.length);
      for (const path of pending) {
        handleNav(path, Date.now(), "queue");
      }
    }

    const channel = createDeepLinkChannel();
    const unsubscribe = channel.subscribe((msg: DeepLinkMessage) => {
      if (msg.source !== "shell") return;
      handleNav(msg.url, msg.timestamp, "broadcast");
    });

    w[SHELL_DEEPLINK_BRIDGE_READY_KEY] = true;
    drainQueue();

    const onQueueEvent = (): void => {
      drainQueue();
    };
    window.addEventListener(SHELL_DEEPLINK_QUEUE_EVENT, onQueueEvent);

    return () => {
      window.removeEventListener(SHELL_DEEPLINK_QUEUE_EVENT, onQueueEvent);
      unsubscribe();
      channel.close();
      delete w[SHELL_DEEPLINK_BRIDGE_READY_KEY];
    };
  }, [navigate]);

  return null;
}
