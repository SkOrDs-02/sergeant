import { useCallback, useEffect, useMemo, useState } from "react";
import { ANALYTICS_EVENTS, STORAGE_KEYS } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { isIOSBrowserTab } from "@shared/lib/platform/iosStandalone";
import { wasIosInstallHintInlineShown } from "@shared/lib/platform/iosInstallHintVisit";
import {
  safeReadStringLS,
  safeReadStringSS,
  safeWriteLS,
  safeWriteSS,
} from "@shared/lib/storage/storage";
import { useStorageReady } from "../db/storageReady";
import { trackEvent } from "../observability/analytics";
import { countInstallSession } from "./installSessions";
import { shouldShowIosInstallHint } from "./iosInstallHint";
import type { HubNotification } from "./NotificationBell";

const copy = messages.iosInstallHint;

interface HintEnv {
  iosBrowserTab: boolean;
  sessions: number;
  dismissed: boolean;
}

function readDismissed(): boolean {
  return (
    safeReadStringLS(STORAGE_KEYS.IOS_INSTALL_HINT_DISMISSED) === "1" ||
    // Явна відмова старого `IOSInstallBanner` («Уже встановлено або не
    // нагадувати»), знятого redesign v3 2026-10-09. Людина вже сказала «ні».
    safeReadStringLS(STORAGE_KEYS.IOS_BANNER_DISMISSED) === "1"
  );
}

/**
 * О-1 (а), спека `docs/work/specs/ios-install-hint-after-two-sessions.md`:
 * на iPhone/iPad у вкладці Safari з другої сесії дзвоник хаба несе рядок
 * «Встанови Sergeant на початковий екран» з тим самим текстом, що й
 * підказка під тумблером нагадувань (О-1 (б), `IosInstallPushHint`).
 * «Зрозуміло» закриває його назавжди.
 *
 * Події: наявна воронка встановлення, `pwa_install_prompted { surface:
 * "ios" }` раз за візит і `pwa_install_dismissed { surface: "ios", via:
 * "banner" }` (контракт `analyticsEvents.ts`: на iOS `banner` це явна
 * постійна відмова).
 */
export function useIosInstallHint(enabled: boolean): {
  notification: HubNotification | null;
} {
  const storageReady = useStorageReady();
  const [dismissedNow, setDismissedNow] = useState(false);

  // Платформу й сховище читаємо лише після бутстрапу `kv_store`: до нього
  // лічильник і прапорці в сирому localStorage порожні. У рендері, а не в
  // ефекті (`react-hooks/set-state-in-effect`): `countInstallSession`
  // ідемпотентний у межах вкладки, тож повторний виклик (StrictMode)
  // нічого не додає.
  const env = useMemo<HintEnv | null>(
    () =>
      storageReady
        ? {
            sessions: countInstallSession(),
            iosBrowserTab: isIOSBrowserTab(),
            dismissed: readDismissed(),
          }
        : null,
    [storageReady],
  );

  // Маркер (б) читаємо на кожному рендері: підказка під тумблером могла
  // зʼявитися в Налаштуваннях, поки хаб лишався змонтованим.
  const show =
    env !== null &&
    shouldShowIosInstallHint({
      enabled,
      ...env,
      dismissed: env.dismissed || dismissedNow,
      inlineShownThisVisit: wasIosInstallHintInlineShown(),
    });

  useEffect(() => {
    if (!show) return;
    if (safeReadStringSS(STORAGE_KEYS.IOS_INSTALL_HINT_PROMPTED) === "1") {
      return;
    }
    safeWriteSS(STORAGE_KEYS.IOS_INSTALL_HINT_PROMPTED, "1");
    trackEvent(ANALYTICS_EVENTS.PWA_INSTALL_PROMPTED, { surface: "ios" });
  }, [show]);

  const dismiss = useCallback(() => {
    safeWriteLS(STORAGE_KEYS.IOS_INSTALL_HINT_DISMISSED, "1");
    setDismissedNow(true);
    trackEvent(ANALYTICS_EVENTS.PWA_INSTALL_DISMISSED, {
      surface: "ios",
      via: "banner",
    });
  }, []);

  const notification = useMemo<HubNotification | null>(
    () =>
      show
        ? {
            id: "ios-install",
            icon: "download",
            title: copy.title,
            description: copy.body,
            actionLabel: copy.bellAction,
            onAction: dismiss,
          }
        : null,
    [show, dismiss],
  );

  return { notification };
}
