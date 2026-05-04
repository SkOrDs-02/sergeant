/**
 * OpenClaw webhook HTTP server (ADR-0041).
 *
 * Telegram delivers updates to a single public URL via HTTPS POST. We
 * terminate TLS at Railway's edge and serve plain HTTP inside the
 * container. grammy's `webhookCallback` adapter does the heavy lifting
 * (deserialise update → run middleware → fast 200 ack); this module just
 * wraps it in a `node:http` server with a `/healthz` probe and a single
 * known POST path.
 *
 * Why not use `apps/server` (Express)? OpenClaw bot lives in
 * `tools/console` together with `ApprovalStore` and `OpenClawSessionStore`
 * — both in-process state. Routing webhooks through `apps/server` would
 * either require IPC or cross-service HTTP fan-out. Hosting the webhook
 * inside the same Node process keeps the data path one hop shorter and
 * avoids a new failure mode.
 *
 * Security: grammy's `secretToken` option compares the
 * `X-Telegram-Bot-Api-Secret-Token` request header against the value we
 * passed to `setWebhook` and returns 401 on mismatch. This is
 * defence-in-depth on top of HTTPS — without it any caller who learns
 * the public URL could push fake updates.
 */
import { createServer, type Server } from "node:http";
import type { Bot } from "grammy";
import { webhookCallback } from "grammy";

export interface OpenClawWebhookServerOptions {
  /** grammy `Bot` instance with handlers already attached. */
  bot: Bot;
  /** Path to listen on (e.g. `/webhook/openclaw`). Anything else 404s. */
  path: string;
  /**
   * Shared secret. Telegram echoes it in
   * `X-Telegram-Bot-Api-Secret-Token`; mismatched / missing → 401.
   * Min 1 char per Telegram API; we recommend ≥32 chars in env config.
   */
  secretToken: string;
  /** TCP port to bind. Use `0` in tests to get a random free port. */
  port: number;
}

export interface OpenClawWebhookServer {
  /** Start listening. Resolves once the socket is bound. */
  start(): Promise<{ port: number }>;
  /** Stop listening. Resolves once all in-flight requests complete. */
  stop(): Promise<void>;
}

/**
 * Build (but do not start) an HTTP server that routes Telegram updates
 * into the supplied grammy `Bot`. Returned object exposes `start` /
 * `stop` for explicit lifecycle control — caller is expected to await
 * `start()` once and `stop()` only on shutdown.
 */
export function createOpenClawWebhookServer(
  options: OpenClawWebhookServerOptions,
): OpenClawWebhookServer {
  const { bot, path, secretToken, port } = options;

  const handleUpdate = webhookCallback(bot, "http", { secretToken });

  const server: Server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method === "GET" && url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    if (req.method === "POST" && url === path) {
      void handleUpdate(req, res).catch((err) => {
        console.error("[openclaw] webhook handler error", err);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end("internal error");
        }
      });
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });

  return {
    start() {
      return new Promise((resolve, reject) => {
        const onError = (err: Error) => {
          server.off("listening", onListen);
          reject(err);
        };
        const onListen = () => {
          server.off("error", onError);
          const addr = server.address();
          const boundPort =
            typeof addr === "object" && addr !== null ? addr.port : port;
          resolve({ port: boundPort });
        };
        server.once("error", onError);
        server.once("listening", onListen);
        server.listen(port);
      });
    },
    stop() {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
