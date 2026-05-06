/**
 * Cloud-sync types — лишилися лише ті, що потрібні `useCloudSync` stub
 * (PR #052a → ADR-0047) і `useSyncErrorToast` (UI-toast не зник, бо
 * v2 op-log writer теж може кидати помилки і вони адаптуються в цей
 * shape перед прокидом у toast).
 *
 * Решта типів (`SyncCallbacks`, `EngineArgs`, `ModulePayload`,
 * `ServerModuleResult`, `PushAllResponse`, `PullAllModuleBody`,
 * `PullAllResponse`, `QueuePushEntry`, `DeadLetterEntry`) обслуговували
 * v1 engine + offline-queue + dead-letter mover і пішли разом із
 * `engine/`, `queue/`, `state/` дерева в PR #052b.
 */

/**
 * Public shape exposed by the (now-stub) `useCloudSync` hook so що
 * `App.tsx` / `useAppEffects.ts` / `OfflineBanner.tsx` продовжували
 * type-check-итись після ADR-0047 client cut-over. Реальні переходи
 * стейт-машини більше не відбуваються — хук завжди повертає `"idle"`.
 *
 * Колишній intent (для history-sanity):
 *   idle   → dirty            (local write marked a module dirty)
 *   dirty  → queued           (offline enqueue before server reached)
 *   *      → syncing          (onStart)
 *   syncing → success         (onSuccess)
 *   syncing → error           (onError)
 *   success|error → idle      (onSettled, if nothing new is queued)
 */
export type SyncState =
  | "idle"
  | "dirty"
  | "queued"
  | "syncing"
  | "success"
  | "error";

/**
 * Normalized error shape exposed to the UI. v2 op-log writer
 * (`apps/web/src/core/syncEngine/syncEngineWriter.ts`) maps its raw
 * fetch failures into this shape before handing them off to the toast
 * surface — `retryable` is `true` for transport / 5xx errors and
 * `false` for 4xx / parse so the CTA branch never loops on an
 * unrecoverable state.
 */
export interface SyncError {
  message: string;
  type: "network" | "server" | "unknown";
  retryable: boolean;
}

export interface CurrentUser {
  id?: string;
}
