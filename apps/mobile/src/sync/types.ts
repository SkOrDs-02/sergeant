/**
 * Shared types for the mobile cloud-sync subsystem. Mirrors
 * `apps/web/src/core/cloudSync/types.ts` 1:1 so both client codebases
 * speak the same vocabulary when talking to the server's
 * `/api/v1/sync/*` endpoints (payload shapes are identical).
 */

export type SyncState =
  | "idle"
  | "dirty"
  | "queued"
  | "syncing"
  | "success"
  | "error";

export interface SyncError {
  message: string;
  type: "network" | "server" | "unknown";
  retryable: boolean;
}

export interface SyncCallbacks {
  onStart(): void;
  onSuccess(when: Date): void;
  onError(message: string): void;
  onErrorRaw?(err: unknown): void;
  onSettled(): void;
}

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
  results?: Record<string, ServerModuleResult>;
}

export interface PullAllModuleBody {
  data?: Record<string, unknown>;
  version?: number;
  serverUpdatedAt?: string;
}

export interface PullAllResponse {
  modules?: Record<string, PullAllModuleBody>;
}

export interface QueuePushEntry {
  type: "push";
  ts: string;
  modules: Record<string, ModulePayload>;
  /**
   * PR #040 — replay attempt counter. Bumps once per `replayOfflineQueue`
   * batch that ultimately threw (after `retryAsync`'s inner exponential-
   * backoff retries already drained). Mirrors web exactly so cross-platform
   * sync diagnostics share the same vocabulary. `undefined` is treated as
   * `0` for backwards compat with entries written by pre-PR-#040 code.
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
 * entry is preserved verbatim; `finalError` carries the message from
 * the last failure, `deadLetteredAt` is the move timestamp.
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
