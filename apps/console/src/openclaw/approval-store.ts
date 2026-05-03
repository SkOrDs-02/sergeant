/**
 * Approval store for OpenClaw write-tools (Phase 4, ADR-0036).
 *
 * Lifecycle:
 *   1. LLM emits a write-tool call (`commit_to_strategy_doc`, etc).
 *   2. `createOpenClawToolExecutor` intercepts → `approvalStore.create(...)`.
 *   3. Handler reads `pendingCollector.drain()` after the agent turn finishes
 *      and posts an inline-keyboard message with `oc:approve:<id>` /
 *      `oc:reject:<id>` callbacks.
 *   4. On callback, handler resolves through the store (`get()` →
 *      `markExecuted()` / `markRejected()`), then calls the corresponding
 *      `/api/internal/openclaw/write/*` endpoint if approved.
 *
 * The store is **in-memory** intentionally. Approvals are short-lived
 * (≤10 min by default); persisting them to DB would couple console restart
 * to a DB migration without operational benefit (a stale approval after a
 * restart is best discarded — the founder reissues the request).
 *
 * Concurrency: Node single-threaded; we don't need locks. `gc()` is
 * idempotent and called on every operation — no separate timer needed.
 */

import { randomUUID } from "node:crypto";

export type WriteToolName =
  | "commit_to_strategy_doc"
  | "create_github_issue"
  | "post_to_topic"
  | "pause_workflow"
  | "mute_alert";

export const WRITE_TOOL_NAMES: ReadonlySet<WriteToolName> = new Set([
  "commit_to_strategy_doc",
  "create_github_issue",
  "post_to_topic",
  "pause_workflow",
  "mute_alert",
]);

export function isWriteToolName(name: string): name is WriteToolName {
  return WRITE_TOOL_NAMES.has(name as WriteToolName);
}

export type ApprovalStatus = "pending" | "executed" | "rejected" | "expired";

export interface ApprovalRecord {
  /** Short id used in callback_data (≤64 bytes per Telegram). */
  id: string;
  tool: WriteToolName;
  /** Sanitized input — what we'll send to the server endpoint. */
  input: Record<string, unknown>;
  founderUserId: string;
  /** TG-user-id of the requester (used to prevent unrelated chats acting). */
  founderTgUserId: number;
  /** Optional invocation id (audit-log linkage). */
  invocationId?: number;
  createdAt: number;
  expiresAt: number;
  status: ApprovalStatus;
}

export interface ApprovalCreateInput {
  tool: WriteToolName;
  input: Record<string, unknown>;
  founderUserId: string;
  founderTgUserId: number;
  invocationId?: number;
}

export interface ApprovalStoreOptions {
  /** TTL in ms; default 10 min. */
  ttlMs?: number;
  /** Override clock (tests). */
  now?: () => number;
  /** Override id generator (tests). */
  idGen?: () => string;
}

const DEFAULT_TTL_MS = 10 * 60_000;

export class ApprovalStore {
  private readonly map = new Map<string, ApprovalRecord>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly idGen: () => string;

  constructor(opts: ApprovalStoreOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.now = opts.now ?? Date.now;
    this.idGen = opts.idGen ?? (() => randomUUID().slice(0, 8));
  }

  create(input: ApprovalCreateInput): ApprovalRecord {
    this.gc();
    const t = this.now();
    const record: ApprovalRecord = {
      id: this.idGen(),
      tool: input.tool,
      input: input.input,
      founderUserId: input.founderUserId,
      founderTgUserId: input.founderTgUserId,
      invocationId: input.invocationId,
      createdAt: t,
      expiresAt: t + this.ttlMs,
      status: "pending",
    };
    this.map.set(record.id, record);
    return record;
  }

  /**
   * Returns the record if present and still pending. Expired or
   * non-existent ids return `undefined`. Already-executed/rejected
   * records also return `undefined` (callbacks are idempotent —
   * re-clicking a button after action is safely no-op).
   */
  get(id: string): ApprovalRecord | undefined {
    this.gc();
    const r = this.map.get(id);
    if (!r) return undefined;
    if (r.status !== "pending") return undefined;
    if (r.expiresAt <= this.now()) return undefined;
    return r;
  }

  markExecuted(id: string): ApprovalRecord | undefined {
    const r = this.get(id);
    if (!r) return undefined;
    r.status = "executed";
    return r;
  }

  markRejected(id: string): ApprovalRecord | undefined {
    const r = this.get(id);
    if (!r) return undefined;
    r.status = "rejected";
    return r;
  }

  /**
   * Remove all expired or final-state records. Called automatically
   * before each public op; exposed for tests / explicit cleanup.
   */
  gc(): void {
    const t = this.now();
    for (const [id, r] of this.map) {
      if (r.expiresAt <= t || r.status !== "pending") {
        this.map.delete(id);
      }
    }
  }

  /** Number of currently-pending records (debug / metrics only). */
  pendingCount(): number {
    this.gc();
    return this.map.size;
  }
}

/**
 * Per-turn collector — handler passes it to the agent executor; the
 * executor pushes into it on every write-tool call so the handler can
 * drain it after the turn finishes and post buttons.
 *
 * Separated from the persistent `ApprovalStore` because:
 *   - We don't want stale records from earlier turns leaking into the
 *     current turn's button-render loop.
 *   - `ApprovalStore` is process-wide; this is per-turn-scoped.
 */
export class PendingApprovalsCollector {
  private items: ApprovalRecord[] = [];

  add(record: ApprovalRecord): void {
    this.items.push(record);
  }

  drain(): ApprovalRecord[] {
    const out = this.items;
    this.items = [];
    return out;
  }

  size(): number {
    return this.items.length;
  }
}
