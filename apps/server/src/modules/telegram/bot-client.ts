/**
 * Thin Telegram Bot API client used by server-side OpenClaw tools.
 *
 * Why a dedicated module rather than inline `fetch` calls (PR-35,
 * Pain P8): `read_telegram_topic_history` needs to (a) verify bot
 * access to the ops supergroup and surface forbidden/rate-limit as
 * structured errors instead of crashing the request, (b) optionally
 * fetch recent unread updates via `getUpdates` when the bot runs in
 * webhook mode, (c) stay mockable in Vitest. Existing call-sites that
 * just POST to `sendMessage` (see `modules/openclaw/write-tools.ts ::
 * postToTopic`) still inline `fetch` and live in tech-debt budget; new
 * callers should funnel through this client.
 *
 * Bot API limitations relevant to `read_telegram_topic_history`:
 *   - Bot API has NO `getChatHistory` / topic-message-retrieval method.
 *     `getUpdates` only returns updates the bot hasn't acknowledged
 *     (max ~100, exclusive with webhook mode). Historical retrieval
 *     remains the job of `tg_topic_archive` (migration 047).
 *   - `getChat` validates access. 403 → bot kicked / never joined;
 *     429 → flood-wait imposed by Telegram. Both surface as structured
 *     errors so the caller (LLM tool wrapper) can degrade gracefully
 *     instead of throwing 5xx.
 *
 * Surface kept intentionally small (`getChat`, `getUpdates`,
 * `getForumTopic`). Anything richer (MTProto for true history) is
 * out-of-scope until OPENCLAW_USE_MTPROTO ships.
 */

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  is_forum?: boolean;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  chat: TelegramChat;
  date: number; // unix seconds
  text?: string;
  caption?: string;
  reply_to_message?: { message_id: number };
  is_topic_message?: boolean;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_message?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

export interface TelegramForumTopic {
  message_thread_id: number;
  name: string;
  icon_color: number;
  icon_custom_emoji_id?: string;
}

export interface GetUpdatesOptions {
  offset?: number;
  limit?: number;
  timeout?: number;
  allowedUpdates?: string[];
}

/**
 * Minimal Bot API surface consumed by `read_telegram_topic_history`.
 * Implementations call `https://api.telegram.org/bot<token>/<method>`
 * and translate non-2xx + `ok:false` payloads into the typed errors
 * exported below.
 */
export interface TelegramBotClient {
  getChat(chatId: string | number): Promise<TelegramChat>;
  getUpdates(options?: GetUpdatesOptions): Promise<TelegramUpdate[]>;
  getForumTopic?(
    chatId: string | number,
    messageThreadId: number,
  ): Promise<TelegramForumTopic>;
}

// ─────────────────────────────────────────────────────────────────────────
// Error hierarchy
// ─────────────────────────────────────────────────────────────────────────

/** Base class for all Telegram Bot API failures. */
export class TelegramApiError extends Error {
  /** HTTP status returned by api.telegram.org (or 0 for transport-level). */
  public readonly status: number;
  /** `description` field from the Bot API response (or `cause.message`). */
  public readonly description: string;
  /** Bot API method (`getChat`, `getUpdates`, ...). Useful for logging. */
  public readonly method: string;

  constructor(method: string, status: number, description: string) {
    super(`Telegram ${method} failed: HTTP ${status} — ${description}`);
    this.name = "TelegramApiError";
    this.method = method;
    this.status = status;
    this.description = description;
  }
}

/**
 * HTTP 429 / `error_code: 429` — Telegram flood control. `retryAfter`
 * is sourced from the `parameters.retry_after` field when present;
 * callers should respect it (don't immediately retry).
 */
export class TelegramRateLimitError extends TelegramApiError {
  public readonly retryAfter: number | undefined;

  constructor(method: string, description: string, retryAfter?: number) {
    super(method, 429, description);
    this.name = "TelegramRateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * HTTP 401 / 403 — bot lacks permission for the chat (kicked, never
 * joined, missing `can_read_messages`, or wrong token). Surfacing this
 * as a distinct class lets the LLM tool layer return
 * `error.code = "forbidden"` instead of degrading silently.
 */
export class TelegramForbiddenError extends TelegramApiError {
  constructor(method: string, status: number, description: string) {
    super(method, status, description);
    this.name = "TelegramForbiddenError";
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Default fetch-backed implementation
// ─────────────────────────────────────────────────────────────────────────

export interface CreateTelegramBotClientOptions {
  token: string;
  /** Override for tests / dependency-injection. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Override API base. Lets callers point at a local sandbox. */
  apiBase?: string;
}

interface BotApiEnvelope<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

/**
 * Build a Bot API client bound to a single bot token. Errors are mapped
 * 1:1 from the Bot API envelope so callers can `instanceof`-discriminate
 * without inspecting magic strings.
 */
export function createTelegramBotClient(
  options: CreateTelegramBotClientOptions,
): TelegramBotClient {
  const token = options.token;
  if (!token) {
    throw new Error(
      "createTelegramBotClient: token is required (got empty string)",
    );
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = (options.apiBase ?? "https://api.telegram.org").replace(
    /\/+$/,
    "",
  );

  async function call<T>(
    method: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${apiBase}/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new TelegramApiError(method, 0, `transport: ${message}`);
    }

    const payload = (await res
      .json()
      .catch(() => null)) as BotApiEnvelope<T> | null;
    const description =
      payload?.description ?? `HTTP ${res.status} (no description)`;
    const retryAfter = payload?.parameters?.retry_after;

    // Telegram returns 200 + ok:false on some flood/forbidden cases AND
    // also 4xx with the same envelope. Discriminate by status + error_code
    // rather than relying on either alone.
    const httpStatus = res.status;
    const errorCode = payload?.error_code ?? httpStatus;

    if (res.ok && payload?.ok && payload.result !== undefined) {
      return payload.result;
    }

    if (errorCode === 429 || httpStatus === 429) {
      throw new TelegramRateLimitError(method, description, retryAfter);
    }
    if (errorCode === 401 || errorCode === 403) {
      throw new TelegramForbiddenError(method, errorCode, description);
    }
    throw new TelegramApiError(method, httpStatus, description);
  }

  return {
    async getChat(chatId) {
      return call<TelegramChat>("getChat", { chat_id: chatId });
    },
    async getUpdates(opts = {}) {
      const body: Record<string, unknown> = {};
      if (opts.offset !== undefined) body["offset"] = opts.offset;
      if (opts.limit !== undefined) body["limit"] = opts.limit;
      if (opts.timeout !== undefined) body["timeout"] = opts.timeout;
      if (opts.allowedUpdates !== undefined)
        body["allowed_updates"] = opts.allowedUpdates;
      return call<TelegramUpdate[]>("getUpdates", body);
    },
    async getForumTopic(chatId, messageThreadId) {
      return call<TelegramForumTopic>("getForumTopic", {
        chat_id: chatId,
        message_thread_id: messageThreadId,
      });
    },
  };
}
