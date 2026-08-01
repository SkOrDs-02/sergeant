import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { telegramWaitlist } from "../pg/telegramWaitlist.js";

/**
 * SQL snapshot test: перевіряє, що drizzle-схема `telegram_waitlist`
 * не розійшлась із міграцією 089_telegram_waitlist.sql.
 *
 * Структурний тест (імена колонок, типи, nullability, індекси), а не
 * генерація сирого DDL — той відрізняється між версіями Drizzle. Дзеркалить
 * `pg-waitlist-snapshot.test.ts`.
 */
describe("pg/telegramWaitlist schema snapshot", () => {
  const config = getTableConfig(telegramWaitlist);

  it("має правильне імʼя таблиці", () => {
    expect(config.name).toBe("telegram_waitlist");
  });

  it("оголошує рівно ті колонки, що й міграції 089 + 092", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "id",
      "chat_id",
      "telegram_username",
      "first_name",
      "language_code",
      "start_payload",
      "created_at",
      "notified_at",
      "opted_out_at",
      // Міграція 092 — стан «чекаю причину /stop» + сама причина.
      "stop_reason_awaited_at",
      "stop_reason",
    ]);
  });

  it("типи колонок збігаються з міграцією", () => {
    const col = Object.fromEntries(config.columns.map((c) => [c.name, c]));

    expect(col["id"]!.dataType).toBe("number");
    expect(col["id"]!.primary).toBe(true);

    // Hard Rule #1: chat_id — BIGINT, але mode:"number", бо Telegram
    // гарантує вміщення в 52 біти. Якщо це коли-небудь стане "string",
    // тест впаде — і це правильно: рядок поламає всіх споживачів.
    expect(col["chat_id"]!.dataType).toBe("number");
    expect(col["chat_id"]!.notNull).toBe(true);
    expect(col["chat_id"]!.isUnique).toBe(true);

    // Знімок профілю — усі nullable: Telegram не гарантує ні username,
    // ні language_code, а /start може приїхати без payload.
    for (const name of [
      "telegram_username",
      "first_name",
      "language_code",
      "start_payload",
    ]) {
      expect(col[name]!.dataType).toBe("string");
      expect(col[name]!.notNull).toBe(false);
    }

    expect(col["created_at"]!.notNull).toBe(true);
    expect(col["created_at"]!.hasDefault).toBe(true);

    // Обидві мітки nullable: NULL = «ще не слали» / «не відписувався».
    // Саме на цьому тримається вибірка розсилки.
    expect(col["notified_at"]!.notNull).toBe(false);
    expect(col["opted_out_at"]!.notNull).toBe(false);

    // Міграція 092 додала обидві колонки additive і NULLable — двофазність
    // не потрібна саме тому, що старий код їх не бачить. NOT NULL тут став
    // би поламкою: рядки, створені до 092, причини не мають.
    expect(col["stop_reason_awaited_at"]!.notNull).toBe(false);
    expect(col["stop_reason"]!.dataType).toBe("string");
    expect(col["stop_reason"]!.notNull).toBe(false);
  });

  it("має частковий індекс під вибірку розсилки", () => {
    const names = config.indexes.map((i) => i.config.name);
    expect(names).toContain("telegram_waitlist_pending_idx");
    expect(names).toContain("telegram_waitlist_payload_idx");

    const pending = config.indexes.find(
      (i) => i.config.name === "telegram_waitlist_pending_idx",
    );
    // Частковість — суть індексу: без `where` він ріс би разом з уже
    // розісланими рядками, яких у вибірці ніколи не буде.
    expect(pending?.config.where).toBeDefined();
  });
});
