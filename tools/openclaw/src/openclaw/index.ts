/**
 * OpenClaw bot module entry-point. Single export — `attachOpenClawHandlers`
 * (caller складає Bot + Anthropic + deps і атачить handler-и).
 *
 * Bootstrap-логіка тут навмисно не міститься: caller (`tools/openclaw/src/index.ts`)
 * вирішує, чи стартувати OpenClaw залежно від `OPENCLAW_BOT_TOKEN`
 * (fail-closed якщо unset).
 */

export { attachOpenClawHandlers } from "./handler.js";
export type { OpenClawBotConfig } from "./handler.js";
export {
  isFounderAllowed,
  isPrivateChat,
  parseFounderTgUserId,
  parseOpenClawRateLimitPerMinute,
} from "./security.js";
export { OpenClawSessionStore } from "./session.js";
