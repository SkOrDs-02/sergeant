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
import { clearAppCaches, setActiveUserKey } from "./cache";
import { buildSwSnapshot, setDebugEnabled } from "./debug";
import { recordNotified } from "./notifiedKeys";
import { fetchDiag } from "./fetchDiag";
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

  if (type === "SW_FETCH_DIAG") {
    // DURABILITY-20261008-BOOT-1: знімок кільцевого буфера для inline-сторожа
    // (`index.html`). Відповідь через MessageChannel-порт: сторож не має
    // listener-а на `navigator.serviceWorker`.
    try {
      const reply = {
        type: "SW_FETCH_DIAG_RESULT",
        snapshot: fetchDiag.snapshot(),
      };
      const port = event.ports?.[0];
      if (port) port.postMessage(reply);
      else event.source?.postMessage?.(reply);
    } catch {
      /* noop */
    }
    return;
  }

  if (type === "CLEAR_SW_CACHES") {
    fetchDiag.mark("clear_caches");
    const requestId =
      (data as { requestId?: string } | undefined)?.requestId || null;
    // rel-12: скоуп за замовчуванням `"user"` — без явного `"all"` precache
    // і ілюстрації вправ не чіпаємо (старий клієнт без `scope` теж сюди).
    const scope =
      (data as { scope?: string } | undefined)?.scope === "all"
        ? "all"
        : "user";
    event.waitUntil(
      clearAppCaches(scope)
        .finally(() => fetchDiag.mark("clear_caches_done"))
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

  if (type === "SW_SET_USER") {
    // Audit 03 / Decision #2 (C) + consolidated C2: per-user cache partition.
    // The opaque Better Auth user id (or `null` on logout) is hashed and used
    // to vary the cache key via `cacheKeyWillBeUsed` in `./cache`. No reply —
    // main thread treats this as fire-and-forget — but `waitUntil` keeps the
    // SW alive until the async hash + key update completes.
    const userKey =
      (data as { userKey?: string | null } | undefined)?.userKey ?? null;
    fetchDiag.mark("set_user");
    event.waitUntil(
      setActiveUserKey(userKey).finally(() => fetchDiag.mark("set_user_done")),
    );
    return;
  }

  // AI-CONTEXT: тут раніше жили `ROUTINE|FIZRUK|NUTRITION_STATE_UPDATE`, які
  // заводили в сервіс-воркері власний ланцюжок `setTimeout` для нагадувань.
  // Він не міг працювати: браузер вбиває неактивний SW за ~30 секунд, а
  // отриманий стан лежав у памʼяті воркера і після перезапуску був порожній.
  // Нагадування тепер шле сервер (`apps/server/src/lib/reminders/`), тож
  // повідомлення прибрані разом із самим циклом.
  if (type === "ROUTINE_NOTIFICATION_SENT") {
    const storageKey = (data as { storageKey?: string } | undefined)
      ?.storageKey;
    if (storageKey) recordNotified(storageKey);
  }
}
