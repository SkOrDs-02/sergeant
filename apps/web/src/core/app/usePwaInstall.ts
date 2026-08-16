import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { isIOS, isStandalonePWA } from "@shared/lib/platform/iosStandalone";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { trackEvent } from "../observability/analytics";

const PWA_SESSIONS_KEY = "pwa_session_count";
const PWA_DISMISSED_KEY = "pwa_install_dismissed";
/**
 * Прапорець «успішну інсталяцію вже зараховано». Живе в storage самого
 * standalone-контексту, тож переживає перезапуски застосунку і не дає
 * рахувати кожен запуск з домашнього екрана як нову інсталяцію.
 */
const PWA_INSTALL_REPORTED_KEY = "pwa_install_reported";
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
 *
 * **Standalone-детекція (аудит телеметрії 2026-08-16).** `beforeinstallprompt`
 * і `appinstalled` — Chromium-only. У Safari їх немає взагалі, а вся наша база
 * сидить на iOS (кожна подія в Sentry — Mobile Safari / iOS 18.x). Тому
 * success-плече воронки не спрацювало жодного разу: за 30 днів 231 показ
 * `pwa_install_prompted` і НУЛЬ `pwa_installed`. `useIosInstallBanner` обіцяв у
 * коментарі, що успіх зарахує «серверна перевірка display-mode», але такого
 * коду ніколи не існувало.
 *
 * Єдиний сигнал, доступний на iOS, — те, що застосунок узагалі стартував у
 * standalone-режимі: потрапити туди можна виключно через Add to Home Screen.
 * Тому перший запуск у standalone і є подією інсталяції. Сам режим визначає
 * `isStandalonePWA()` за двома сигналами — media-query `display-mode:
 * standalone` і `navigator.standalone`; на iOS спрацьовує саме другий, бо
 * Safari media-query не підтримує. Дедуп — через `PWA_INSTALL_REPORTED_KEY`,
 * інакше кожен запуск з іконки рахувався б знову.
 */
export function usePwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ready, setReady] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const promptedRef = useRef(false);

  // Success-плече воронки для платформ без `appinstalled` (насамперед iOS).
  // Стоїть окремим ефектом і ДО банерної логіки: у standalone-режимі банер не
  // показується взагалі, тож зарахувати інсталяцію більше ніде.
  useEffect(() => {
    if (!isStandalonePWA()) return;
    if (safeReadStringLS(PWA_INSTALL_REPORTED_KEY) === "1") return;
    safeWriteLS(PWA_INSTALL_REPORTED_KEY, "1");
    trackEvent(ANALYTICS_EVENTS.PWA_INSTALLED, {
      surface: isIOS() ? "ios" : "android",
      via: "standalone_detected",
    });
  }, []);

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
      //
      // Той самий прапорець, що й у standalone-гілці: інакше Chromium дав би
      // дві події на одну інсталяцію — `appinstalled` зараз і
      // `standalone_detected` при наступному запуску з іконки.
      if (safeReadStringLS(PWA_INSTALL_REPORTED_KEY) === "1") return;
      safeWriteLS(PWA_INSTALL_REPORTED_KEY, "1");
      trackEvent(ANALYTICS_EVENTS.PWA_INSTALLED, {
        surface: isIOS() ? "ios" : "android",
        via: "appinstalled",
      });
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
