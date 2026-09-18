import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { isIOS, isStandalonePWA } from "@shared/lib/platform/iosStandalone";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { PROMO_BANNER_REVEAL_MS } from "@shared/lib/ui/timeouts";
import { trackEvent } from "../observability/analytics";
import {
  isInstallBannerSnoozed,
  readInstallBannerSnooze,
  snoozeInstallBanner,
} from "./installBannerSnooze";

/** Permanent opt-out — "Уже встановлено або не нагадувати" text link. */
const IOS_BANNER_DISMISSED_KEY = "ios_install_banner_dismissed";
/** Temporary defer — the icon-only "×" close (founder-ux-review round 2, O2). */
const IOS_BANNER_SNOOZE_KEY = "ios_install_banner_snooze_v1";

/**
 * iOS-Safari arm of the PWA-install funnel (Wave-1 PR-07). Safari does not
 * fire `beforeinstallprompt` / `appinstalled` events, so this hook is the
 * only signal we have on the iOS side; we track impression + dismiss here.
 *
 * Success-плече живе в `usePwaInstall` — перший запуск у standalone-режимі
 * зараховується як інсталяція. Режим визначає `isStandalonePWA()` за двома
 * сигналами: media-query `display-mode: standalone` і власний прапорець
 * `navigator.standalone`. Для нас важливіший другий — Safari media-query не
 * підтримує, тож саме він і покриває iOS. Раніше тут стояла обіцянка, що успіх
 * зарахує «серверна перевірка display-mode»; такого коду не існувало, і
 * `pwa_installed` не спрацював жодного разу (аудит телеметрії 2026-08-16).
 */
export function useIosInstallBanner() {
  const [visible, setVisible] = useState(false);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (safeReadStringLS(IOS_BANNER_DISMISSED_KEY) === "1") return undefined;
    if (isInstallBannerSnoozed(readInstallBannerSnooze(IOS_BANNER_SNOOZE_KEY)))
      return undefined;

    // Канонічна iOS + standalone детекція — спільний helper
    // (`@shared/lib/platform/iosStandalone`), переюзаний voice-стеком.
    if (isIOS() && !isStandalonePWA()) {
      const timer = setTimeout(() => setVisible(true), PROMO_BANNER_REVEAL_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (!visible || promptedRef.current) return;
    promptedRef.current = true;
    trackEvent(ANALYTICS_EVENTS.PWA_INSTALL_PROMPTED, { surface: "ios" });
  }, [visible]);

  /**
   * Explicit, permanent opt-out ("Уже встановлено або не нагадувати").
   * A deliberate choice — stays a forever-flag, unlike {@link snooze}.
   */
  const dismissForever = useCallback(() => {
    safeWriteLS(IOS_BANNER_DISMISSED_KEY, "1");
    trackEvent(ANALYTICS_EVENTS.PWA_INSTALL_DISMISSED, {
      surface: "ios",
      via: "banner",
    });
    setVisible(false);
  }, []);

  /**
   * Plain "×" close — defers the banner 30 days, up to
   * `INSTALL_BANNER_MAX_SNOOZES` times, instead of hiding it forever
   * (founder-ux-review round 2, O2: one accidental tap used to hide the
   * install invite for good).
   */
  const snooze = useCallback(() => {
    snoozeInstallBanner(
      IOS_BANNER_SNOOZE_KEY,
      readInstallBannerSnooze(IOS_BANNER_SNOOZE_KEY),
    );
    trackEvent(ANALYTICS_EVENTS.PWA_INSTALL_DISMISSED, {
      surface: "ios",
      via: "banner_snooze",
    });
    setVisible(false);
  }, []);

  return { visible, dismissForever, snooze };
}
