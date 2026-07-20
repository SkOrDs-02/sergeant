import { useSyncExternalStore } from "react";
import { subscribeAiTier, getLastAiTier, type AiTier } from "./aiTierBus";

function subscribe(onStoreChange: () => void): () => void {
  return subscribeAiTier(() => onStoreChange());
}

/** Reactive last-seen Pro tier (`premium` | `standard` | `floor`), or `null` before the first chat/coach response. */
export function useAiTier(): AiTier | null {
  return useSyncExternalStore(subscribe, getLastAiTier, () => null);
}
