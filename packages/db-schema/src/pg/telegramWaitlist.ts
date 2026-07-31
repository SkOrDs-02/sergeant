import {
  bigint,
  bigserial,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Postgres schema for `telegram_waitlist`.
 * Mirrors migrations 089_telegram_waitlist.sql і 092_telegram_waitlist_stop_reason.sql.
 *
 * `chatId` is `mode: "number"` deliberately: Telegram guarantees ids fit in
 * 52 bits, so `Number` is lossless and callers never see the `pg` bigint
 * string (Hard Rule #1).
 */
export const telegramWaitlist = pgTable(
  "telegram_waitlist",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    chatId: bigint("chat_id", { mode: "number" }).notNull().unique(),
    telegramUsername: text("telegram_username"),
    firstName: text("first_name"),
    languageCode: text("language_code"),
    startPayload: text("start_payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    // Міграція 092: після `/stop` бот питає причину. `…_awaited_at` — мітка
    // «чекаю наступне текстове повідомлення як причину», `stop_reason` —
    // сама відповідь. Обидві NULL, поки людина не відписалась.
    stopReasonAwaitedAt: timestamp("stop_reason_awaited_at", {
      withTimezone: true,
    }),
    stopReason: text("stop_reason"),
  },
  (table) => [
    index("telegram_waitlist_pending_idx")
      .on(table.createdAt)
      .where(sql`${table.notifiedAt} IS NULL AND ${table.optedOutAt} IS NULL`),
    index("telegram_waitlist_payload_idx").on(table.startPayload),
  ],
);
