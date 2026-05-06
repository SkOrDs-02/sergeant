import "dotenv/config";
import { Bot } from "grammy";
import Anthropic from "@anthropic-ai/sdk";
import { attachConsoleHandlers } from "./bot.js";
import {
  CONSOLE_GLOBAL_RATE_LIMIT_KEY,
  FixedWindowRateLimiter,
  parseGlobalRateLimitPerMinute,
  parseRateLimitPerMinute,
} from "./security.js";
import { attachOpenClawHandlers } from "./openclaw/index.js";
import {
  registerOpenClawWebhook,
  shouldUseWebhook,
  unregisterOpenClawWebhook,
} from "./openclaw/bootstrap.js";
import { registerOpenClawBotCommands } from "./openclaw/commands.js";
import { createOpenClawWebhookServer } from "./openclaw/webhook.js";
import { startBotWithConflictRetry } from "./startup-conflict-retry.js";

const DEFAULT_OPENCLAW_MAX_ITERATIONS = 8;
const DEFAULT_OPENCLAW_WEBHOOK_PATH = "/webhook/openclaw";
const DEFAULT_OPENCLAW_WEBHOOK_PORT = 8080;

function parseOpenClawMaxIterations(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OPENCLAW_MAX_ITERATIONS;
  }
  return Math.floor(parsed);
}

// M16: HELP_TEXT lives in `./help-text.ts` so the MarkdownV2 snapshot
// test can import it without booting the bot's `main()` side-effect.
export { HELP_TEXT } from "./help-text.js";

