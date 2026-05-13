/**
 * Telegram alert shipper з dedup / occurrence-counter (10-min window).
 *
 * O4 / B.1 (sprint-roadmap-q2q3-2026 §1.2, telegram-improvements-roadmap
 * §4.2). Закриває pain P5 (alert storm-и flood-ять `Sergeant_ops` без
 * dedup-у). Замість того щоб слати кожен дубль як окреме повідомлення,
 * групуємо по `(topic, dedup_signature)` у 10-min вікно і
 * `editMessageText`-ом оновлюємо лічильник у вже-надісланому
 * повідомленні («🔁 5× за 10 хв: <error>»).
 *
 * Контракт:
 *
 *   1. Caller передає `dedupSignature` (наприклад
 *      `"wf-15:railway-deploy-failed:service=api"`). NULL/missing →
 *      legacy single-shot behaviour (просто sendMessage, без dedup).
 *   2. Якщо існує row у `tg_alert_acks` із тим самим `(topic,
 *      dedup_signature)` і `last_occurrence_at >= NOW() - 10min` —
 *      інкрементуємо `occurrence_count`, формуємо новий text і робимо
 *      `editMessageText`. На успіх повертаємо `action="edited"`.
 *   3. Інакше — INSERT новий row через `recordAlertPost`, send новий
 *      message через `sendMessage`, записуємо `(chat_id, message_id)`
 *      у row для майбутніх editMessageText-викликів. Повертаємо
 *      `action="sent"`.
 *   4. Якщо `editMessageText` повертає не-200 (Telegram не знайшов
 *      message, наприклад було видалено) — fallback на `sendMessage`
 *      як для нової групи: інкрементований row перестає бути editable,
 *      виставляємо новий `message_id`.
 *
 * Fail-open: будь-яка непередбачена помилка (Telegram API, DB) логиться
 * на warn-рівні, повертається `action="error"`. Caller повинен бути
 * робастним до цього — alert pipeline не падає (вона і так alert).
 *
 * Тестується через `TelegramApiClient` injectable port — у production
 * `defaultTelegramApiClient` робить fetch-и до `api.telegram.org`,
 * у Vitest mock-аємо клієнт і перевіряємо поведінку без мережі.
 */

import type { Pool } from "pg";
import { logger } from "../../obs/logger.js";
import {
  findRecentDedupMatch,
  incrementOccurrence,
  recordAlertPost,
  recordTelegramMessage,
} from "./store.js";
import type { TgAlertSeverity } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

/** 10 хв = 600_000 ms. Default sliding-window для B.1. */
export const DEFAULT_DEDUP_WINDOW_MS = 10 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────
// Telegram API client (injectable port)
// ─────────────────────────────────────────────────────────────────────────

export interface TelegramSendMessageInput {
  chatId: number | string;
  messageThreadId?: number | undefined;
  text: string;
  disableNotification?: boolean | undefined;
}

export interface TelegramSendMessageOutput {
  ok: boolean;
  messageId?: number | undefined;
  errorCode?: number | undefined;
  description?: string | undefined;
}

export interface TelegramEditMessageInput {
  chatId: number | string;
  messageId: number;
  text: string;
}

export interface TelegramEditMessageOutput {
  ok: boolean;
  errorCode?: number | undefined;
  description?: string | undefined;
}

/**
 * Minimal Telegram-API surface, що потрібен shipper-у. Винесений у
 * port-інтерфейс, бо:
 *   1. У Vitest мокаємо без мережі.
 *   2. Майбутні мігранти на grammy-клієнт можуть підставити свій
 *      adapter без зміни shipper-у.
 */
export interface TelegramApiClient {
  sendMessage(
    input: TelegramSendMessageInput,
  ): Promise<TelegramSendMessageOutput>;
  editMessageText(
    input: TelegramEditMessageInput,
  ): Promise<TelegramEditMessageOutput>;
}

/**
 * Default fetch-based Telegram client. Читає `botToken` зі звала, бо в
 * нашому проекті є кілька botів (`SERGEANT_ALERT_BOT_TOKEN`,
 * `OPENCLAW_BOT_TOKEN` тощо) — caller свідомо вибирає, від чийого
 * імені шле.
 */
