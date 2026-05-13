/**
 * OpenClaw DM bot handler entry-point (ADR-0031).
 *
 * Boundary semantics (fail-closed):
 *   1) DM-only: ignore non-private chats silently (no auto-leave; bot не
 *      повинен deceive-нути founder-а ніби спілкується у групі).
 *   2) Allowlist: тільки `OPENCLAW_FOUNDER_TG_USER_ID`. Інший user → reply
 *      "Access denied." без жодного routing-у.
 *   3) Budget: pre-call check `/api/internal/openclaw/budget`. Якщо
 *      `allowed=false` → reply про exceeded і exit (audit-log status =
 *      'budget_exceeded'). Жодного Claude-call-у не робиться.
 *   4) Iteration cap: винесений у agent-loop через `maxIterations`.
 *   5) Audit: invocation відкрита перед AI-call-ом, finalized після;
 *      навіть failed paths мають `finalize` з відповідним status-ом.
 *
 * PR-36 split — this orchestrator wires together four sibling modules
 * so each concern is independently testable:
 *   - `handler-constants.ts` — pure constants/types/helpers
 *   - `handler-audit.ts`     — write-audit logger + approval card +
 *                              executor for `/api/internal/openclaw/write/*`
 *   - `handler-agent-turn.ts` — `runAgentTurn` factory (single LLM turn)
 *   - `handler-commands.ts`  — `/command` + message + callback registrations
 */

import { ApprovalStore } from "./approval-store.js";
import { FixedWindowRateLimiter } from "../security.js";
import { parseOpenClawRateLimitPerMinute } from "./security.js";
import { OpenClawSessionStore } from "./session.js";
import {
  parseCouncilUsdBudget,
  type OpenClawBotConfig,
} from "./handler-constants.js";
import {
  createAuditLogger,
  createWriteToolExecutor,
  postApprovalCard,
} from "./handler-audit.js";
import { createAgentTurnRunner } from "./handler-agent-turn.js";
import { registerOpenClawCommands } from "./handler-commands.js";

// Re-exports so existing call-sites and tests keep working without
// touching imports. `parse-mode-guard.test.ts` (PR #1568 regression
// guard) imports `HELP_TEXT` from `./handler.js`.
export { HELP_TEXT } from "./handler-constants.js";
export type { OpenClawBotConfig } from "./handler-constants.js";

/**
 * Прикріплює handler-и до OpenClaw bot-у. Caller відповідає за `bot.start()`.
 *
 * `bot` лишається параметром (а не `bot.start()` всередині), щоб caller міг
 * запускати декілька bot-ів у `Promise.all` — стандартний grammy-pattern
 * для multi-bot процесів.
 */
export function attachOpenClawHandlers(config: OpenClawBotConfig): {
  sessions: OpenClawSessionStore;
  rateLimiter: FixedWindowRateLimiter;
} {
  const {
    bot,
    anthropic,
    serverUrl,
    internalApiKey,
    founderUserId,
    maxIterations,
  } = config;

  const sessions = new OpenClawSessionStore();
  const rateLimiter = new FixedWindowRateLimiter(
    parseOpenClawRateLimitPerMinute(process.env["OPENCLAW_RATE_LIMIT_PER_MIN"]),
  );
  const councilUsdBudget = parseCouncilUsdBudget(
    process.env["OPENCLAW_COUNCIL_USD_BUDGET"],
  );

  // ADR-0036 (Phase 4): single approval-store shared across all agent
  // turns in this process. Per-turn `PendingApprovalsCollector` is
  // created inside `runAgentTurn` and drained afterwards.
  const approvalStore = new ApprovalStore();

  // ADR-0037 (Phase 4.5): write-audit logger + write-tool executor
  // are built once here and shared between `runAgentTurn` (drains
  // pending approvals) and the `callback_query` handler (resolves
  // them on Approve / Reject).
  const logWriteAudit = createAuditLogger(serverUrl, internalApiKey);
  const executeApprovedWriteTool = createWriteToolExecutor(
    serverUrl,
    internalApiKey,
  );

  const runAgentTurn = createAgentTurnRunner({
    anthropic,
    serverUrl,
    internalApiKey,
    founderUserId,
    maxIterations,
    sessions,
    approvalStore,
    postApprovalCard,
  });

  registerOpenClawCommands({
    bot,
    serverUrl,
    internalApiKey,
    founderUserId,
    maxIterations,
    rateLimiter,
    sessions,
    approvalStore,
    councilUsdBudget,
    runAgentTurn,
    executeApprovedWriteTool,
    logWriteAudit,
  });

  return { sessions, rateLimiter };
}
