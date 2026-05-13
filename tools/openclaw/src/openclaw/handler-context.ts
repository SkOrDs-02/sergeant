/**
 * Shared dependency-bundle for the `registerOpenClawCommands` orchestrator
 * (`handler-commands.ts`) and every per-domain `registerXxx` registrar
 * (`handler-info-commands.ts`, `handler-agent-commands.ts`,
 * `handler-callbacks.ts`, `handler-events.ts`).
 *
 * `RegisterCommandsDeps` stays the public API consumed by `handler.ts`.
 * `HandlerContext` is the internal expansion the orchestrator hands to
 * each sub-registrar — adds the rejection-logger-backed
 * `isAllowedDmContext` gate so sub-modules do not have to rebuild it.
 */

import type { Bot, Context } from "grammy";
import type { FixedWindowRateLimiter } from "../security.js";
import type { ApprovalStore, ApprovalRecord } from "./approval-store.js";
import type { OpenClawSessionStore } from "./session.js";
import type { AgentTurnRunner } from "./handler-agent-turn.js";
import type { WriteAuditLogBody } from "./handler-constants.js";

export interface RegisterCommandsDeps {
  bot: Bot;
  serverUrl: string;
  internalApiKey: string;
  founderUserId: string;
  maxIterations: number;
  rateLimiter: FixedWindowRateLimiter;
  sessions: OpenClawSessionStore;
  approvalStore: ApprovalStore;
  councilUsdBudget: number;
  runAgentTurn: AgentTurnRunner;
  executeApprovedWriteTool: (
    record: ApprovalRecord,
  ) => Promise<{ ok: boolean; status: number; bodyText: string }>;
  logWriteAudit: (body: WriteAuditLogBody) => Promise<void>;
}

export interface HandlerContext extends RegisterCommandsDeps {
  /**
   * DM-only + founder-allowlist gate. Logs a rate-limited rejection
   * warning whenever it returns `false` so the operator sees why a
   * given update was dropped (non-DM, non-founder).
   */
  isAllowedDmContext: (ctx: Context) => boolean;
}
