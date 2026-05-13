import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logger } from "@shared/lib";
import {
  createDeepLinkChannel,
  isCapacitor,
  type DeepLinkMessage,
} from "@sergeant/shared";

/**
 * Bridge-компонент, який звʼязує Capacitor-shell і React Router. Підписується
 * на `BroadcastChannel("sergeant-shell-deeplink")` (canonical path, PR-29) і
 * паралельно лишає `window.__sergeantShellNavigate` як backward-compat shim
 * для async-deploy сценаріїв і старих WKWebView (<iOS 15.4) без
 * BroadcastChannel-у.
 *
 * Обидва шляхи прив'язані до однієї `handleNav(path, ts)` із короткою
 * coalescing-памʼяттю по `(path, timestamp)` — щоб одна deep-link подія,
 * яку mobile-shell свідомо шле ОБОМА шляхами під час перехідного періоду,
 * не призводила до двох `navigate()`.
 *
 * Cold-start буфер `window.__sergeantShellDeepLinkQueue` лишається — шляхи,
 * push-нуті у нього ДО маунту React-bridge-у, drain-яться one-shot після
 * install-у. Coalescing teж застосовується (на випадок якщо той же path
 * прилетить ще раз через канал у вікні coalescing-у).
 *
 * У браузері рендер no-op: guard `isCapacitor()` скіпає install-логіку,
 * і всі window-ключі лишаються `undefined`. Компонент повертає `null`
 * незалежно від плаформи — він лише для side-effect-ів ефекту.
 *
 * Маунтиться ВСЕРЕДИНІ `<BrowserRouter>`, інакше `useNavigate()` кине
 * «useNavigate() may be used only in the context of a <Router>».
 */

type DeepLinkBridgeWindow = Window & {
  __sergeantShellNavigate?: (path: string) => void;
  __sergeantShellDeepLinkQueue?: string[];
};

/**
 * Top-level path-prefix whitelist для shell-deep-link навігації
 * (M19 — `docs/security/hardening/M19-mobile-deeplink-sanitize.md`).
 *
 * Дзеркалить `ALLOWED_DEEP_LINK_PATH_PREFIXES` у `apps/mobile-shell/src/index.ts`
 * — навмисно дублюємо тут невеликий блок замість cross-package імпорту, щоб
 * не вводити нову runtime-залежність web-у на mobile-shell. Якщо колись
 * додаємо новий top-level маршрут — оновлюй обидва місця разом з
 * `KNOWN_PATHS` у `appPaths.ts`.
 */
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

/**
 * Defensive recheck (M19) перед `navigate(path)`.
 *
 * Парсер `parseDeepLink()` у нативному shell-і вже виконує цю саму
 * перевірку, але bridge — публічна точка входу: будь-який код, що
 * викликає `window.__sergeantShellNavigate(...)` напряму (зокрема з
 * Capacitor-плагіну, який ми не контролюємо), обходить нативний санітайзер.
 * Тому повторюємо валідацію тут — defense-in-depth.
 */
function isSafeNavPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  // Reject embedded XSS-схеми у будь-якій позиції — ловимо
  // `?next=javascript:alert(1)` тощо.
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

/**
 * Вікно у мілісекундах, протягом якого та сама `(path, timestamp)` пара
 * не призведе до повторного `navigate()`. Mobile-shell шле deep-link
 * через BroadcastChannel **і** через `window.__sergeantShellNavigate`
 * одночасно (`Date.now()` між цими викликами завжди < 50ms), тож
 * 500ms — щедрий запас для async dispatch-у на slow-device-ах.
 *
 * Coalescing орієнтований на `timestamp` із повідомлення: якщо native
 * shell отримує два РІЗНІ `appUrlOpen` для одного path-у — їх `timestamp`
 * відрізняються, обидва навігації проходять. Якщо один-і-той-самий
 * `appUrlOpen` дисер-нувся обома шляхами — `timestamp` ОДИН, проходить
 * лише перший виклик.
 */
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

    // Coalescing memory — невеликий ring (1 запис достатньо для типового
    // user pattern: тапнув ярлик у Push notification → один deep link).
    // У ризик-сценарії «два різних deep-link з однаковим path-ом протягом
    // 500ms» — другий буде coalesced, що ОК: користувач все одно вже
    // знаходиться на цьому шляху після першої навігації.
    let lastNav: RecentNav | null = null;

    function handleNav(
      path: string,
      timestamp: number,
      source: "broadcast" | "window" | "queue",
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
        // Дубль — друга гілка bridge-у вже доставила цю саму подію.
        return;
      }
      lastNav = { path, timestamp, receivedAt: now };
      try {
        navigate(path);
      } catch (err) {
        logger.warn("[shell-deep-link] navigate failed", { source, err });
      }
    }

    // ── Canonical path: BroadcastChannel ─────────────────────────────
    const channel = createDeepLinkChannel();
    const unsubscribe = channel.subscribe((msg: DeepLinkMessage) => {
      if (msg.source !== "shell") return; // не приймаємо self-loop з web→web
      handleNav(msg.url, msg.timestamp, "broadcast");
    });

    // ── Backward-compat: window-global shim ──────────────────────────
    // Лишається 3 місяці після PR-29 ship-у (rollout PR-2 у spec-у).
    // Mobile-shell у async-deploy-сценарії може ще не вміти
    // BroadcastChannel — fallback зберігає uptime навігації.
    const windowHandler = (path: string): void => {
      // `Date.now()` як псевдо-timestamp — window-global не несе ts,
      // тому coalescing з BC-шляхом працює тільки якщо обидва шляхи
      // ship-ляться у одному релізі. У змішаному релізі (старий
      // mobile-shell без BC) дублів просто немає — лише window-шлях
      // спрацьовує.
      handleNav(path, Date.now(), "window");
    };
    w.__sergeantShellNavigate = windowHandler;

    // ── Cold-start queue drain ───────────────────────────────────────
    const queue = w.__sergeantShellDeepLinkQueue;
    if (Array.isArray(queue) && queue.length > 0) {
      const pending = queue.splice(0, queue.length);
      for (const path of pending) {
        handleNav(path, Date.now(), "queue");
      }
    }

    return () => {
      unsubscribe();
      channel.close();
      // Чистимо саме наш handler — якщо хтось інший перевстановив
      // bridge (наприклад, HMR-перезапуск ефекту), не витираємо новіший.
      if (w.__sergeantShellNavigate === windowHandler) {
        delete w.__sergeantShellNavigate;
      }
    };
  }, [navigate]);

  return null;
}
