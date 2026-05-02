import { useCallback, useEffect, useState } from "react";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage";

const IOS_BANNER_DISMISSED_KEY = "ios_install_banner_dismissed";

export function useIosInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (safeReadStringLS(IOS_BANNER_DISMISSED_KEY) === "1") return;

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
  }, []);

  const dismiss = useCallback(() => {
    safeWriteLS(IOS_BANNER_DISMISSED_KEY, "1");
    setVisible(false);
  }, []);

  return { visible, dismiss };
}
