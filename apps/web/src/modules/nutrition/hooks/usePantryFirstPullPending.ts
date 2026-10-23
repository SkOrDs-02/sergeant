/**
 * Last validated: 2026-10-22
 * Status: Active
 *
 * «Комора ще чекає на перший pull» (rel-10).
 *
 * AI-CONTEXT: на новому пристрої або щойно залогіненому локальна база порожня
 * до завершення першого pull, і порожня комора з закликом «додай перший
 * продукт» провокує дублікати тих, що вже лежать на сервері. Сигнал не новий:
 * це той самий `hasCompletedInitialPull` (через `isInitialSyncSettled`), що
 * гейтить prefs (data-04). Для анонімного режиму (`local-anon` не синкається)
 * він уже «settled», тож очікування там не виникає.
 *
 * Pull може не завершитись ніколи (офлайн, сервер лежить), тому очікування
 * скінченне: офлайн не чекаємо зовсім, інакше стеля `PANTRY_FIRST_PULL_WAIT_MS`.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getInitialPullVersion,
  subscribeInitialPull,
} from "../../../core/syncEngine/initialPullState.js";
import { isInitialSyncSettled } from "../lib/nutritionStorage";

/** Скільки найдовше показувати «синхронізую», перш ніж повернути порожній стан. */
export const PANTRY_FIRST_PULL_WAIT_MS = 10_000;

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Перерендер на `online`/`offline`: перехід в офлайн одразу знімає очікування. */
function subscribeConnectivity(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * `true`, поки порожню комору слід показувати як «синхронізую». Викликач
 * сам перевіряє, що комора порожня: непорожня комора ніколи не ховається.
 */
export function usePantryFirstPullPending(): boolean {
  useSyncExternalStore(
    subscribeInitialPull,
    getInitialPullVersion,
    getInitialPullVersion,
  );
  const offline = useSyncExternalStore(
    subscribeConnectivity,
    isOffline,
    () => false,
  );
  const [timedOut, setTimedOut] = useState(false);
  const settled = isInitialSyncSettled();

  useEffect(() => {
    if (settled) return;
    const id = setTimeout(() => setTimedOut(true), PANTRY_FIRST_PULL_WAIT_MS);
    return () => clearTimeout(id);
  }, [settled]);

  return !settled && !timedOut && !offline;
}
