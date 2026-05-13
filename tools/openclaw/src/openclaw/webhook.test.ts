import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Bot } from "grammy";
import {
  createOpenClawWebhookServer,
  type OpenClawWebhookServer,
} from "./webhook.js";

/**
 * These tests spin up a real `node:http` listener on a random free port
 * (`port: 0`) and exercise the webhook server end-to-end with `fetch`.
 * grammy is given a `Bot` whose `init()` was satisfied with a synthetic
 * `botInfo` so we never reach Telegram's API. Each test must `start()`
 * before requesting and `stop()` afterwards — otherwise vitest leaks
 * sockets and the worker never exits.
 */
const SECRET = "test-secret-token-1234567890-abcdef";

function makeBot(): Bot {
  const bot = new Bot("0:fake-token");
  // Bypass Telegram's `getMe()` so we don't hit the network.
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: "OpenClawTest",
    username: "openclaw_test_bot",
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    can_manage_bots: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
  };
  return bot;
}

function makeUpdate(seenInHandler: { value: boolean }) {
  // Synthetic `message` update; we register a listener so the test can
  // assert grammy actually dispatched it.
  return {
    update_id: 42,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 100, type: "private", first_name: "x" },
      from: { id: 100, is_bot: false, first_name: "x" },
      text: "hello",
    },
    _seen: seenInHandler,
  };
}

describe("createOpenClawWebhookServer", () => {
  let server: OpenClawWebhookServer | undefined;
  let baseUrl: string | undefined;

  beforeEach(async () => {
    const bot = makeBot();
    bot.on("message:text", (ctx) => {
      // Tag the bot with a marker so the test can verify dispatch.
      (bot as unknown as { _lastMessage?: string })._lastMessage =
        ctx.message.text;
    });
    server = createOpenClawWebhookServer({
      bot,
      path: "/webhook/openclaw",
      secretToken: SECRET,
      port: 0,
    });
    const { port } = await server.start();
    baseUrl = `http://127.0.0.1:${port}`;
    // Stash bot for the assertions in tests that care.
    (server as unknown as { _bot: Bot })._bot = bot;
  });

  afterEach(async () => {
    if (server) await server.stop();
    server = undefined;
    baseUrl = undefined;
  });

  it("GET /healthz returns 200 ok", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("unknown path returns 404", async () => {
    const res = await fetch(`${baseUrl}/anything-else`);
    expect(res.status).toBe(404);
  });

  it("POST to webhook path without secret-token header → 401", async () => {
    const res = await fetch(`${baseUrl}/webhook/openclaw`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeUpdate({ value: false })),
    });
    expect(res.status).toBe(401);
  });

  it("POST to webhook path with WRONG secret-token header → 401", async () => {
    const res = await fetch(`${baseUrl}/webhook/openclaw`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong",
      },
      body: JSON.stringify(makeUpdate({ value: false })),
    });
    expect(res.status).toBe(401);
  });

  it("POST with valid secret-token dispatches update and returns 200", async () => {
    const res = await fetch(`${baseUrl}/webhook/openclaw`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": SECRET,
      },
      body: JSON.stringify(makeUpdate({ value: false })),
    });
    expect(res.status).toBe(200);
    const bot = (server as unknown as { _bot: Bot })._bot;
    expect((bot as unknown as { _lastMessage?: string })._lastMessage).toBe(
      "hello",
    );
  });

  it("GET on the webhook path returns 404 (POST-only)", async () => {
    const res = await fetch(`${baseUrl}/webhook/openclaw`);
    expect(res.status).toBe(404);
  });
});
