import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Гейт `/stats` за `chat_id` — єдине, що відділяє власника від будь-кого, хто
 * знає юзернейм бота. Тест саме про це: невідповідний chat_id мусить не
 * отримати НІЧОГО — ні цифр, ні повідомлення про відмову (інакше сама відмова
 * підтверджувала б існування команди).
 *
 * Мокаємо env і Telegram-клієнт: перевіряємо роутінг і гейт, а не мережу.
 */

const ADMIN_CHAT_ID = "555000111";
const SECRET = "webhook-secret-stub";

const { sendMessageMock, envStub } = vi.hoisted(() => ({
  sendMessageMock: vi.fn().mockResolvedValue({ ok: true }),
  envStub: {
    TELEGRAM_WAITLIST_BOT_TOKEN: "token-stub",
    TELEGRAM_WAITLIST_WEBHOOK_SECRET: "webhook-secret-stub",
    TELEGRAM_WAITLIST_ADMIN_CHAT_ID: "555000111",
    // Число, не рядок: у проді zod (`coerceInt.positive().default(35)`) віддає
    // саме число, і мок мусить це дзеркалити. Якби тут лишився `undefined`,
    // `position > undefined` дало б `false` — тобто ліміт мовчки зник би,
    // і тест на 36-го проходив би як «всі в хвилі».
    TELEGRAM_BETA_WAVE_SIZE: 35,
  } as Record<string, string | number>,
}));

vi.mock("../env/env.js", () => ({ env: envStub }));
vi.mock("../modules/alerts/telegramShipper.js", () => ({
  createTelegramApiClient: () => ({ sendMessage: sendMessageMock }),
}));
vi.mock("../http/index.js", async () => {
  const actual =
    await vi.importActual<typeof import("../http/index.js")>(
      "../http/index.js",
    );
  return {
    ...actual,
    // Лімітер робить власний INSERT у pool — тут він лише шум.
    rateLimitExpress: () => (_q: unknown, _s: unknown, next: () => void) =>
      next(),
  };
});

const { createTelegramWebhookRouter } = await import("./telegram-webhook.js");

function makeApp(queryImpl: ReturnType<typeof vi.fn>) {
  const app = express();
  app.use(express.json());
  app.use(createTelegramWebhookRouter({ pool: { query: queryImpl } as never }));
  return app;
}

function startUpdate(chatId: number) {
  return {
    message: {
      chat: { id: chatId, type: "private" },
      from: { id: chatId, is_bot: false, username: "u", first_name: "F" },
      text: "/start hero",
    },
  };
}

function statsUpdate(chatId: number) {
  return {
    message: {
      chat: { id: chatId, type: "private" },
      from: { id: chatId, is_bot: false, username: "u", first_name: "F" },
      text: "/stats",
    },
  };
}

beforeEach(() => {
  sendMessageMock.mockClear();
  envStub["TELEGRAM_WAITLIST_ADMIN_CHAT_ID"] = ADMIN_CHAT_ID;
});

describe("POST /api/telegram/webhook — гейт /stats", () => {
  it("власник отримує зведення", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            pending: "2",
            notified: "0",
            opted_out: "0",
            total: "2",
            last_signup: new Date("2026-07-29T07:30:00Z"),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ channel: "hero", count: "2" }] });

    const res = await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", SECRET)
      .send(statsUpdate(Number(ADMIN_CHAT_ID)));

    expect(res.status).toBe(200);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(String(sendMessageMock.mock.calls[0]?.[0]?.text)).toMatch(
      /Вейтліст: 2/,
    );
  });

  it("чужий chat_id не отримує ні цифр, ні відмови", async () => {
    const query = vi.fn();
    const res = await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", SECRET)
      .send(statsUpdate(999999999));

    // 200 для Telegram — щоб він не ретраїв. Але жодної відповіді людині
    // і жодного запиту в базу: команда для неї просто не існує.
    expect(res.status).toBe(200);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("порожній ADMIN_CHAT_ID робить команду інертною навіть для власника", async () => {
    envStub["TELEGRAM_WAITLIST_ADMIN_CHAT_ID"] = "";
    const query = vi.fn();
    await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", SECRET)
      .send(statsUpdate(Number(ADMIN_CHAT_ID)));

    // Fail-closed: незаданий конфіг не має відкривати статистику всім,
    // у кого chat_id випадково збігся з порожнім рядком.
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("36-й отримує номер у черзі, а не «ти в списку»", async () => {
    // Ліміт хвилі — 35 (TELEGRAM_BETA_WAVE_SIZE, дефолт). Мок віддає upsert,
    // потім позицію 36.
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ created: true, id: "36" }] })
      .mockResolvedValueOnce({ rows: [{ position: "36" }] });

    await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", SECRET)
      .send(startUpdate(777000111));

    const text = String(sendMessageMock.mock.calls[0]?.[0]?.text);
    expect(text).toContain("36-й у черзі");
    expect(text).not.toContain("Готово");
  });

  it("35-й ще потрапляє в хвилю", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ created: true, id: "35" }] })
      .mockResolvedValueOnce({ rows: [{ position: "35" }] });

    await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", SECRET)
      .send(startUpdate(777000222));

    const text = String(sendMessageMock.mock.calls[0]?.[0]?.text);
    expect(text).toContain("Готово");
    expect(text).not.toContain("черзі");
  });

  it("невірний секрет → 401 і жодного запиту в базу", async () => {
    const query = vi.fn();
    const res = await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", "wrong")
      .send(statsUpdate(Number(ADMIN_CHAT_ID)));

    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});
