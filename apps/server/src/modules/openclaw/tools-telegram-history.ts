// ─────────────────────────────────────────────────────────────────────────
// read_telegram_topic_history — Sergeant Ops supergroup topic (PR-35)
// ─────────────────────────────────────────────────────────────────────────
//
// PR-35 (Pain P8): swap the archive-only stub for a real Bot API-aware
// implementation. The historical-data source remains `tg_topic_archive`
// (Bot API has no `getChatHistory`), but we now:
//   1) Probe `getChat` to surface forbidden / rate-limit as structured
//      errors instead of degrading silently.
//   2) Optionally merge live `getUpdates` payloads (opt-in via
//      `OPENCLAW_TELEGRAM_FETCH_UPDATES=true`) for webhook-mode bots,
//      yielding fresher `from` / `reply_to_message_id` metadata than
//      the archive carries.
//   3) Return a normalized message shape (`id, from, text, date,
//      replyToMessageId`) plus `topicId` so the LLM tool wrapper has
//      everything it needs without secondary lookups.
//
// `getUpdates` is gated because it conflicts with long-poll bot
// processes — calling it would steal updates from the running
// `tools/openclaw` consumer. Webhook deployments are safe; long-poll
// ones must leave the flag off.

import type { Pool } from "pg";
import { logger } from "../../obs/logger.js";
import { env } from "../../env.js";
import { listTopicMessages } from "../topic-archive/index.js";
import type { TelegramBotClient, TelegramUpdate } from "../telegram/index.js";
import {
  TelegramApiError,
  TelegramForbiddenError,
  TelegramRateLimitError,
  createTelegramBotClient,
} from "../telegram/index.js";

function resolveTopicEnvId(
  topic: string,
): { envVarName: string; raw: string } | null {
  switch (topic) {
    case "ops":
      return { envVarName: "TELEGRAM_TOPIC_OPS", raw: env.TELEGRAM_TOPIC_OPS };
    case "engineering":
      return {
        envVarName: "TELEGRAM_TOPIC_ENGINEERING",
        raw: env.TELEGRAM_TOPIC_ENGINEERING,
      };
    case "growth":
      return {
        envVarName: "TELEGRAM_TOPIC_GROWTH",
        raw: env.TELEGRAM_TOPIC_GROWTH,
      };
    default:
      return null;
  }
}

export interface ReadTelegramTopicHistoryInput {
  /** Назва топіка з REPORTING-MATRIX.md ('digest', 'incidents', etc). */
  topic: string;
  since?: string | undefined;
  limit?: number | undefined;
}

export type ReadTelegramTopicHistoryErrorCode =
  | "rate_limit"
  | "forbidden"
  | "api_error";

export interface ReadTelegramTopicHistoryError {
  code: ReadTelegramTopicHistoryErrorCode;
  message: string;
  retryAfter?: number;
}

export interface ReadTelegramTopicHistoryMessage {
  /** Telegram `message_id` (0 when archive row lacks it — n8n alerts). */
  id: number;
  /** Author display string (`@username` / first_name) when known. */
  from: string | null;
  text: string;
  /** ISO-8601 timestamp. */
  date: string;
  /** Telegram `reply_to_message.message_id`, null when not a reply. */
  replyToMessageId: number | null;
  /** Origin of the message row (archive writer kind or `bot_api`). */
  source: "alert" | "post_to_topic" | "bot_api" | string;
}

export interface ReadTelegramTopicHistoryOutput {
  topic: string;
  /**
   * Resolved `message_thread_id` for forum-topic supergroups. Null
   * when the topic key has no env-mapping (e.g. ad-hoc archive
   * topics like `incidents` that n8n owns). Mirrors the Telegram
   * Bot API `message_thread_id` field.
   */
  topicId: number | null;
  /** Where the messages came from. `merged` when we combined both. */
  origin: "archive" | "bot_api" | "merged";
  messages: ReadTelegramTopicHistoryMessage[];
  /** Advisory note (empty result, partial degradation, …). */
  note?: string;
  /** Structured error when a Bot API probe failed but we still returned. */
  error?: ReadTelegramTopicHistoryError;
}

