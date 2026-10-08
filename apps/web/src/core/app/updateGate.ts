import { isHubStreaming } from "../hub/streamingStore";
import { hasDirtyState } from "@shared/lib/ui/dirtyState";

/** Returns true when there are any mutations currently running. */
export function hasMutationsInFlight(
  getMutationCache: () => { getAll(): Array<{ state: { status: string } }> },
): boolean {
  return getMutationCache()
    .getAll()
    .some((m) => m.state.status === "pending");
}

/**
 * Чи можна ПРИМУСОВО перезавантажити сторінку під оновлення SW (тихий
 * idle-reload у `autoUpdate.ts`).
 *
 * `true` — не можна: триває стрім HubChat, є мутації в польоті або відкрита
 * форма / непорожній композер (реєстр `dirtyState`). Тоді waiting-SW чекає
 * ручного тоста «Доступна нова версія» (Шар 1). `isMutating` приходить ззовні,
 * бо `QueryClient` живе в `main.tsx`, а не в цьому модулі.
 */
export function isForcedReloadBlocked(isMutating?: () => boolean): boolean {
  return isHubStreaming() || hasDirtyState() || Boolean(isMutating?.());
}
