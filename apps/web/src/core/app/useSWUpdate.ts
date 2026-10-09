import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@shared/hooks/useToast";
import { isHubStreaming } from "../hub/streamingStore";
import { hasMutationsInFlight } from "./updateGate";
import {
  PWA_RELOAD_DEFERRED_EVENT,
  markLocalUpdateRequested,
  reloadOnce,
  reloadUnlessBlocked,
  type ReloadDeferredDetail,
} from "./swReload";

declare global {
  interface Window {
    __pwaUpdateSW?: (reloadPage?: boolean) => void;
    __pwaUpdateReady?: boolean;
  }
}

/**
 * Maximum time (ms) we will defer showing the PWA update-prompt even
 * if Hub streaming or mutations are still in-flight. After this wall-
 * clock deadline the prompt is shown unconditionally so the app can
 * never be "bricked" by a stuck streaming flag (R5 mitigation).
 */
const HARD_SHOW_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

/**
 * How often we poll to see whether Hub has gone idle after an update
 * was detected but deferred.
 */
const IDLE_POLL_INTERVAL_MS = 1_000; // 1 second

/**
 * Скільки чекаємо `controllerchange` після `SKIP_WAITING`, перш ніж показати
 * статус-тост. Нормальна активація — 1.3-1.6 с; довше означає, що старий
 * воркер тримають (rel-14: до 5 хв lame-duck).
 */
const CONTROLLER_CHANGE_TIMEOUT_MS = 3_000;

