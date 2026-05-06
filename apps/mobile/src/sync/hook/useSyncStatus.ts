/**
 * Lightweight read-only hook that feeds `SyncStatusIndicator`.
 *
 * Pre-PR-#052c this hook читало live v1 state — `dirtyModules` map, the
 * MMKV-backed `offlineQueue`, NetInfo-driven online flag — і пушило
 * refresh-events через v1 emitter. Усе те дерево пішло разом із
 * engine-ом у PR #052c (cloudSync v1 cleanup mirror того, що web
 * зробив у PR #052b). Mobile v2 op-log writer-runtime ще не
 * прокинутий у boot path (TODO follow-up; web counterpart —
 * `apps/web/src/core/syncEngine/syncEngineWriter.ts`), тому повертаємо
 * stable idle-shape: `dirtyCount = 0`, `queuedCount = 0`,
 * `isOnline = true`. Це робить `SyncStatusIndicator` рендер у
 * "Синк: on" pill (status === "idle"), що відповідає реальному стану
 * клієнта після ADR-0047 client cut-over (v1 нічого не пушить,
 * v2 capture-ить мутації прямо в SQLite outbox через dual-write
 * адаптери, без UI-counter-ів).
 *
 * Shape лишається такий самий, як у v1, щоб `SyncStatusIndicator.tsx`
 * не довелося міняти. Майбутній mobile v2 writer-runtime cap-ить ці
 * поля з outbox `getStatus()` так само, як web hook читає
 * `runtime.getStatus().pending` — за тією самою сигнатурою.
 */
export interface SyncStatusState {
  dirtyCount: number;
  queuedCount: number;
  isOnline: boolean;
}

const idleSnapshot: SyncStatusState = {
  dirtyCount: 0,
  queuedCount: 0,
  isOnline: true,
};

export function useSyncStatus(): SyncStatusState {
  return idleSnapshot;
}
