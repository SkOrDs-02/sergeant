import type { ModuleName } from "./config";

/**
 * Explicit state machine for the cloud-sync lifecycle. Historically the
 * hook exposed a handful of booleans (`syncing`, `syncError`, …) that had
 * to be read together to reason about what the sync subsystem was doing.
 * A single `SyncState` value makes transitions auditable and avoids the
 * "two bools disagree" class of bugs. The legacy booleans are kept as
 * derived getters on the hook return value so existing consumers compile
 * unchanged.
 *
 * Transitions (intent):
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
 * Normalized error shape exposed to the UI and debug hook. Engines emit raw
 * errors (typically `ApiError` from the transport layer) and the lifecycle
 * layer maps them into this shape via `toSyncError`.
 *
 * `retryable` is `true` for transport failures (network) and 5xx HTTP
 * statuses; it is `false` for 4xx (auth / validation) and `parse` errors,
 * so callers never loop on an unrecoverable state.
 */
export interface SyncError {
  message: string;
  type: "network" | "server" | "unknown";
  retryable: boolean;
}

/**
 * Lifecycle callbacks every engine entry point (pushDirty, pushAll,
 * pullAll, initialSync, uploadLocalData) accepts. The React hook owns
 * the implementations via `useSyncCallbacks`; engines only invoke them.
 *
 * `onError` keeps its historical single-argument string shape so existing
 * engines and tests compile and match unchanged. The optional
 * `onErrorRaw` sidecar is invoked immediately before `onError` by the
 * engines and carries the original thrown value so the lifecycle layer
 * can classify it (network vs. 5xx vs. unknown) without parsing message
 * text. Consumers that don't care about structured errors (e.g. unit
 * tests that mock only `onError`) can simply leave `onErrorRaw`
 * undefined — engines invoke it via optional chaining.
 */
export interface SyncCallbacks {
  onStart(): void;
  onSuccess(when: Date): void;
  onError(message: string): void;
  onErrorRaw?(err: unknown): void;
  onSettled(): void;
}

/**
 * Base args bag passed into engine entry points. Engines that need extra
 * callbacks (e.g. `onNeedMigration`, `onMigrated`) intersect with this.
 */
export interface EngineArgs extends SyncCallbacks {
  user: CurrentUser | null | undefined;
}

export interface ModulePayload {
  data: Record<string, unknown>;
  clientUpdatedAt: string;
}

export interface ServerModuleResult {
  version?: number;
  conflict?: boolean;
  error?: string;
  ok?: boolean;
}

export interface PushAllResponse {
  results?: Partial<Record<ModuleName | string, ServerModuleResult>>;
}

export interface PullAllModuleBody {
  data?: Record<string, unknown>;
  version?: number;
  serverUpdatedAt?: string;
}

export interface PullAllResponse {
  modules?: Partial<Record<ModuleName | string, PullAllModuleBody>>;
}

export interface QueuePushEntry {
  type: "push";
  ts: string;
  modules: Record<string, ModulePayload>;
  /**
   * PR #040 — replay attempt counter. Counts batches the entry has
   * been part of where `replayOfflineQueue` ultimately threw (after
   * `retryAsync`'s inner exponential-backoff retries already drained).
   * Old entries written by pre-PR-#040 code paths come back as
   * `undefined`, which is treated as `0`.
   */
  attemptCount?: number;
  /** Last error message seen on a failed replay batch, for debug only. */
  lastError?: string;
  /** ISO timestamp of the last failed replay attempt for this entry. */
  lastAttemptAt?: string;
}

export type QueueEntry = QueuePushEntry;

/**
 * Dead-letter store entry — produced when a `QueuePushEntry` exceeds
 * `MAX_QUEUE_ATTEMPTS` consecutive failed replay batches. The original
 * entry is preserved verbatim so a future manual replay can re-enqueue
 * it. `finalError` carries the message from the last failure for
 * debugging; `deadLetteredAt` is when the move happened.
 */
export interface DeadLetterEntry {
  type: "dead-letter";
  entry: QueuePushEntry;
  finalError: string;
  deadLetteredAt: string;
}

export interface CurrentUser {
  id?: string;
}