export function createTelegramApiClient(botToken: string): TelegramApiClient {
  return {
    async sendMessage(input) {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: input.chatId,
            ...(input.messageThreadId !== undefined && {
              message_thread_id: input.messageThreadId,
            }),
            text: input.text,
            ...(input.disableNotification !== undefined && {
              disable_notification: input.disableNotification,
            }),
          }),
        },
      );
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        result?: { message_id?: number };
        error_code?: number;
        description?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        return {
          ok: false,
          errorCode: body?.error_code ?? res.status,
          description: body?.description ?? `HTTP ${res.status}`,
        };
      }
      return { ok: true, messageId: body.result?.message_id };
    },

    async editMessageText(input) {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/editMessageText`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: input.chatId,
            message_id: input.messageId,
            text: input.text,
          }),
        },
      );
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error_code?: number;
        description?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        return {
          ok: false,
          errorCode: body?.error_code ?? res.status,
          description: body?.description ?? `HTTP ${res.status}`,
        };
      }
      return { ok: true };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Text formatter
// ─────────────────────────────────────────────────────────────────────────

/**
 * Formats the dedup counter prefix. Convention:
 *   N=1 → `<originalText>` (no prefix — first occurrence).
 *   N>1 → `🔁 N× за 10 хв:\n<originalText>` (per spec у roadmap §4.2).
 *
 * Sliding-window семантика: «за 10 хв» — це від першого
 * occurrence-у. Не критично, якщо counter-text лагне на секунди — alert
 * має signal-value, не precise-timing-value.
 */
export function formatOccurrenceCounterText(
  originalText: string,
  occurrenceCount: number,
  windowMinutes: number = 10,
): string {
  if (occurrenceCount <= 1) return originalText;
  return `🔁 ${occurrenceCount}× за ${windowMinutes} хв:\n${originalText}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────

export interface PostOrEditDedupedAlertInput {
  /** Stable alert-id для idempotent INSERT (n8n workflow:execution). */
  alertId: string;
  /** Forum-topic key (incidents, engineering, ops, …). */
  topic: string;
  /** Severity tier (P0|P1|P2|P3). */
  severity: TgAlertSeverity;
  /** Optional human summary; також піде у `tg_topic_archive`. */
  summary?: string | null | undefined;
  /** Free-form metadata; default {}. */
  metadata?: Record<string, unknown> | undefined;
  /**
   * Dedup-signature ("<workflow_id>:<error_signature>"). Якщо NULL/missing
   * — dedup вимкнено, кожен alert шлеться окремо.
   */
  dedupSignature?: string | null | undefined;
  /** Telegram chat-id (numeric або @username). */
  chatId: number | string;
  /** Опційний message_thread_id для супергрупи з топіками. */
  messageThreadId?: number | undefined;
  /** Plain-text повідомлення (HTML/Markdown НЕ використовуємо тут). */
  text: string;
  /** disable_notification — для P3 alerts. Default `false`. */
  disableNotification?: boolean | undefined;
  /** Lookback window. Default 10 хв (600_000 ms). */
  windowMs?: number | undefined;
}

export type PostOrEditDedupedAlertResult =
  | {
      action: "sent";
      alertId: string;
      messageId: number;
      occurrenceCount: 1;
      alreadyPosted: boolean;
    }
  | {
      action: "edited";
      alertId: string;
      groupAlertId: string;
      messageId: number;
      occurrenceCount: number;
    }
  | {
      action: "sent_after_edit_failure";
      alertId: string;
      messageId: number;
      occurrenceCount: number;
      editError: string;
    }
  | {
      action: "skipped_not_configured";
      reason: string;
    }
  | {
      action: "error";
      reason: string;
    };

/**
 * Posts a new Telegram alert OR edits the existing one for the same
 * `(topic, dedup_signature)` group у межах 10-min sliding-window.
 *
 * **Order of operations** (порядок важливий — описує race-window
 * behaviour, fail-mode):
 *
 *   1. Якщо `dedupSignature` присутній → `findRecentDedupMatch` SELECT.
 *   2. Якщо знайдено group + є `telegram_message_id` → atomic INCR
 *      occurrence_count, потім `editMessageText`. На success повертаємо
 *      `action="edited"`. На fail (Telegram 400/404/...) — fallback
 *      на `sendMessage` + `recordAlertPost` (новий group), повертаємо
 *      `action="sent_after_edit_failure"`.
 *   3. Якщо ні (no signature OR no match OR no message_id) → стандартний
 *      `recordAlertPost` + `sendMessage` + `recordTelegramMessage`.
 *      Повертаємо `action="sent"`.
 *
 * Race scenario: два concurrent виклики для тієї самої сигнатури в
 * порожньому стані — обидва зроблять `findRecentDedupMatch=null` →
 * обидва зроблять `recordAlertPost`. Першому стане UNIQUE(alertId)
 * рядок; другому — `alreadyPosted=true` (бо alertId стабільний на
 * retry). Якщо alertId різні (різні n8n exec_id), створяться 2 групи
 * замість 1 — це acceptable degradation (дві alert-и за 10 хв замість
 * 5× counter). 10-min вікно ловить переважну більшість дублів від
 * одного workflow.
 */
export async function postOrEditDedupedAlert(
  pool: Pool,
  client: TelegramApiClient,
  input: PostOrEditDedupedAlertInput,
): Promise<PostOrEditDedupedAlertResult> {
  const windowMs = input.windowMs ?? DEFAULT_DEDUP_WINDOW_MS;
  const windowMinutes = Math.max(1, Math.round(windowMs / 60_000));

  // Branch 1: try dedup edit if signature is present.
  if (input.dedupSignature) {
    try {
      const match = await findRecentDedupMatch(pool, {
        topic: input.topic,
        dedupSignature: input.dedupSignature,
        windowMs,
      });
      if (
        match &&
        match.telegram_chat_id !== null &&
        match.telegram_message_id !== null
      ) {
        // ── increment counter atomically ──
        const incr = await incrementOccurrence(pool, match.id);
        if (!Number.isFinite(incr.occurrenceCount)) {
          // Row vanished race — fall through to fresh send.
          logger.warn({
            msg: "tg_alert_dedup_row_vanished",
            alertGroupId: match.id,
            signature: input.dedupSignature,
          });
        } else {
          // ── compose new text with counter prefix ──
          const newText = formatOccurrenceCounterText(
            input.text,
            incr.occurrenceCount,
            windowMinutes,
          );
          const editRes = await client.editMessageText({
            chatId: match.telegram_chat_id,
            messageId: match.telegram_message_id,
            text: newText,
          });
          if (editRes.ok) {
            return {
              action: "edited",
              alertId: input.alertId,
              groupAlertId: match.alert_id,
              messageId: match.telegram_message_id,
              occurrenceCount: incr.occurrenceCount,
            };
          }
          // Edit failed — Telegram returned 4xx (message not found,
          // deleted, etc.). Fall through to fresh send + log the
          // failure cause. Counter is already incremented in DB, but
          // we'll create a new group so this incremented row becomes
          // "orphaned" (still tracked, just no editable message
          // afterwards).
          logger.warn({
            msg: "tg_alert_edit_failed_fallback_to_send",
            alertGroupId: match.id,
            chatId: match.telegram_chat_id,
            messageId: match.telegram_message_id,
            editError: editRes.description ?? "unknown",
            errorCode: editRes.errorCode,
          });
          const fresh = await freshSend(pool, client, input, newText);
          if (fresh.action === "sent") {
            return {
              action: "sent_after_edit_failure",
              alertId: input.alertId,
              messageId: fresh.messageId,
              occurrenceCount: incr.occurrenceCount,
              editError: editRes.description ?? "unknown",
            };
          }
          return fresh;
        }
      }
    } catch (err) {
      // DB or unexpected error during dedup-path; log warn + fall
      // through to fresh send. Alert pipeline must not crash on its
      // own observability infrastructure failure.
      logger.warn({
        msg: "tg_alert_dedup_lookup_failed_fallback_to_send",
        signature: input.dedupSignature,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Branch 2: fresh send (legacy path OR no dedup match OR dedup error).
  return freshSend(pool, client, input, input.text);
}

async function freshSend(
  pool: Pool,
  client: TelegramApiClient,
  input: PostOrEditDedupedAlertInput,
  text: string,
): Promise<PostOrEditDedupedAlertResult> {
  let alreadyPosted = false;
  try {
    const inserted = await recordAlertPost(pool, {
      alertId: input.alertId,
      topic: input.topic,
      severity: input.severity,
      summary: input.summary ?? null,
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.dedupSignature
          ? { dedup_signature_seed: input.dedupSignature }
          : {}),
      },
    });
    alreadyPosted = inserted.alreadyPosted;
    // We also need to set dedup_signature + last_occurrence_at on the
    // freshly-inserted row so future matches find it. recordAlertPost
    // didn't take those params (legacy API kept stable for backward
    // compat), so we patch them in a follow-up UPDATE. Idempotent: only
    // updates if dedup_signature IS NULL (handles n8n retries).
    if (input.dedupSignature) {
      await pool.query(
        `UPDATE tg_alert_acks
            SET dedup_signature = $2,
                last_occurrence_at = COALESCE(last_occurrence_at, NOW())
          WHERE alert_id = $1
            AND dedup_signature IS NULL`,
        [input.alertId, input.dedupSignature],
      );
    }
  } catch (err) {
    logger.warn({
      msg: "tg_alert_record_post_failed",
      alertId: input.alertId,
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      action: "error",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const sent = await client.sendMessage({
    chatId: input.chatId,
    messageThreadId: input.messageThreadId,
    text,
    disableNotification: input.disableNotification,
  });
  if (!sent.ok || sent.messageId === undefined) {
    logger.warn({
      msg: "tg_alert_send_failed",
      alertId: input.alertId,
      errorCode: sent.errorCode,
      description: sent.description,
    });
    return {
      action: "error",
      reason: sent.description ?? `error_code=${sent.errorCode ?? "unknown"}`,
    };
  }

  // Persist (chat_id, message_id) for future editMessageText calls.
  // Failure here is non-fatal — message is delivered; we just lose the
  // edit-ability on the NEXT dedup hit. Log + continue.
  try {
    await recordTelegramMessage(pool, {
      alertId: input.alertId,
      telegramChatId:
        typeof input.chatId === "number" ? input.chatId : Number(input.chatId),
      telegramMessageId: sent.messageId,
    });
  } catch (err) {
    logger.warn({
      msg: "tg_alert_record_telegram_message_failed",
      alertId: input.alertId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    action: "sent",
    alertId: input.alertId,
    messageId: sent.messageId,
    occurrenceCount: 1,
    alreadyPosted,
  };
}
