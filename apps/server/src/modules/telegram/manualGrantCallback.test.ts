import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { TelegramApiClient } from "../alerts/telegramShipper.js";
import {
  grantToastText,
  grantedMessageText,
  handleManualGrantCallback,
  isAdminGrantCallback,
  parseManualGrantCallback,
  type ManualGrantCallback,
} from "./manualGrantCallback.js";
import type { TelegramUpdate } from "./waitlistBot.js";

const ADMIN = "555000111";

function update(
  data: string | undefined,
  id: string | null = "cbq-1",
): TelegramUpdate {
  return {
    callback_query: {
      ...(id === null ? {} : { id }),
      from: { id: Number(ADMIN), is_bot: false },
      message: { message_id: 7, chat: { id: Number(ADMIN), type: "private" } },
      ...(data === undefined ? {} : { data }),
    },
  };
}

describe("parseManualGrantCallback", () => {
  it("розбирає mp:grant:<id>", () => {
    expect(parseManualGrantCallback(update("mp:grant:42"))).toEqual({
      requestId: "42",
      callbackQueryId: "cbq-1",
      chatId: Number(ADMIN),
      chatType: "private",
      fromId: Number(ADMIN),
      messageId: 7,
    });
    expect(
      parseManualGrantCallback(update("mp:grant:123456789012345678")),
    ).toMatchObject({ requestId: "123456789012345678" });
  });

  it.each([
    "mp:grant:abc",
    "mp:grant:0",
    "mp:grant:01",
    "mp:grant:",
    "mp:grant:1234567890123456789",
    "mp:revoke:1",
  ])("биті дані %j: ignore", (data) => {
    expect(parseManualGrantCallback(update(data))).toBe("ignore");
  });

  it("без id callback-а: ignore", () => {
    expect(parseManualGrantCallback(update("mp:grant:1", null))).toBe("ignore");
  });

  it("не наш апдейт: null (далі звичайний парсер)", () => {
    expect(parseManualGrantCallback(update("survey:q1:yes"))).toBeNull();
    expect(parseManualGrantCallback(update(undefined))).toBeNull();
    expect(
      parseManualGrantCallback({ message: { text: "/start" } }),
    ).toBeNull();
  });
});

describe("isAdminGrantCallback", () => {
  const base: ManualGrantCallback = {
    requestId: "1",
    callbackQueryId: "cbq",
    chatId: Number(ADMIN),
    chatType: "private",
    fromId: Number(ADMIN),
    messageId: 7,
  };

  it("власник у приватному чаті", () => {
    expect(isAdminGrantCallback(base, ADMIN)).toBe(true);
  });

  it.each([
    ["чужий чат", { chatId: 1 }],
    ["чужий from", { fromId: 1 }],
    ["група", { chatType: "group" }],
    ["без chat id", { chatId: null }],
  ])("%s: ні", (_l, over) => {
    expect(isAdminGrantCallback({ ...base, ...over }, ADMIN)).toBe(false);
  });

  it("порожній ADMIN_CHAT_ID: ні", () => {
    expect(isAdminGrantCallback(base, "")).toBe(false);
  });
});

describe("тексти боту", () => {
  const END = new Date("2026-12-17T23:30:00Z"); // 18.12 за Києвом

  it("дата за Києвом", () => {
    expect(grantedMessageText("9", END)).toBe(
      "Запит Premium #9 · видано до 18.12.2026",
    );
    expect(grantToastText({ ok: true, currentPeriodEnd: END })).toBe(
      "Видано до 18.12.2026",
    );
  });

  it.each([
    ["ALREADY_GRANTED", "Уже видано"],
    ["ALREADY_PREMIUM", "У людини вже є Premium"],
    ["REQUEST_NOT_FOUND", "Запит не знайдено"],
    ["USER_GONE", "Акаунт видалено"],
  ] as const)("%s", (reason, text) => {
    expect(grantToastText({ ok: false, reason })).toBe(text);
  });
});

describe("handleManualGrantCallback", () => {
  it("помилка квитанції не валить обробку", async () => {
    const client = {
      sendMessage: vi.fn(),
      editMessageText: vi.fn(),
      answerCallbackQuery: vi.fn().mockRejectedValue(new Error("net")),
    } as unknown as TelegramApiClient;
    const grant = vi.fn().mockResolvedValue({
      ok: false,
      reason: "ALREADY_PREMIUM",
    });
    const cb = parseManualGrantCallback(update("mp:grant:5"));
    if (cb === null || cb === "ignore") throw new Error("parse failed");
    await expect(
      handleManualGrantCallback({} as Pool, client, cb, grant),
    ).resolves.toBeUndefined();
    expect(grant).toHaveBeenCalledWith({}, "5");
  });
});
