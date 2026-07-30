import { describe, expect, it, vi } from "vitest";
import {
  countWaitlistStats,
  formatStatsReply,
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

  it("читає /stats (гейт за chat_id — у роутері, не тут)", () => {
    expect(parseCommand(msg("/stats"))).toEqual({ kind: "stats" });
    expect(parseCommand(msg("/stats@serg_qa_bot"))).toEqual({ kind: "stats" });
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

describe("countWaitlistStats", () => {
  it("коерсить bigint-рядки з pg у числа (Hard Rule #1)", async () => {
    const query = vi
      .fn()
      // `count(*)` у pg — bigint, і драйвер віддає його РЯДКОМ.
      .mockResolvedValueOnce({
        rows: [
          {
            pending: "3",
            notified: "1",
            opted_out: "2",
            total: "6",
            last_signup: new Date("2026-07-29T10:00:00Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { channel: "hero", count: "4" },
          { channel: "footer", count: "2" },
        ],
      });

    const stats = await countWaitlistStats({ query } as never);

    expect(stats.pending).toBe(3);
    expect(stats.total).toBe(6);
    expect(stats.byChannel).toEqual([
      { channel: "hero", count: 4 },
      { channel: "footer", count: 2 },
    ]);
    // Без коерції `total + 1` дало б "61" — саме це правило й ловить.
    expect(stats.total + 1).toBe(7);
  });

  it("не витягує chat_id і хендли — лише числа", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });
    await countWaitlistStats({ query } as never);

    const sql = query.mock.calls.map((c) => String(c[0])).join(" ");
    expect(sql).not.toMatch(/chat_id/);
    expect(sql).not.toMatch(/telegram_username/);
  });
});

describe("formatStatsReply", () => {
  const base = {
    pending: 0,
    notified: 0,
    optedOut: 0,
    total: 0,
    lastSignupAt: null,
    byChannel: [],
  };

  it("порожній список читається як порожній, а не як нулі", () => {
    expect(formatStatsReply(base)).toMatch(/порожній/);
  });

  it("показує розбивку за каналом і час у Києві", () => {
    const out = formatStatsReply({
      ...base,
      pending: 2,
      total: 2,
      lastSignupAt: new Date("2026-07-29T07:30:00Z"),
      byChannel: [{ channel: "hero", count: 2 }],
    });
    expect(out).toMatch(/Вейтліст: 2/);
    expect(out).toMatch(/hero — 2/);
    // 07:30 UTC = 10:30 Kyiv. Без явної зони власник читав би час назад.
    expect(out).toMatch(/10:30/);
  });
});
