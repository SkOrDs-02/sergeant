import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { trackEvent } from "../observability/analytics";

const IOS_BANNER_DISMISSED_KEY = "ios_install_banner_dismissed";

/**
 * iOS-Safari arm of the PWA-install funnel (Wave-1 PR-07). Safari does not
 * fire `beforeinstallprompt` / `appinstalled` events, so this hook is the
 * only signal we have on the iOS side; we track impression + dismiss here
 * and rely on Add-to-Home-Screen telemetry from server-side `display-mode:
 * standalone` checks for the success arm.
 */
export function useIosInstallBanner() {
  const [visible, setVisible] = useState(false);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (safeReadStringLS(IOS_BANNER_DISMISSED_KEY) === "1") return undefined;

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    if (isIOS && !isStandalone) {
      const timer = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (!visible || promptedRef.current) return;
    promptedRef.current = true;
    trackEvent(ANALYTICS_EVENTS.PWA_INSTALL_PROMPTED, { surface: "ios" });
  }, [visible]);

  const dismiss = useCallback(() => {
    safeWriteLS(IOS_BANNER_DISMISSED_KEY, "1");
    trackEvent(ANALYTICS_EVENTS.PWA_INSTALL_DISMISSED, {
      surface: "ios",
      via: "banner",
    });
    setVisible(false);
  }, []);

  return { visible, dismiss };
}