export function useSWUpdate() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [updateAvailable, setUpdateAvailable] = useState(
    () => typeof window !== "undefined" && Boolean(window.__pwaUpdateReady),
  );

  // Tracks whether we have already shown (or are about to show) the
  // update toast so we never fire it twice.
  const toastShownRef = useRef(false);

  // When an update is detected but deferred (Hub busy), this holds the
  // wall-clock timestamp at which the update was first detected. Used to
  // enforce the hard 10-minute show deadline.
  const updateDetectedAtRef = useRef<number | null>(null);

  // Refs forwarded into effects so callbacks are always up-to-date
  // without re-registering event listeners on every render.
  const toastRef = useRef(toast);
  const queryClientRef = useRef(queryClient);
  useEffect(() => {
    toastRef.current = toast;
    queryClientRef.current = queryClient;
  }, [toast, queryClient]);

  /**
   * Застосувати оновлення.
   *
   * `updateSW()` з `virtual:pwa-register` зводиться до
   * `wb.messageSkipWaiting()`, а той шле `SKIP_WAITING` ЛИШЕ за наявності
   * `registration.waiting`. Плашку піднімає ще й build-id hard-floor
   * (`autoUpdate.ts`) — він спрацьовує саме тоді, коли waiting-воркера немає
   * (стара вкладка проти вже нового сервера). На тому шляху клік не робив
   * рівно нічого, тому: waiting-воркера не видно — перезавантажуємось
   * напряму.
   *
   * Якщо waiting є (rel-14): reload більше НЕ віддаємо на милість
   * `vite-plugin-pwa` (його `controlling` перезавантажує лише за `isUpdate`,
   * тож у першій сесії, де SW встановився під час цього ж завантаження,
   * reload не наставав). Підписуємось одноразово на `controllerchange` і
   * перезавантажуємо самі, один раз (`reloadOnce`). Якщо за 3 с
   * `controllerchange` не прийшов — не мовчимо, а показуємо статус-тост з
   * ручним «Перезавантажити». Слухач лишається, щоб пізня активація не
   * загубилась, але reload на ній іде через `reloadUnlessBlocked`: до того
   * часу користувач міг відкрити форму, і пізня активація не має її стерти —
   * тоді замість reload з'являється тост «Оновлення готове» з ручною кнопкою.
   */
  const pendingApplyRef = useRef(false);
  const applyUpdate = useCallback(() => {
    const updateSW = window.__pwaUpdateSW;
    if (typeof updateSW !== "function") {
      reloadOnce();
      return;
    }
    // Лише вкладка, що ініціювала оновлення, має право на reload
    // (`onNeedReload` у main.tsx читає цей прапорець).
    markLocalUpdateRequested();
    void (async () => {
      let hasWaiting = false;
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        hasWaiting = Boolean(registration?.waiting);
      } catch {
        // Реєстрацію не прочитати (privacy-режим, SW недоступний) — падаємо
        // у reload-гілку: вона гірша лише зайвим мережевим запитом.
        hasWaiting = false;
      }
      if (!hasWaiting) {
        updateSW(true);
        reloadOnce();
        return;
      }
      const sw = navigator.serviceWorker;
      if (pendingApplyRef.current) {
        // Повторний клік — слухач і таймер уже чекають; SKIP_WAITING
        // ідемпотентний, повторюємо лише його.
        updateSW(true);
        return;
      }
      pendingApplyRef.current = true;
      let timerId: ReturnType<typeof setTimeout> | null = null;
      const onControllerChange = () => {
        sw.removeEventListener("controllerchange", onControllerChange);
        if (timerId !== null) clearTimeout(timerId);
        timerId = null;
        pendingApplyRef.current = false;
        reloadUnlessBlocked(window, () =>
          hasMutationsInFlight(() => queryClientRef.current.getMutationCache()),
        );
      };
      sw.addEventListener("controllerchange", onControllerChange);
      timerId = setTimeout(() => {
        timerId = null;
        toastRef.current.info("Застосовую оновлення…", null, {
          label: "Перезавантажити",
          onClick: () => reloadOnce(),
          dismissLabel: "Закрити",
        });
      }, CONTROLLER_CHANGE_TIMEOUT_MS);
      updateSW(true);
    })();
  }, []);

  // Stored in a ref so the poll interval can reference the latest version
  // without re-subscribing.
  const applyUpdateRef = useRef(applyUpdate);
  useEffect(() => {
    applyUpdateRef.current = applyUpdate;
  }, [applyUpdate]);

  useEffect(() => {
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let hardTimeoutId: ReturnType<typeof setTimeout> | null = null;

    function showUpdateToast() {
      if (toastShownRef.current) return;
      toastShownRef.current = true;

      // Clean up deferral timers — we are showing now.
      if (pollIntervalId !== null) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
      if (hardTimeoutId !== null) {
        clearTimeout(hardTimeoutId);
        hardTimeoutId = null;
      }

      toastRef.current.info("Доступна нова версія", null, {
        label: "Оновити",
        onClick: applyUpdateRef.current,
        dismissLabel: "Пізніше",
      });
    }

    /**
     * Attempt to show the update toast. If Hub is streaming or mutations
     * are in-flight, schedule a polling interval to retry every second.
     * A hard 10-minute timeout ensures the prompt is eventually shown
     * regardless of Hub activity (R5 mitigation).
     */
    function scheduleOrShowUpdateToast() {
      if (toastShownRef.current) return;

      const detectedAt = (updateDetectedAtRef.current ??= Date.now());
      const msSinceDetected = Date.now() - detectedAt;

      const isBusy =
        isHubStreaming() ||
        hasMutationsInFlight(() => queryClientRef.current.getMutationCache());

      if (!isBusy || msSinceDetected >= HARD_SHOW_TIMEOUT_MS) {
        // Either Hub is idle, or we have waited long enough — show now.
        showUpdateToast();
        return;
      }

      // Hub is busy. Start polling if we haven't already.
      if (pollIntervalId === null) {
        pollIntervalId = setInterval(() => {
          if (toastShownRef.current) {
            const intervalId = pollIntervalId;
            if (intervalId !== null) {
              clearInterval(intervalId);
            }
            pollIntervalId = null;
            return;
          }
          const elapsed =
            Date.now() - (updateDetectedAtRef.current ?? Date.now());
          const stillBusy =
            isHubStreaming() ||
            hasMutationsInFlight(() =>
              queryClientRef.current.getMutationCache(),
            );

          if (!stillBusy || elapsed >= HARD_SHOW_TIMEOUT_MS) {
            showUpdateToast();
          }
        }, IDLE_POLL_INTERVAL_MS);
      }

      // Hard-timeout failsafe (R5): force-show after 10 minutes.
      if (hardTimeoutId === null) {
        const remaining = HARD_SHOW_TIMEOUT_MS - msSinceDetected;
        hardTimeoutId = setTimeout(
          () => {
            hardTimeoutId = null;
            showUpdateToast();
          },
          Math.max(0, remaining),
        );
      }
    }

    const onUpdate = () => {
      setUpdateAvailable(true);
      scheduleOrShowUpdateToast();
    };

    // data-45: reload відкладено — або оновлення прийняли в ІНШІЙ вкладці,
    // або в цій є незбережений ввід (пізня активація). Мовчазний reload тут
    // знищував би форми, тому лише повідомляємо. `controllerchange` з
    // `applyUpdate` і `onNeedReload` з vite-plugin-pwa спрацьовують разом, тож
    // тост на кожну причину — один.
    const deferredShown = new Set<string>();
    const onReloadDeferred = (event: Event) => {
      const reason =
        (event as CustomEvent<ReloadDeferredDetail | undefined>).detail
          ?.reason ?? "other-tab";
      if (deferredShown.has(reason)) return;
      deferredShown.add(reason);
      toastRef.current.info(
        reason === "unsaved-input"
          ? "Оновлення готове. Перезавантаж, коли збережеш введене"
          : "Застосунок оновлено в іншій вкладці. Перезавантаж, коли будеш готовий",
        null,
        {
          label: "Перезавантажити",
          onClick: () => reloadOnce(),
          dismissLabel: "Пізніше",
        },
      );
    };

    const onOffline = () => {
      toastRef.current.info("Застосунок готовий до роботи офлайн", 4000);
    };

    if (window.__pwaUpdateReady) {
      scheduleOrShowUpdateToast();
    }

    window.addEventListener("pwa-update-ready", onUpdate);
    window.addEventListener("pwa-offline-ready", onOffline);
    window.addEventListener(PWA_RELOAD_DEFERRED_EVENT, onReloadDeferred);

    return () => {
      window.removeEventListener("pwa-update-ready", onUpdate);
      window.removeEventListener("pwa-offline-ready", onOffline);
      window.removeEventListener(PWA_RELOAD_DEFERRED_EVENT, onReloadDeferred);
      if (pollIntervalId !== null) clearInterval(pollIntervalId);
      if (hardTimeoutId !== null) clearTimeout(hardTimeoutId);
    };
  }, []);
  // Intentionally empty deps: the effect installs once at mount and all
  // dynamic values (toast, queryClient, applyUpdate) are forwarded via
  // refs to avoid re-registering the event listeners on every render.

  return { updateAvailable, applyUpdate };
}
