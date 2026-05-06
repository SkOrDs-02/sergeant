/**
 * E2E-тест Sergeant Console bot — feed-ить грамі-update через
 * `bot.handleUpdate(...)` без long-poll, без мережі і без ANTHROPIC_API_KEY.
 *
 * Покриваємо happy path кожного хендлера, плюс security/rate-limit gates:
 *
 * - `/start` → HELP_TEXT (для allowed user) / "Access denied." (для inший-id).
 * - `/help` → HELP_TEXT (для allowed user) / silently swallowed (для іншого).
 * - `message:text` → `parseCommand` → `dispatchToAgent` → escape + chunk →
 *   `ctx.reply(MarkdownV2)` reply per chunk.
 * - rate-limit denial returns "Rate limit exceeded." replies.
 * - dispatch error пише "Agent error. Try again."
 *
 * Вибір технології: грамі офіційно не має «test bot helper», але
 * `Bot.handleUpdate(update)` плюс `bot.api.config.use(transformer)` — це той
 * самий потік, який у проді. Підмінюємо `bot.botInfo` синтетичним об'єктом,
 * щоб `bot.init()` не йшов до Telegram, та реєструємо transformer, який
 * перехоплює усі outgoing API-виклики (sendMessage, sendChatAction).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Bot, type Context } from "grammy";
import type Anthropic from "@anthropic-ai/sdk";
import { attachConsoleHandlers } from "../bot.js";
import { FixedWindowRateLimiter } from "../security.js";
import { HELP_TEXT } from "../help-text.js";

const ALLOWED_USER_ID = 4242;
const ALLOWED_USER_ID_STR = String(ALLOWED_USER_ID);
const DENIED_USER_ID = 9999;

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

function makeBot(): { bot: Bot; calls: ApiCall[] } {
  const bot = new Bot("0:fake-token");
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: "ConsoleTest",
    username: "console_test_bot",
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    can_manage_bots: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
  };
  const calls: ApiCall[] = [];
  // Transformer перехоплює усі outgoing-виклики API; повертаємо мінімально
  // валідний `Message`-stub для sendMessage / boolean для sendChatAction.
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (method === "sendMessage") {
      return Promise.resolve({
        ok: true,
        result: {
          message_id: Math.floor(Math.random() * 1_000_000),
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: (payload as { chat_id?: number }).chat_id ?? 0,
            type: "private",
          },
          text: (payload as { text?: string }).text ?? "",
        },
      } as never);
    }
    return Promise.resolve({ ok: true, result: true } as never);
  });
  return { bot, calls };
}

function makeUpdate(overrides: {
  text: string;
  fromId?: number;
  chatId?: number;
  messageId?: number;
  updateId?: number;
}): Parameters<Context["update"] extends infer U ? (u: U) => void : never>[0] {
  // Грамі очікує shape `Update` з telegram-typings; ми звужуємо до того, що
  // дійсно читають хендлери (`from.id`, `chat.id`, `message.text`,
  // `message.message_id`).
  //
  // `bot.command("start")` вимагає `entities: [{ type: "bot_command",
  // offset: 0, length }]` (див. node_modules/grammy/out/context.js:22-42),
  // інакше message-filter повертає false. Прод-Telegram завжди надсилає ці
  // entities; синтетичний update мусить дзеркалити.
  const text = overrides.text;
  const entities = text.startsWith("/")
    ? [
        {
          type: "bot_command",
          offset: 0,
          length: (text.split(/\s/, 1)[0] ?? text).length,
        },
      ]
    : [];
  return {
    update_id: overrides.updateId ?? 1,
    message: {
      message_id: overrides.messageId ?? 100,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: overrides.chatId ?? overrides.fromId ?? ALLOWED_USER_ID,
        type: "private",
        first_name: "x",
      },
      from: {
        id: overrides.fromId ?? ALLOWED_USER_ID,
        is_bot: false,
        first_name: "x",
      },
      text,
      entities,
    },
  } as unknown as Parameters<
    Context["update"] extends infer U ? (u: U) => void : never
  >[0];
}

const ANTHROPIC_STUB = {} as unknown as Anthropic;

function freshLimiter(perUser = 10): FixedWindowRateLimiter {
  return new FixedWindowRateLimiter(perUser, 60_000, () => Date.now());
}

describe("Sergeant Console bot — handleUpdate e2e", () => {
  const env = { ALLOWED_USER_IDS: ALLOWED_USER_ID_STR };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("/start", () => {
    it("повертає HELP_TEXT з parse_mode MarkdownV2 для allowed user", async () => {
      const { bot, calls } = makeBot();
      attachConsoleHandlers({
        bot,
        anthropic: ANTHROPIC_STUB,
        limiter: freshLimiter(),
        env,
      });
      await bot.handleUpdate(
        makeUpdate({ text: "/start", fromId: ALLOWED_USER_ID }),
      );
      const sendMessage = calls.filter((c) => c.method === "sendMessage");
      expect(sendMessage).toHaveLength(1);
      expect(sendMessage[0]?.payload["text"]).toBe(HELP_TEXT);
      expect(sendMessage[0]?.payload["parse_mode"]).toBe("MarkdownV2");
    });

    it("відповідає 'Access denied.' для не-allowed user", async () => {
      const { bot, calls } = makeBot();
      attachConsoleHandlers({
        bot,
        anthropic: ANTHROPIC_STUB,
        limiter: freshLimiter(),
        env,
      });
      await bot.handleUpdate(
        makeUpdate({ text: "/start", fromId: DENIED_USER_ID }),
      );
      const sendMessage = calls.filter((c) => c.method === "sendMessage");
      expect(sendMessage).toHaveLength(1);
      expect(sendMessage[0]?.payload["text"]).toBe("Access denied.");
      // У відмові parse_mode не виставлений — без MarkdownV2 escaping.
      expect(sendMessage[0]?.payload["parse_mode"]).toBeUndefined();
    });
  });

  describe("/help", () => {
    it("повертає HELP_TEXT для allowed user", async () => {
      const { bot, calls } = makeBot();
      attachConsoleHandlers({
        bot,
        anthropic: ANTHROPIC_STUB,
        limiter: freshLimiter(),
        env,
      });
      await bot.handleUpdate(
        makeUpdate({ text: "/help", fromId: ALLOWED_USER_ID }),
      );
      const sendMessage = calls.filter((c) => c.method === "sendMessage");
      expect(sendMessage).toHaveLength(1);
      expect(sendMessage[0]?.payload["text"]).toBe(HELP_TEXT);
    });

    it("мовчить для не-allowed user (no reply, no error)", async () => {
      const { bot, calls } = makeBot();
      attachConsoleHandlers({
        bot,
        anthropic: ANTHROPIC_STUB,
        limiter: freshLimiter(),
        env,
      });
      await bot.handleUpdate(
        makeUpdate({ text: "/help", fromId: DENIED_USER_ID }),
      );
      // /help в non-allow-listed випадку — silent (асиметрія до /start).
      expect(calls).toHaveLength(0);
    });
  });

  describe("message:text dispatch", () => {
    it("викликає dispatchToAgent з parsed (agent, query) і шле escaped reply", async () => {
      const { bot, calls } = makeBot();
      const dispatchToAgent = vi
        .fn()
        .mockResolvedValueOnce("Production health: OK. Version 4.2.1");
      attachConsoleHandlers({
        bot,
        anthropic: ANTHROPIC_STUB,
        limiter: freshLimiter(),
        env,
        dispatchToAgent,
      });
      await bot.handleUpdate(
        makeUpdate({
          text: "/ops show prod status",
          fromId: ALLOWED_USER_ID,
          messageId: 555,
        }),
      );
      expect(dispatchToAgent).toHaveBeenCalledTimes(1);
      const [, agent, query, telegramCtx] = dispatchToAgent.mock.calls[0]!;
      expect(agent).toBe("ops");
      expect(query).toBe("show prod status");
      expect(telegramCtx).toEqual({
        telegramUserId: ALLOWED_USER_ID,
        telegramChatId: ALLOWED_USER_ID,
        messageId: 555,
      });

      // Очікуємо: 1 sendChatAction("typing") + 1 sendMessage (короткий reply).
      const chatActions = calls.filter((c) => c.method === "sendChatAction");
      const messages = calls.filter((c) => c.method === "sendMessage");
      expect(chatActions).toHaveLength(1);
      expect(chatActions[0]?.payload["action"]).toBe("typing");
      expect(messages).toHaveLength(1);
      expect(messages[0]?.payload["parse_mode"]).toBe("MarkdownV2");
      // MarkdownV2 escape тримає `.` як `\.`, version `4.2.1` → `4\.2\.1`.
      expect(messages[0]?.payload["text"]).toContain("Production health: OK");
      expect(messages[0]?.payload["text"]).toMatch(/4\\.2\\.1/);
    });

    it("розбиває довгий reply на кілька MarkdownV2 chunk-ів", async () => {
      const { bot, calls } = makeBot();
      const longReply = "x".repeat(8_000); // > 4096 → minimum 2 chunks
      const dispatchToAgent = vi.fn().mockResolvedValueOnce(longReply);
      attachConsoleHandlers({
        bot,
        anthropic: ANTHROPIC_STUB,
        limiter: freshLimiter(),
        env,
        dispatchToAgent,
      });
      await bot.handleUpdate(
        makeUpdate({ text: "ping", fromId: ALLOWED_USER_ID }),
      );
      const messages = calls.filter((c) => c.method === "sendMessage");
      expect(messages.length).toBeGreaterThanOrEqual(2);
      for (const msg of messages) {
        // Telegram cap = 4096 chars per message.
        expect(String(msg.payload["text"]).length).toBeLessThanOrEqual(4096);
        expect(msg.payload["parse_mode"]).toBe("MarkdownV2");
      }
    });

    it("на rate-limit deny шле 'Rate limit exceeded.'", async () => {
      const { bot, calls } = makeBot();
      const limiter = freshLimiter(1); // 1 req/min — другий буде denied
      const dispatchToAgent = vi.fn().mockResolvedValue("ok");
      attachConsoleHandlers({
        bot,
        anthropic: ANTHROPIC_STUB,
        limiter,
        env,
        dispatchToAgent,
      });
      // Перший update проходить.
      await bot.handleUpdate(
        makeUpdate({ text: "ping", fromId: ALLOWED_USER_ID, updateId: 1 }),
      );
      // Другий — rate-limited.
      await bot.handleUpdate(
        makeUpdate({ text: "ping", fromId: ALLOWED_USER_ID, updateId: 2 }),
      );
      const messages = calls.filter((c) => c.method === "sendMessage");
      // Перший update: 1 reply (escaped "ok"). Другий: 1 reply (rate-limit).
      const denyReplies = messages.filter(
        (m) =>
          m.payload["text"] === "Rate limit exceeded. Try again in a minute.",
      );
      expect(denyReplies).toHaveLength(1);
      // Друге звернення НЕ викликає dispatchToAgent.
      expect(dispatchToAgent).toHaveBeenCalledTimes(1);
    });

    it("не-allowed user отримує 'Access denied.' і не доходить до dispatch", async () => {
      const { bot, calls } = makeBot();
      const dispatchToAgent = vi.fn().mockResolvedValue("never");
      attachConsoleHandlers({
        bot,
        anthropic: ANTHROPIC_STUB,
        limiter: freshLimiter(),
        env,
        dispatchToAgent,
      });
      await bot.handleUpdate(
        makeUpdate({ text: "ping", fromId: DENIED_USER_ID }),
      );
      expect(dispatchToAgent).not.toHaveBeenCalled();
      const messages = calls.filter((c) => c.method === "sendMessage");
      expect(messages).toHaveLength(1);
      expect(messages[0]?.payload["text"]).toBe("Access denied.");
    });

    it("на dispatch error шле 'Agent error. Try again.'", async () => {
      const { bot, calls } = makeBot();
      const dispatchToAgent = vi
        .fn()
        .mockRejectedValueOnce(new Error("anthropic 500"));
      // console.error сам по собі не валить — але глушимо щоб не шуміти у CI.
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      attachConsoleHandlers({
        bot,
        anthropic: ANTHROPIC_STUB,
        limiter: freshLimiter(),
        env,
        dispatchToAgent,
      });
      await bot.handleUpdate(
        makeUpdate({ text: "ping", fromId: ALLOWED_USER_ID }),
      );
      const messages = calls.filter((c) => c.method === "sendMessage");
      expect(messages).toHaveLength(1);
      expect(messages[0]?.payload["text"]).toBe("Agent error. Try again.");
      expect(errorSpy).toHaveBeenCalledWith("Agent error:", expect.any(Error));
    });
  });
});
