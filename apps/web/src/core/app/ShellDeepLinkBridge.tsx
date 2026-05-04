import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isCapacitor } from "@sergeant/shared";

/**
 * Bridge-компонент, який звʼязує Capacitor-shell і React Router через
 * namespaced window-ключі — без compile-time залежності веб-бандла на
 * `@capacitor/*`. Після маунту роутера виставляє
 * `window.__sergeantShellNavigate` (shell використовує його у
 * `appUrlOpen` handler) і прогає буферизовані deep-link шляхи, що
 * прилетіли ДО маунту (cold start через `com.sergeant.shell://…`
 * URL → Capacitor вже встиг пушнути path у
 * `window.__sergeantShellDeepLinkQueue`, але React Router тоді ще не
 * існував).
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

export function ShellDeepLinkBridge(): null {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isCapacitor()) return;
    if (typeof window === "undefined") return;
    const w = window as DeepLinkBridgeWindow;

    const handler = (path: string): void => {
      if (!isSafeNavPath(path)) {
        console.warn("[shell-deep-link] rejected unsafe path", { path });
        return;
      }
      navigate(path);
    };
    w.__sergeantShellNavigate = handler;

    // Drain-имо буфер cold-start шляхів одразу після install-у. Масив
    // міг бути заповнений shell-ем у вікні між `initNativeShell()` і
    // першим ефектом React-дерева — типовий сценарій при запуску апки
    // через `com.sergeant.shell://<path>`.
    const queue = w.__sergeantShellDeepLinkQueue;
    if (Array.isArray(queue) && queue.length > 0) {
      const pending = queue.splice(0, queue.length);
      for (const path of pending) {
        if (!isSafeNavPath(path)) {
          console.warn("[shell-deep-link] flush rejected unsafe path", {
            path,
          });
          continue;
        }
        try {
          navigate(path);
        } catch (err) {
          console.warn("[shell-deep-link] flush navigate failed", err);
        }
      }
    }

    return () => {
      // Чистимо саме наш handler — якщо хтось інший перевстановив
      // bridge (наприклад, HMR-перезапуск ефекту), не витираємо новіший.
      if (w.__sergeantShellNavigate === handler) {
        delete w.__sergeantShellNavigate;
      }
    };
  }, [navigate]);

  return null;
}
