import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { trackEvent } from "../observability/analytics";

const PWA_SESSIONS_KEY = "pwa_session_count";
const PWA_DISMISSED_KEY = "pwa_install_dismissed";
const INSTALL_DELAY_MS = 30000;
const MIN_SESSIONS = 2;

/**
 * `BeforeInstallPromptEvent` ще не у lib.dom.d.ts — оголошуємо локально.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Контролер PWA-install-banner-а: ловимо `beforeinstallprompt`, відкладаємо
 * до тих пір, поки користувач не побачив застосунок принаймні `MIN_SESSIONS`
 * раз і не пробув ≥ `INSTALL_DELAY_MS` мс на поточному заході — і вже після
 * цього показуємо банер у `HubMainContent`.
 *
 * Wave-1 PR-07 додає телеметричний funnel —
 * `PWA_INSTALL_PROMPTED → PWA_INSTALL_{ACCEPTED|DISMISSED} → PWA_INSTALLED` —
 * див. `analyticsEvents.ts`. Метрика, яку моніторить master tracker:
 * `pwa_installed / first_real_entry ≥ 8 %`.
 *
 * `appinstalled` фіксується незалежно від банера: інсталяція може стати з
 * нативного browser-меню (наприклад, Chrome address bar prompt), і ми хочемо
 * зарахувати її у funnel так само, як coming-from-banner шлях.
 */
export function usePwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ready, setReady] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const promptedRef = useRef(false);

  useEffect(() => {
    const count = parseInt(safeReadStringLS(PWA_SESSIONS_KEY) || "0", 10) + 1;
    safeWriteLS(PWA_SESSIONS_KEY, String(count));

    const handler = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      deferredRef.current = evt;
      setPrompt(evt);
    };
    const installedHandler = () => {
      // `appinstalled` стріляє і коли інсталяція пройшла з нашого банера,
      // і коли user обрав native browser-меню — у будь-якому разі це
      // термінальна успішна точка funnel-у.
      trackEvent(ANALYTICS_EVENTS.PWA_INSTALLED, {});
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  useEffect(() => {
    if (!prompt) return undefined;
    if (safeReadStringLS(PWA_DISMISSED_KEY) === "1") return undefined;

    const sessions = parseInt(safeReadStringLS(PWA_SESSIONS_KEY) || "1", 10);

    if (sessions >= MIN_SESSIONS) {
      const timer = setTimeout(() => setReady(true), INSTALL_DELAY_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [prompt]);

  // Фіксуємо impression-event один раз за сесію — `ready` стає `true` лише
  // після `INSTALL_DELAY_MS` ms таймера + 2 сесій, тож подія співпадає з
  // моментом, коли банер реально потрапив на екран.
  useEffect(() => {
    if (!prompt || !ready || promptedRef.current) return;
    promptedRef.current = true;
    trackEvent(ANALYTICS_EVENTS.PWA_INSTALL_PROMPTED, { surface: "android" });
  }, [prompt, ready]);

  const install = useCallback(async () => {
    const p = deferredRef.current;
    if (!p) return;
    p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === "accepted") {
      trackEvent(ANALYTICS_EVENTS.PWA_INSTALL_ACCEPTED, {});
      deferredRef.current = null;
      setPrompt(null);
      setReady(false);
    } else {
      // Native chooser dismiss (≠ banner-X). Не персистимо
      // `PWA_DISMISSED_KEY`, щоб юзер міг ще раз ініціювати install з UI —
      // але метимо подію з `via: "chooser"`, щоб дашборд відрізняв native
      // dismissal від навмисного "Закрити" з банера.
      trackEvent(ANALYTICS_EVENTS.PWA_INSTALL_DISMISSED, {
        surface: "android",
        via: "chooser",
      });
    }
  }, []);

  const dismiss = useCallback(() => {
    safeWriteLS(PWA_DISMISSED_KEY, "1");
    trackEvent(ANALYTICS_EVENTS.PWA_INSTALL_DISMISSED, {
      surface: "android",
      via: "banner",
    });
    setReady(false);
    setPrompt(null);
  }, []);

  return { canInstall: !!prompt && ready, install, dismiss };
}
