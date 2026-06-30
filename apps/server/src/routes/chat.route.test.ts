import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

// Cold dynamic imports of the full Express app are slow on Windows when this
// route-wiring file runs inside a large parallel batch; keep assertions strict.
vi.setConfig({ testTimeout: 60_000 });

/**
 * Route-level contract tests for `POST /api/chat`.
 *
 * Covers the full HTTP wiring (setModule → rateLimit → requireAnthropicKey →
 * requireAiQuota → asyncHandler) for two paths that `modules/chat/chat.test.ts`
 * (handler-level) and `modules/chat/chat.stream.test.ts` (SSE forwarding) only
 * exercise by calling the handler directly:
 *
 *   1. Key guard: missing `ANTHROPIC_API_KEY` → 503 `ANTHROPIC_KEY_MISSING`.
 *   2. Non-stream tool_use: a first-turn request where Anthropic returns a
 *      `tool_use` block surfaces as `{ tool_calls, tool_calls_raw }`.
 *   3. SSE + tool_use end-to-end: a second-turn request (`stream: true` with
 *      `tool_results` + `tool_calls_raw`) opens the SSE response and forwards
 *      Anthropic text-deltas as `data: {"t":"…"}` events, terminated by
 *      `[DONE]`.
 *
 * AI-CONTEXT: env single-source migration.  `requireAnthropicKey` reads
 * `env.ANTHROPIC_API_KEY` (validated Zod env captured at first load of
 * `apps/server/src/env/env.ts`), so the canonical pattern from
 * `apps/server/src/routes/coach.route.test.ts` applies: `vi.stubEnv` BEFORE a
 * `vi.resetModules()` + dynamic `import("./../app.js")`.  `vi.mock` calls are
 * hoisted and persist across `vi.resetModules`, so the anthropic mock stays
 * wired through every re-import.
 */

const { mockPool, queryMock, getSessionUserMock } = vi.hoisted(() => {
  const queryMock = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
  const mockPool = {
    query: queryMock,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  const getSessionUserMock = vi.fn().mockResolvedValue(null);
  return { mockPool, queryMock, getSessionUserMock };
});

vi.mock("./../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

const { anthropicMessagesMock, anthropicMessagesStreamMock } = vi.hoisted(
  () => ({
    anthropicMessagesMock: vi.fn(),
    anthropicMessagesStreamMock: vi.fn(),
  }),
);

vi.mock("./../lib/anthropic.js", () => ({
  anthropicMessages: anthropicMessagesMock,
  anthropicMessagesStream: anthropicMessagesStreamMock,
  extractAnthropicText: vi.fn(
    (d: { content?: { type: string; text?: string }[] }) =>
      (d?.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim(),
  ),
  recordAnthropicUsage: vi.fn(),
}));

// `chat` router stacks `rateLimitExpress({ key: "api:chat", … })` before the
// handler. Mock it as passthrough so a rate-limit Postgres-fallback query does
// not consume a `queryMock.mockResolvedValueOnce`. The limiter has its own
// `http/rateLimit.test.ts`.
vi.mock("./../http/rateLimit.js", async () => {
  const actual = await vi.importActual<typeof import("./../http/rateLimit.js")>(
    "./../http/rateLimit.js",
  );
  return {
    ...actual,
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

/** Builds a fetch-`Response` whose body streams `data: <json>\n\n` × N. */
function makeUpstreamSse(events: Array<Record<string, unknown>>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function loadCreateApp(): Promise<
  (typeof import("./../app.js"))["createApp"]
> {
  vi.resetModules();
  const mod = await import("./../app.js");
  return mod.createApp;
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue(null);
  anthropicMessagesMock.mockReset();
  anthropicMessagesStreamMock.mockReset();
  // Default: no Anthropic key (covers the key-guard test). Quota disabled so
  // `requireAiQuota` is a no-op (it reads `process.env.AI_QUOTA_DISABLED` at
  // runtime — no re-import needed).
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_QUOTA_DISABLED", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("chat route — key guard", () => {
  it("POST /api/chat → 503 без ANTHROPIC_API_KEY", async () => {
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/chat")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ messages: [{ role: "user", content: "Привіт" }] });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "ANTHROPIC_KEY_MISSING" });
  });
});

describe("chat route — non-stream tool_use", () => {
  it("повертає { tool_calls, tool_calls_raw } коли Anthropic присилає tool_use", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    anthropicMessagesMock.mockResolvedValue({
      response: { ok: true, status: 200 } as unknown as Response,
      data: {
        content: [
          { type: "text", text: "Видаляю…" },
          {
            type: "tool_use",
            id: "toolu_01ABC",
            name: "delete_transaction",
            input: { tx_id: "m_abc123" },
          },
        ],
        stop_reason: "tool_use",
      },
    });

    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/chat")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({
        messages: [{ role: "user", content: "Видали транзакцію m_abc123" }],
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      text: "Видаляю…",
      tool_calls: [
        {
          id: "toolu_01ABC",
          name: "delete_transaction",
          input: { tx_id: "m_abc123" },
        },
      ],
    });
    expect(Array.isArray(res.body.tool_calls_raw)).toBe(true);
  });
});

describe("chat route — SSE + tool_use end-to-end", () => {
  it("stream:true з tool_results форвардить text-дельти і завершує [DONE]", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    anthropicMessagesStreamMock.mockResolvedValue({
      response: makeUpstreamSse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Готово, " },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "транзакцію видалено." },
        },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/chat")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({
        stream: true,
        messages: [{ role: "user", content: "Видали транзакцію m_abc123" }],
        tool_calls_raw: [
          {
            type: "tool_use",
            id: "toolu_01ABC",
            name: "delete_transaction",
            input: { tx_id: "m_abc123" },
          },
        ],
        tool_results: [{ tool_use_id: "toolu_01ABC", content: "ok" }],
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    // supertest buffers the whole SSE body into `res.text`.
    expect(res.text).toContain(`data: ${JSON.stringify({ t: "Готово, " })}`);
    expect(res.text).toContain(
      `data: ${JSON.stringify({ t: "транзакцію видалено." })}`,
    );
    expect(res.text).toContain("data: [DONE]");
    expect(anthropicMessagesStreamMock).toHaveBeenCalledTimes(1);
  });
});