async function main() {
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // ADR-0032: Sergeant Console (ADR-0027) consolidated into OpenClaw. The
  // legacy console bot is kept dormant in this process so we can revive it
  // once team scales beyond a solo founder; until then, missing
  // CONSOLE_BOT_TOKEN is the *expected* state, not a fatal error. Match the
  // OpenClaw fail-closed pattern: warn + skip, keep the process alive for
  // whichever bot is actually configured.
  const botToken = process.env["CONSOLE_BOT_TOKEN"];
  let consolePromise: Promise<void> | undefined;
  if (!botToken) {
    console.warn(
      "Sergeant Console not started: CONSOLE_BOT_TOKEN is not set (ADR-0032: dormant; OpenClaw is the active surface).",
    );
  } else {
    const bot = new Bot(botToken);
    // M17 — pair the per-user bucket with a cross-user global cap so an
    // expanded `ALLOWED_USER_IDS` list cannot multiply the bot's
    // aggregate budget linearly. `console.global_rate_cap_hit_total`
    // surfaces deny-by-global events for soak tests / dashboards.
    const limiter = new FixedWindowRateLimiter(
      parseRateLimitPerMinute(process.env["CONSOLE_RATE_LIMIT_PER_MIN"]),
      60_000,
      () => Date.now(),
      {
        key: CONSOLE_GLOBAL_RATE_LIMIT_KEY,
        limit: parseGlobalRateLimitPerMinute(
          process.env["CONSOLE_GLOBAL_RATE_LIMIT_PER_MIN"],
        ),
      },
    );

    attachConsoleHandlers({ bot, anthropic, limiter, env: process.env });

    bot.catch((err) => {
      console.error("Bot error:", err.error, {
        updateId: err.ctx?.update?.update_id,
      });
    });

    console.log("Sergeant Console starting…");
    consolePromise = startBotWithConflictRetry(bot, "console");
  }

  // OpenClaw — DM-only co-founder bot (ADR-0031). Fail-closed якщо env-и не
  // налаштовані — main bot стартує далі, OpenClaw тихо вимкнений з warning-ом.
  const openclawToken = process.env["OPENCLAW_BOT_TOKEN"];
  const founderUserId = process.env["OPENCLAW_FOUNDER_USER_ID"];
  const serverUrl =
    process.env["SERVER_INTERNAL_URL"] ?? "http://localhost:3000";
  const internalApiKey = process.env["INTERNAL_API_KEY"] ?? "";

  let openclawPromise: Promise<void> | undefined;
  if (!openclawToken) {
    console.warn(
      "OpenClaw not started: OPENCLAW_BOT_TOKEN is not set (Phase 1 fail-closed).",
    );
  } else if (!founderUserId) {
    console.warn("OpenClaw not started: OPENCLAW_FOUNDER_USER_ID is not set.");
  } else if (!internalApiKey) {
    console.warn(
      "OpenClaw not started: INTERNAL_API_KEY is not set (server tools unreachable).",
    );
  } else {
    const openclawBot = new Bot(openclawToken);
    attachOpenClawHandlers({
      bot: openclawBot,
      anthropic,
      serverUrl,
      internalApiKey,
      founderUserId,
      maxIterations: parseOpenClawMaxIterations(
        process.env["OPENCLAW_MAX_ITERATIONS"],
      ),
    });

    // ADR-0041: webhook-based delivery cuts approval-button latency from
    // 2-3s (next long-poll cycle) to <500ms. Feature-flag default-off so
    // local dev keeps the long-poll happy path; Railway flips it on per
    // docs/deploy/console.md.
    const useWebhook = shouldUseWebhook(process.env["OPENCLAW_USE_WEBHOOK"]);
    if (useWebhook) {
      const webhookUrl = process.env["OPENCLAW_WEBHOOK_URL"];
      const webhookSecret = process.env["OPENCLAW_WEBHOOK_SECRET"];
      const webhookPath =
        process.env["OPENCLAW_WEBHOOK_PATH"] ?? DEFAULT_OPENCLAW_WEBHOOK_PATH;
      const portRaw =
        process.env["PORT"] ?? process.env["OPENCLAW_WEBHOOK_PORT"];
      const port = Number(portRaw);
      if (!webhookUrl) {
        console.error(
          "OpenClaw webhook mode: OPENCLAW_WEBHOOK_URL is not set.",
        );
        process.exit(1);
      }
      if (!webhookSecret) {
        console.error(
          "OpenClaw webhook mode: OPENCLAW_WEBHOOK_SECRET is not set.",
        );
        process.exit(1);
      }
      if (!Number.isFinite(port) || port <= 0) {
        console.error(
          `OpenClaw webhook mode: PORT/OPENCLAW_WEBHOOK_PORT must be a positive integer (got ${portRaw ?? "unset"}). Defaulting to ${DEFAULT_OPENCLAW_WEBHOOK_PORT}.`,
        );
      }
      const boundPort =
        Number.isFinite(port) && port > 0
          ? port
          : DEFAULT_OPENCLAW_WEBHOOK_PORT;
      const server = createOpenClawWebhookServer({
        bot: openclawBot,
        path: webhookPath,
        secretToken: webhookSecret,
        port: boundPort,
      });
      console.log(
        `OpenClaw starting in webhook mode on :${boundPort}${webhookPath}…`,
      );
      openclawPromise = (async () => {
        await server.start();
        // Bot.api needs `init()` before any API call when we skip
        // `bot.start()`; otherwise `bot.botInfo` is unset.
        await openclawBot.init();
        await registerOpenClawWebhook(openclawBot, {
          url: webhookUrl,
          secretToken: webhookSecret,
        });
        console.log("[openclaw] webhook registered with Telegram");
        // Push the slash-command popup + Menu button so the founder
        // sees the command list in every TG client. Fail-soft inside.
        await registerOpenClawBotCommands(openclawBot);
        // Webhook server keeps the event loop alive; we await an
        // unresolved promise so `Promise.all(promises)` below blocks
        // the same way `bot.start()` did in long-poll mode.
        await new Promise<void>(() => {});
      })();
    } else {
      console.log("OpenClaw starting in long-poll mode…");
      openclawPromise = (async () => {
        // If a previous deploy enabled webhook mode, Telegram still has
        // the webhook registered and `getUpdates` will fail with 409.
        // Detach defensively before starting the long-poll loop.
        try {
          await openclawBot.init();
          await unregisterOpenClawWebhook(openclawBot);
        } catch (err) {
          console.warn(
            "[openclaw] deleteWebhook on long-poll boot failed (non-fatal):",
            err,
          );
        }
        // Same registry-push as the webhook branch — runs once on boot
        // before `bot.start()` enters its blocking long-poll loop.
        await registerOpenClawBotCommands(openclawBot);
        await startBotWithConflictRetry(openclawBot, "openclaw");
      })();
    }
  }

  // Sanity: if neither bot is configured, the process has nothing to do.
  // Exit non-zero so platform restart-loops or operators notice the misconfig
  // (otherwise we'd silently sleep forever holding a Railway slot).
  if (!consolePromise && !openclawPromise) {
    console.error(
      "No bots started: set OPENCLAW_BOT_TOKEN (and friends) or CONSOLE_BOT_TOKEN.",
    );
    process.exit(1);
  }

  const promises: Array<Promise<void>> = [];
  if (consolePromise) promises.push(consolePromise);
  if (openclawPromise) promises.push(openclawPromise);
  await Promise.all(promises);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
