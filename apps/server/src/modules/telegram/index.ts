/**
 * Public exports of the Telegram client surface. New OpenClaw tools
 * should import from here (not from `bot-client.ts` directly) so the
 * surface stays auditable.
 */

export {
  createTelegramBotClient,
  TelegramApiError,
  TelegramForbiddenError,
  TelegramRateLimitError,
} from "./bot-client.js";
export type {
  CreateTelegramBotClientOptions,
  GetUpdatesOptions,
  TelegramBotClient,
  TelegramChat,
  TelegramForumTopic,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from "./bot-client.js";