export interface ReadTelegramTopicHistoryDeps {
  /**
   * Injected Bot API client. When `undefined`, a real client is built
   * lazily from `SERGEANT_ALERT_BOT_TOKEN`. Set to `null` to skip the
   * Bot API probe entirely (archive-only mode, useful for tests and
   * for prod-deploys without a bot token).
   */
  telegramClient?: TelegramBotClient | null | undefined;
}

function resolveTopicId(topic: string): number | null {
  const entry = resolveTopicEnvId(topic);
  if (!entry || !entry.raw) return null;
  const parsed = Number(entry.raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTelegramFrom(update: TelegramUpdate): {
  from: string | null;
  replyToMessageId: number | null;
} {
  const msg =
    update.message ?? update.channel_post ?? update.edited_message ?? null;
  if (!msg) return { from: null, replyToMessageId: null };
  const user = msg.from;
  let from: string | null = null;
  if (user) {
    from =
      user.username !== undefined
        ? `@${user.username}`
        : `${user.first_name}${user.last_name ? " " + user.last_name : ""}`.trim() ||
          null;
  } else if (msg.sender_chat?.title) {
    from = msg.sender_chat.title;
  }
  return {
    from,
    replyToMessageId: msg.reply_to_message?.message_id ?? null,
  };
}

function mapArchiveRow(
  row: Awaited<ReturnType<typeof listTopicMessages>>[number],
): ReadTelegramTopicHistoryMessage {
  const meta = row.metadata as {
    from?: string;
    reply_to_message_id?: number;
  };
  return {
    id: row.messageId,
    from: typeof meta?.from === "string" ? meta.from : null,
    text: row.text,
    date: row.sentAt,
    replyToMessageId:
      typeof meta?.reply_to_message_id === "number"
        ? meta.reply_to_message_id
        : null,
    source: row.source,
  };
}

function mapBotApiUpdate(
  update: TelegramUpdate,
): ReadTelegramTopicHistoryMessage | null {
  const msg =
    update.message ?? update.channel_post ?? update.edited_message ?? null;
  if (!msg) return null;
  const text = msg.text ?? msg.caption ?? "";
  if (!text) return null;
  const { from, replyToMessageId } = formatTelegramFrom(update);
  return {
    id: msg.message_id,
    from,
    text,
    date: new Date(msg.date * 1000).toISOString(),
    replyToMessageId,
    source: "bot_api",
  };
}

/**
 * Reads recent Sergeant Ops supergroup forum-topic messages. Combines
 * `tg_topic_archive` (migration 047) with an optional Bot API probe
 * for access validation. Backs the LLM tool `read_telegram_topic_history`
 * (ADR-0031 §5; OpenClaw roadmap Phase 3 / Pain P8 — PR-35).
 *
 * Archive is the canonical historical source — Bot API has no
 * `getChatHistory` method. We call `getChat` to surface
 * forbidden/rate-limit failures as structured `error` payloads (instead
 * of throwing 5xx) so the calling agent can degrade gracefully, and
 * optionally drain `getUpdates` for webhook-mode bots when the
 * `OPENCLAW_TELEGRAM_FETCH_UPDATES=true` flag is on.
 *
 * Topics that have not seen a write since the table was provisioned
 * yield an empty array + note rather than throwing. The LLM treats
 * empty + note as authoritative ("nothing happened in `incidents` for
 * the last 24h") instead of hallucinating history.
 */
export async function readTelegramTopicHistory(
  pool: Pool,
  input: ReadTelegramTopicHistoryInput,
  deps?: ReadTelegramTopicHistoryDeps,
): Promise<ReadTelegramTopicHistoryOutput> {
  const maxLimit = Math.max(1, Math.min(100, env.TELEGRAM_TOPIC_HISTORY_LIMIT));
  const effectiveLimit = Math.max(
    1,
    Math.min(maxLimit, input.limit ?? maxLimit),
  );

  const archiveRows = await listTopicMessages(pool, {
    topic: input.topic,
    sinceIso: input.since,
    limit: effectiveLimit,
  });
  const archiveMessages = archiveRows.map(mapArchiveRow);
  const topicId = resolveTopicId(input.topic);

  // Resolve client (lazy): explicit `null` opts out, explicit client
  // wins, otherwise build from env. Missing token → skip the probe.
  let client: TelegramBotClient | null = null;
  if (deps && "telegramClient" in deps) {
    client = deps.telegramClient ?? null;
  } else {
    const token = env.SERGEANT_ALERT_BOT_TOKEN;
    if (token) {
      try {
        client = createTelegramBotClient({ token });
      } catch {
        client = null;
      }
    }
  }

  let error: ReadTelegramTopicHistoryError | undefined;
  let liveMessages: ReadTelegramTopicHistoryMessage[] = [];

  if (client) {
    const chatId = env.SERGEANT_OPS_CHAT_ID;
    if (chatId) {
      try {
        await client.getChat(chatId);
      } catch (err) {
        if (err instanceof TelegramRateLimitError) {
          error = {
            code: "rate_limit",
            message: err.description,
            ...(err.retryAfter !== undefined
              ? { retryAfter: err.retryAfter }
              : {}),
          };
        } else if (err instanceof TelegramForbiddenError) {
          error = { code: "forbidden", message: err.description };
        } else if (err instanceof TelegramApiError) {
          error = { code: "api_error", message: err.description };
        } else {
          const message = err instanceof Error ? err.message : String(err);
          error = { code: "api_error", message };
          logger.warn(
            { err, topic: input.topic },
            "read_telegram_topic_history: unexpected getChat error",
          );
        }
      }

      const fetchUpdates = !error && env.OPENCLAW_TELEGRAM_FETCH_UPDATES;
      if (fetchUpdates && topicId !== null) {
        try {
          const updates = await client.getUpdates({
            offset: -effectiveLimit,
            limit: effectiveLimit,
            timeout: 0,
            allowedUpdates: ["message"],
          });
          liveMessages = updates
            .filter((u) => {
              const msg = u.message ?? u.channel_post;
              if (!msg) return false;
              if (String(msg.chat.id) !== String(chatId)) return false;
              return msg.message_thread_id === topicId;
            })
            .map(mapBotApiUpdate)
            .filter((m): m is ReadTelegramTopicHistoryMessage => m !== null);
        } catch (err) {
          // Updates fetch is best-effort; surface as note but keep
          // archive data + return a structured error if it's a
          // recognised class. Don't overwrite an existing error.
          if (!error) {
            if (err instanceof TelegramRateLimitError) {
              error = {
                code: "rate_limit",
                message: err.description,
                ...(err.retryAfter !== undefined
                  ? { retryAfter: err.retryAfter }
                  : {}),
              };
            } else if (err instanceof TelegramForbiddenError) {
              error = { code: "forbidden", message: err.description };
            } else if (err instanceof TelegramApiError) {
              error = { code: "api_error", message: err.description };
            }
          }
        }
      }
    }
  }

  // Merge archive + live by message_id (live wins, then sort newest-first
  // by date). Live messages may overlap archive rows when alerts come
  // back through `getUpdates` before n8n persists them.
  const merged = new Map<string, ReadTelegramTopicHistoryMessage>();
  for (const m of archiveMessages) {
    merged.set(`${m.id}|${m.date}`, m);
  }
  for (const m of liveMessages) {
    merged.set(`${m.id}|bot`, m);
  }
  const messages = Array.from(merged.values())
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, effectiveLimit);

  const origin: ReadTelegramTopicHistoryOutput["origin"] =
    liveMessages.length > 0 && archiveMessages.length > 0
      ? "merged"
      : liveMessages.length > 0
        ? "bot_api"
        : "archive";

  const result: ReadTelegramTopicHistoryOutput = {
    topic: input.topic,
    topicId,
    origin,
    messages,
  };
  if (error) {
    result.error = error;
  }
  if (messages.length === 0 && !error) {
    result.note =
      "tg_topic_archive returned no rows for this topic + window. The archive only sees alerts (n8n /alerts/post) and OpenClaw post_to_topic write-tool calls — manual sends from other accounts are not captured. Set OPENCLAW_TELEGRAM_FETCH_UPDATES=true and configure SERGEANT_OPS_CHAT_ID + TELEGRAM_TOPIC_<KEY> to merge live Bot API getUpdates (webhook-mode bots only).";
  }
  return result;
}
