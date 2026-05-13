/**
 * Orchestrator for the OpenClaw bot listener registration (PR-36).
 *
 * `registerOpenClawCommands(deps)` is the single public entry-point
 * imported by `handler.ts`. It owns:
 *
 *   • the shared rejection logger (`createRejectionLogger`) — rate-
 *     limited per `(user, chat_type, reason)` so spam updates from a
 *     non-DM chat or a non-founder cannot drown the journal;
 *   • the shared `isAllowedDmContext` gate — DM-only + founder
 *     allowlist — that every per-domain registrar reuses through the
 *     `HandlerContext` it receives;
 *   • dispatching to the four per-domain registrars:
 *       - `registerInfoCommands` (`/start`, `/help`, `/reset`,
 *         `/budget`, `/decisions`, `/audit`, `/alerts`)
 *       - `registerAgentCommands` (`DISPATCHER_COMMANDS`,
 *         `COMMAND_PROMPTS`, `PERSONA_COMMANDS`,
 *         `STRATEGIC_MODE_COMMANDS`, `/council`)
 *       - `registerCallbackHandlers` (`callback_query:data`)
 *       - `registerEventHandlers` (`message:text` + `bot.catch`)
 *
 * The orchestrator has no module-level mutable state of its own; every
 * stateful value (rate limiter, sessions, approval store, agent-turn
 * runner, audit logger) is passed in via `RegisterCommandsDeps`. The
 * `HandlerContext` adds the runtime-built `isAllowedDmContext`
 * function — sub-registrars accept the wider type so they do not have
 * to rebuild the rejection logger themselves.
 */

import type { Context } from "grammy";
import { isFounderAllowed, isPrivateChat } from "./security.js";
import { registerInfoCommands } from "./handler-info-commands.js";
import { registerAgentCommands } from "./handler-agent-commands.js";
import { registerCallbackHandlers } from "./handler-callbacks.js";
import { registerEventHandlers } from "./handler-events.js";
import type {
  HandlerContext,
  RegisterCommandsDeps,
} from "./handler-context.js";

export type { RegisterCommandsDeps } from "./handler-context.js";

/**
 * Diagnostic warn-log on silent rejection. Без цього оператор бачить лише
 * "/help мовчить" і має гадати між (a) webhook-race, (b) DM-only check,
 * (c) `OPENCLAW_FOUNDER_TG_USER_ID` mismatch, (d) bot crashed mid-handler.
 *
 * Rate-limit per (user, chat_type, reason) tuple щоб флуд від групи з
 * багатьма юзерами / botом, який зациклився на одному /команді, не
 * поховав журнал.
 */
function createRejectionLogger(): (reason: string, ctx: Context) => void {
  const recentRejectionLogs = new Map<string, number>();
  const REJECTION_LOG_TTL_MS = 60_000;
  return (reason, ctx) => {
    const userId = ctx.from?.id ?? 0;
    const chatType = ctx.chat?.type ?? "unknown";
    const message = ctx.message;
    const text =
      message && "text" in message && typeof message.text === "string"
        ? message.text
        : "";
    const firstToken = text.split(/\s+/)[0] ?? "";
    const key = `${userId}|${chatType}|${reason}`;
    const now = Date.now();
    const last = recentRejectionLogs.get(key);
    if (last !== undefined && now - last < REJECTION_LOG_TTL_MS) return;
    recentRejectionLogs.set(key, now);
    console.warn(
      `[openclaw] silently rejected update: reason=${reason} ` +
        `chat_type=${chatType} from_user_id=${userId} ` +
        `command=${firstToken || "<non-command>"} ` +
        `(check OPENCLAW_FOUNDER_TG_USER_ID + ensure DM)`,
    );
  };
}

/**
 * Mount every OpenClaw bot listener (commands + message + callback
 * + catch). Caller still owns `bot.start()`; this only attaches.
 */
export function registerOpenClawCommands(deps: RegisterCommandsDeps): void {
  const logRejection = createRejectionLogger();

  const isAllowedDmContext = (ctx: Context): boolean => {
    if (!isPrivateChat(ctx.chat?.type)) {
      logRejection("non-private-chat", ctx);
      return false;
    }
    if (!isFounderAllowed(ctx.from?.id, process.env)) {
      logRejection("non-founder", ctx);
      return false;
    }
    return true;
  };

  const context: HandlerContext = { ...deps, isAllowedDmContext };

  registerInfoCommands(context);
  registerAgentCommands(context);
  registerCallbackHandlers(context);
  registerEventHandlers(context);
}
