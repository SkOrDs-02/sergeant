import { describe, expect, it, vi } from "vitest";
import {
  isValidWebhookSecret,
  parseCommand,
  recordStart,
  recordStop,
} from "./waitlistBot.js";

describe("parseCommand", () => {
  const msg = (text: string) => ({ message: { text } });

  it("читає /start без payload", () => {
    expect(parseCommand(msg("/start"))).toEqual({
      kind: "start",
      payload: null,
    });
  });

  it("читає payload deep link-а", () => {
    expect(parseCommand(msg("/start hero"))).toEqual({
      kind: "start",
      payload: "hero",
    });
  });

  it("знімає суфікс бота, який Telegram додає в групах", () => {
    expect(parseCommand(msg("/start@serg_qa_bot dou"))).toEqual({
      kind: "start",
      payload: "dou",
    });
  });

  it("відкидає payload поза набором Telegram", () => {
    // Такий payload не міг приїхати з deep link — це ручний ввід. У колонці
    // атрибуції йому не місце, але сам /start лишається валідним.
    expect(parseCommand(msg("/start <script>"))).toEqual({
      kind: "start",
      payload: null,
    });
    expect(parseCommand(msg(`/start ${"x".repeat(65)}`))).toEqual({
      kind: "start",
      payload: null,
    });
  });

  it("читає /stop", () => {
    expect(parseCommand(msg("/stop"))).toEqual({ kind: "stop" });
  });

  it("ігнорує звичайний текст, порожнечу і апдейт без повідомлення", () => {
    expect(parseCommand(msg("привіт"))).toEqual({ kind: "ignore" });
    expect(parseCommand(msg("   "))).toEqual({ kind: "ignore" });
    expect(parseCommand({})).toEqual({ kind: "ignore" });
  });
});

describe("isValidWebhookSecret", () => {
  it("приймає точний збіг", () => {
    expect(isValidWebhookSecret("s3cret", "s3cret")).toBe(true);
  });

  it("відхиляє розбіжність, іншу довжину і відсутній заголовок", () => {
    expect(isValidWebhookSecret("nope", "s3cret")).toBe(false);
    expect(isValidWebhookSecret("s3cre", "s3cret")).toBe(false);
    expect(isValidWebhookSecret(undefined, "s3cret")).toBe(false);
  });

  it("відхиляє все, якщо секрет не налаштований", () => {
    // Інакше порожній конфіг зробив би ендпоінт відкритим для будь-кого,
    // хто вгадає порожній заголовок.
    expect(isValidWebhookSecret("", "")).toBe(false);
    expect(isValidWebhookSecret(undefined, "")).toBe(false);
  });
});

function fakePool(rows: unknown[] = [{ created: true }]) {
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  return { pool: { query } as never, query };
}

describe("recordStart", () => {
  it("не дає повторному /start зсунути created_at чи notified_at", async () => {
    const { pool, query } = fakePool();
    await recordStart(pool, {
      chatId: 42,
      username: "u",
      firstName: "F",
      languageCode: "uk",
      startPayload: "hero",
    });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("ON CONFLICT (chat_id) DO UPDATE");
    // Ці дві колонки в SET не згадуються — саме тому ретрай Telegram
    // безпечний, а вже запрошена людина не повертається в чергу розсилки.
    expect(sql).not.toMatch(/SET[\s\S]*created_at\s*=/);
    expect(sql).not.toMatch(/SET[\s\S]*notified_at\s*=/);
    // Відписка знімається: явний /start — це згода.
    expect(sql).toMatch(/opted_out_at\s*=\s*NULL/);
    // Перший канал атрибуції не перетирається наступним /start.
    expect(sql).toContain("COALESCE(telegram_waitlist.start_payload");
  });

  it("розрізняє вставку й оновлення через xmax", async () => {
    const { pool } = fakePool([{ created: false }]);
    await expect(
      recordStart(pool, {
        chatId: 1,
        username: null,
        firstName: null,
        languageCode: null,
        startPayload: null,
      }),
    ).resolves.toEqual({ created: false });
  });
});

describe("recordStop", () => {
  it("позначає відписку, а не видаляє рядок", async () => {
    const { pool, query } = fakePool([]);
    await recordStop(pool, 7);
    const sql = String(query.mock.calls[0]?.[0]);
    // DELETE зробив би людину, яка відписалась, «новим» контактом при
    // наступному /start — і вона отримала б інвайт попри своє рішення.
    expect(sql).not.toContain("DELETE");
    expect(sql).toContain("opted_out_at = NOW()");
    expect(query.mock.calls[0]?.[1]).toEqual([7]);
  });
});
