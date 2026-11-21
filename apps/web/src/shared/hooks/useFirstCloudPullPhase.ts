/**
 * Last validated: 2026-11-21
 * Status: Active
 *
 * Фаза першого pull для порожніх станів модулів (data-59/60).
 *
 * AI-CONTEXT: одне джерело для всіх модулів: фазу веде sync-reader
 * (`syncEngineReader.ts` → `initialPullState.ts`), а цей хук лише підписує
 * React. `initialPullState.ts` без імпортів, тож хук не тягне sync-рушій у
 * чанк споживача.
 */
import { useSyncExternalStore } from "react";
import {
  getFirstPullPhase,
  subscribeInitialPull,
  type FirstPullPhase,
} from "../../core/syncEngine/initialPullState";

export type { FirstPullPhase };

function getServerPhase(): FirstPullPhase {
  return "idle";
}

/** `idle` — показуй звичайний порожній стан; `loading` / `failed` — ні. */
export function useFirstCloudPullPhase(): FirstPullPhase {
  return useSyncExternalStore(
    subscribeInitialPull,
    getFirstPullPhase,
    getServerPhase,
  );
}
