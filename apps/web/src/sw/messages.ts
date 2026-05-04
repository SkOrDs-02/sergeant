/// <reference lib="WebWorker" />
/**
 * `message` event handler — disambiguates `event.data.type` і
 * делегує у відповідний модуль. Виокремлено з sw.ts (initiative 0001
 * Phase 2 — module decomposition).
 *
 * Усі повідомлення з UI ідуть сюди (`navigator.serviceWorker.controller
 * .postMessage(...)`); відповіді назад робимо через `event.source
 * ?.postMessage(...)` із тим самим `requestId`, щоб клієнтська сторона
 * могла резолвити свій pending Promise.
 */

import { SW_VERSION } from "./version";
import { clearAppCaches } from "./cache";
import { buildSwSnapshot, setDebugEnabled } from "./debug";
import { recordNotified } from "./notifiedKeys";
import {
  setFizrukData,
  setNutritionData,
  setRoutineData,
  startReminderLoop,
} from "./reminders";

declare const self: ServiceWorkerGlobalScope;

export function handleSwMessage(event: ExtendableMessageEvent): void {
  const { type, data } =
    (event.data as { type?: string; data?: unknown }) || {};

  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (type === "SW_SET_DEBUG") {
    setDebugEnabled(
      (data as { enabled?: boolean } | undefined)?.enabled === true,
    );
    return;
  }

  if (type === "SW_DEBUG") {
    const requestId =
      (data as { requestId?: string } | undefined)?.requestId || null;
    event.waitUntil(
      buildSwSnapshot()
        .then((snapshot) => {
          try {
            event.source?.postMessage?.({
              type: "SW_DEBUG_RESULT",
              requestId,
              snapshot,
            });
          } catch {
            /* noop */
          }
        })
        .catch((err) => {
          try {
            event.source?.postMessage?.({
              type: "SW_DEBUG_RESULT",
              requestId,
              snapshot: { ok: false, version: SW_VERSION, error: String(err) },
            });
          } catch {
            /* noop */
          }
        }),
    );
    return;
  }

  if (type === "CLEAR_SW_CACHES") {
    const requestId =
      (data as { requestId?: string } | undefined)?.requestId || null;
    event.waitUntil(
      clearAppCaches()
        .then((result) => {
          try {
            event.source?.postMessage?.({
              type: "CLEAR_SW_CACHES_RESULT",
              requestId,
              result,
            });
          } catch {
            /* noop */
          }
        })
        .catch((err) => {
          try {
            event.source?.postMessage?.({
              type: "CLEAR_SW_CACHES_RESULT",
              requestId,
              result: { ok: false, error: String(err) },
            });
          } catch {
            /* noop */
          }
        }),
    );
    return;
  }

  if (type === "ROUTINE_STATE_UPDATE") {
    setRoutineData(data as Parameters<typeof setRoutineData>[0]);
    startReminderLoop();
    return;
  }

  if (type === "FIZRUK_STATE_UPDATE") {
    setFizrukData(data as Parameters<typeof setFizrukData>[0]);
    startReminderLoop();
    return;
  }

  if (type === "NUTRITION_STATE_UPDATE") {
    setNutritionData(data as Parameters<typeof setNutritionData>[0]);
    startReminderLoop();
    return;
  }

  if (type === "ROUTINE_NOTIFICATION_SENT") {
    const storageKey = (data as { storageKey?: string } | undefined)
      ?.storageKey;
    if (storageKey) recordNotified(storageKey);
  }
}
