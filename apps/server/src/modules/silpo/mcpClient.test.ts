import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  recordExternalHttp: vi.fn(),
}));

vi.mock("../../obs/logger.js", () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn() },
}));

vi.mock("../../lib/externalHttp.js", () => ({
  recordExternalHttp: mocks.recordExternalHttp,
}));

vi.mock("../../env/env.js", () => ({
  env: { SILPO_MCP_URL: "https://mcp.silpo.ua/mcp" },
}));

import {
  callMcpTool,
  listMcpTools,
  mcpInitialize,
  probeMcpTool,
  SILPO_MCP_MAX_BODY_BYTES,
  SILPO_REFUSAL_LOG_MAX_CHARS,
  __silpoMcpTestHooks,
} from "./mcpClient.js";

function jsonResponse(
  body: unknown,
  init: { status?: number; sessionId?: string } = {},
): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (init.sessionId) headers["mcp-session-id"] = init.sessionId;
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

function fetchMock(): Mock {
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  return mock as Mock;
}

const INIT_RESULT = {
  jsonrpc: "2.0" as const,
  id: 1,
  result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: {} },
};

beforeEach(() => {
  mocks.recordExternalHttp.mockReset();
  mocks.loggerWarn.mockReset();
  __silpoMcpTestHooks().resetBreaker();
  __silpoMcpTestHooks().resetSessionCache();
  __silpoMcpTestHooks().setRetryDelaysMs([0, 0, 0]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mcpInitialize", () => {
  it("returns the session id from the Mcp-Session-Id response header", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT, { sessionId: "sess-1" }))
      .mockResolvedValueOnce(new Response(null, { status: 202 })); // notifications/initialized

    const result = await mcpInitialize("token-abc");

    expect(result).toEqual({ ok: true, data: { sessionId: "sess-1" } });
    expect(mock).toHaveBeenCalledTimes(2);
    const [, initInit] = mock.mock.calls[0] as [string, RequestInit];
    expect((initInit.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer token-abc",
    );
  });

  it("surfaces auth_required on HTTP 401 without retrying", async () => {
    const mock = fetchMock();
    mock.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    const result = await mcpInitialize("expired-token");

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "auth_required",
        message: "Silpo access token invalid or expired",
        status: 401,
      },
    });
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe("callMcpTool", () => {
  const schema = z
    .object({ receipts: z.array(z.object({ id: z.string() }).passthrough()) })
    .passthrough();

  it("happy path: parses structuredContent through the provided schema", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT, { sessionId: "sess-1" }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            structuredContent: { receipts: [{ id: "r1" }] },
          },
        }),
      );

    const result = await callMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_get_my_offline_orders",
      schema,
    });

    expect(result).toEqual({ ok: true, data: { receipts: [{ id: "r1" }] } });
  });

  it("falls back to parsing content[0].text as JSON", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            content: [{ type: "text", text: JSON.stringify({ receipts: [] }) }],
          },
        }),
      );

    const result = await callMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_get_my_online_orders",
      schema,
    });

    expect(result).toEqual({ ok: true, data: { receipts: [] } });
  });

  it("degrades to schema_drift when a required field is missing (never throws)", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: { structuredContent: { totallyDifferentField: true } },
        }),
      );

    const result = await callMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_get_my_offline_orders",
      schema,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("schema_drift");
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "silpo_mcp_schema_drift" }),
    );
  });

  it("isError:true is a tool refusal, not schema drift — and carries Silpo's text", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            isError: true,
            content: [{ type: "text", text: "Rate limit exceeded" }],
          },
        }),
      );

    const result = await callMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_get_my_online_orders",
      schema,
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: "tool_error", message: "Rate limit exceeded" },
    });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "silpo_mcp_tool_error",
        detail: "Rate limit exceeded",
        detailLength: "Rate limit exceeded".length,
      }),
    );
    // Помилка виконання ≠ дрейф контракту: алерт про дрейф не має дзвонити.
    expect(mocks.loggerWarn).not.toHaveBeenCalledWith(
      expect.objectContaining({ msg: "silpo_mcp_schema_drift" }),
    );
  });

  it("a long refusal is cut in the log, the error keeps the full text", async () => {
    const long = "x".repeat(SILPO_REFUSAL_LOG_MAX_CHARS + 50);
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: { isError: true, content: [{ type: "text", text: long }] },
        }),
      );

    const result = await callMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_get_my_online_orders",
      schema,
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: "tool_error", message: long },
    });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "silpo_mcp_tool_error",
        detail: long.slice(0, SILPO_REFUSAL_LOG_MAX_CHARS),
        detailLength: long.length,
      }),
    );
  });

  it("an auth-flavoured refusal becomes auth_required so the refresh dance still runs", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            isError: true,
            content: [{ type: "text", text: "Unauthorized: token expired" }],
          },
        }),
      );

    const result = await callMcpTool({
      accessToken: "stale-token",
      toolName: "silpo_get_my_online_orders",
      schema,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("auth_required");
  });

  it("число 401/403 всередині id товару — це tool_error, а не auth_required (rel-23)", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            isError: true,
            content: [
              { type: "text", text: "Товар 3401567 відсутній у філії" },
            ],
          },
        }),
      );

    const result = await callMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_get_product_details",
      schema,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "tool_error",
        message: "Товар 3401567 відсутній у філії",
      },
    });
  });

  it("a refusal with no text still refuses instead of masquerading as drift", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({ jsonrpc: "2.0", id: 2, result: { isError: true } }),
      );

    const result = await callMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_get_my_online_orders",
      schema,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("tool_error");
  });

  it("isError:false with a valid payload stays the happy path", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            isError: false,
            structuredContent: { receipts: [{ id: "r1" }] },
          },
        }),
      );

    const result = await callMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_get_my_online_orders",
      schema,
    });

    expect(result).toEqual({ ok: true, data: { receipts: [{ id: "r1" }] } });
  });

  it("propagates auth_required from the tools/call step (not just initialize)", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    const result = await callMcpTool({
      accessToken: "stale-token",
      toolName: "silpo_get_my_offline_orders",
      schema,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "auth_required",
        message: "Silpo access token invalid or expired",
        status: 401,
      },
    });
  });
});

describe("429 backoff", () => {
  it("retries on 429 and eventually succeeds", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT, { sessionId: "s1" }))
      .mockResolvedValueOnce(new Response(null, { status: 202 })); // notifications/initialized

    const result = await mcpInitialize("token-abc");

    expect(result.ok).toBe(true);
    expect(mock).toHaveBeenCalledTimes(3); // 429 retry + success + best-effort notification
    expect(mocks.recordExternalHttp).toHaveBeenCalledWith(
      "silpo",
      "rate_limited",
      expect.any(Number),
    );
  });

  it("returns rate_limited once retries are exhausted", async () => {
    const mock = fetchMock();
    mock.mockImplementation(
      async () => new Response("rate limited", { status: 429 }),
    );

    const result = await mcpInitialize("token-abc");

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "rate_limited",
        message: "Silpo MCP rate limit",
        status: 429,
      },
    });
    expect(mock).toHaveBeenCalledTimes(3); // retryDelaysMs has 3 entries in this suite
  });
});

describe("дедлайн викликача (AbortSignal) — rel-22", () => {
  /** fetch, що ніколи не відповідає сам: завершується лише з сигналом. */
  function hangingFetch(): Mock {
    const mock = fetchMock();
    mock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    );
    return mock;
  }

  it("аборт зовнішнього сигналу на першій спробі: рівно 1 HTTP-запит, без ретраїв", async () => {
    __silpoMcpTestHooks().setRetryDelaysMs([0, 0, 0]);
    const mock = hangingFetch();
    const deadline = new AbortController();

    const pending = mcpInitialize("token-abc", deadline.signal);
    deadline.abort();
    const result = await pending;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("upstream_unavailable");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("5+ абортів поспіль не відкривають breaker для решти користувачів", async () => {
    const mock = hangingFetch();

    for (let i = 0; i < 6; i++) {
      const deadline = new AbortController();
      const pending = mcpInitialize("token-abc", deadline.signal);
      deadline.abort();
      await pending;
    }
    expect(mock).toHaveBeenCalledTimes(6);

    // Здоровий виклик без сигналу проходить до fetch, а не впирається в
    // "circuit open".
    mock.mockReset();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const healthy = await mcpInitialize("token-abc");
    expect(healthy.ok).toBe(true);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("вже скасований сигнал: жодного HTTP-запиту", async () => {
    const mock = fetchMock();
    const result = await callMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_find_products_batch",
      schema: z.object({}).passthrough(),
      signal: AbortSignal.abort(),
    });

    expect(result.ok).toBe(false);
    expect(mock).not.toHaveBeenCalled();
  });

  it("аборт між ретраями (429) зупиняє наступні спроби", async () => {
    __silpoMcpTestHooks().setRetryDelaysMs([0, 0, 0]);
    const deadline = new AbortController();
    const mock = fetchMock();
    mock.mockImplementation(async () => {
      deadline.abort();
      return new Response("slow down", { status: 429 });
    });

    const result = await mcpInitialize("token-abc", deadline.signal);

    expect(result.ok).toBe(false);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("notifications/initialized не шлеться, якщо сигнал сплив після initialize", async () => {
    const deadline = new AbortController();
    const mock = fetchMock();
    mock.mockImplementationOnce(async () => {
      const res = jsonResponse(INIT_RESULT, { sessionId: "sess-1" });
      deadline.abort();
      return res;
    });

    await mcpInitialize("token-abc", deadline.signal);

    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe("5xx → upstream_unavailable + breaker", () => {
  it("opens the breaker after repeated 5xx failures across calls", async () => {
    const mock = fetchMock();
    mock.mockImplementation(async () => new Response("boom", { status: 500 }));

    // Each mcpInitialize() burns through all 3 retries as one "failure" for
    // the breaker (onBreakerFailure is called once per exhausted call).
    for (let i = 0; i < 5; i++) {
      await mcpInitialize("token-abc");
    }

    mock.mockClear();
    const tripped = await mcpInitialize("token-abc");

    expect(tripped).toEqual({
      ok: false,
      error: {
        kind: "upstream_unavailable",
        message: "Silpo MCP тимчасово недоступний (circuit open)",
      },
    });
    // Breaker short-circuits before any fetch call.
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("listMcpTools", () => {
  it("parses the permissive tools/list envelope", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: [
              { name: "silpo_get_my_offline_orders", description: "…" },
              { name: "silpo_get_my_online_orders" },
            ],
          },
        }),
      );

    const result = await listMcpTools("token-abc");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tools.map((t) => t.name)).toEqual([
        "silpo_get_my_offline_orders",
        "silpo_get_my_online_orders",
      ]);
    }
  });
});

describe("probeMcpTool", () => {
  it("описує форму здорової відповіді, не її вміст", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            structuredContent: {
              success: true,
              summary: "1 order",
              orders: [{ orderId: "o1", amount: 123.45 }],
            },
          },
        }),
      );

    const probe = await probeMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_get_my_online_orders",
      args: { limit: 1 },
    });

    expect(probe).toMatchObject({
      transportError: null,
      isError: false,
      refusal: null,
      payloadExtracted: true,
      payloadKeys: ["success", "summary", "orders"],
      ordersCount: 1,
    });
    // Жодного поля покупки в діагностиці (Hard Rule #21).
    expect(JSON.stringify(probe)).not.toContain("123.45");
    expect(JSON.stringify(probe)).not.toContain("o1");
  });

  it("показує відмову тули з текстом", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            isError: true,
            content: [{ type: "text", text: "Session expired" }],
          },
        }),
      );

    const probe = await probeMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_get_my_online_orders",
    });

    expect(probe).toMatchObject({
      isError: true,
      refusal: "Session expired",
      payloadExtracted: false,
      ordersCount: null,
    });
  });

  it("нерозбірний результат віддає ключі, за якими видно, що саме приїхало", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: { content: [{ type: "resource", text: "not json" }] },
        }),
      );

    const probe = await probeMcpTool({
      accessToken: "token-abc",
      toolName: "silpo_get_my_online_orders",
    });

    expect(probe.payloadExtracted).toBe(false);
    expect(probe.resultKeys).toContain("content:resource");
  });

  it("збій транспорту віддає типізовану помилку, а не порожню форму", async () => {
    const mock = fetchMock();
    mock.mockResolvedValue(new Response("unauthorized", { status: 401 }));

    const probe = await probeMcpTool({
      accessToken: "stale",
      toolName: "silpo_get_my_online_orders",
    });

    expect(probe.transportError).toMatchObject({ kind: "auth_required" });
  });
});

describe("rel-22: кеш сесії, Retry-After, стеля тіла", () => {
  const Schema = z.object({ ok: z.boolean() }).passthrough();
  const toolOk = {
    jsonrpc: "2.0" as const,
    id: 2,
    result: { structuredContent: { ok: true } },
  };

  it("другий callMcpTool з тим самим токеном не робить initialize", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(jsonResponse(toolOk))
      .mockResolvedValueOnce(jsonResponse(toolOk));
    const a = await callMcpTool({
      accessToken: "t1",
      toolName: "x",
      schema: Schema,
    });
    const b = await callMcpTool({
      accessToken: "t1",
      toolName: "x",
      schema: Schema,
    });
    expect(a.ok && b.ok).toBe(true);
    expect(mock).toHaveBeenCalledTimes(4);
  });

  it("сесія не ділиться між токенами різних користувачів", async () => {
    const mock = fetchMock();
    mock.mockImplementation(async () => jsonResponse(INIT_RESULT));
    mock.mockResolvedValueOnce(jsonResponse(INIT_RESULT));
    mock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    mock.mockResolvedValueOnce(jsonResponse(toolOk));
    mock.mockResolvedValueOnce(jsonResponse(INIT_RESULT));
    mock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    mock.mockResolvedValueOnce(jsonResponse(toolOk));
    await callMcpTool({ accessToken: "t1", toolName: "x", schema: Schema });
    await callMcpTool({ accessToken: "t2", toolName: "x", schema: Schema });
    expect(mock).toHaveBeenCalledTimes(6);
  });

  it("збій tools/call скидає кеш сесії", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(jsonResponse(toolOk));
    const a = await callMcpTool({
      accessToken: "t1",
      toolName: "x",
      schema: Schema,
    });
    expect(a.ok).toBe(false);
    const b = await callMcpTool({
      accessToken: "t1",
      toolName: "x",
      schema: Schema,
    });
    expect(b.ok).toBe(true);
    expect(mock).toHaveBeenCalledTimes(6);
  });

  it("429 на tools/call не скидає кеш сесії", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        new Response("x", { status: 429, headers: { "retry-after": "120" } }),
      )
      .mockResolvedValueOnce(jsonResponse(toolOk));
    const a = await callMcpTool({
      accessToken: "t1",
      toolName: "x",
      schema: Schema,
    });
    expect(a.ok).toBe(false);
    __silpoMcpTestHooks().resetBreaker();
    const b = await callMcpTool({
      accessToken: "t1",
      toolName: "x",
      schema: Schema,
    });
    expect(b.ok).toBe(true);
    expect(mock).toHaveBeenCalledTimes(4); // без повторного initialize
  });

  it("успіх паралельного запиту не знімає паузу Retry-After", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(jsonResponse(toolOk));
    await callMcpTool({ accessToken: "t1", toolName: "x", schema: Schema });

    let release: ((r: Response) => void) | undefined;
    mock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const inFlight = callMcpTool({
      accessToken: "t1",
      toolName: "x",
      schema: Schema,
    });
    // Запит уже висить у fetch, лише тоді Сільпо відповідає іншому 429.
    await vi.waitFor(() => expect(release).toBeDefined());
    mock.mockResolvedValueOnce(
      new Response("x", { status: 429, headers: { "retry-after": "120" } }),
    );
    const limited = await mcpInitialize("t2");
    expect(limited.ok).toBe(false);
    release!(jsonResponse(toolOk));
    expect((await inFlight).ok).toBe(true);

    const callsBefore = mock.mock.calls.length;
    const next = await mcpInitialize("t3");
    expect(next.ok).toBe(false);
    expect(mock.mock.calls.length).toBe(callsBefore); // пауза Сільпо в силі
  });

  it("довгий Retry-After: без ретраїв, rate_limited, breaker відкритий для всіх", async () => {
    const mock = fetchMock();
    mock.mockResolvedValueOnce(
      new Response("slow down", {
        status: 429,
        headers: { "retry-after": "120" },
      }),
    );
    const r = await mcpInitialize("t1");
    expect(r).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: "rate_limited", status: 429 }),
    });
    expect(mock).toHaveBeenCalledTimes(1);
    const next = await mcpInitialize("t2");
    expect(next.ok).toBe(false);
    expect(mock).toHaveBeenCalledTimes(1); // circuit open
  });

  it("429 без Retry-After після вичерпання ретраїв рахується в breaker", async () => {
    const mock = fetchMock();
    mock.mockImplementation(async () => new Response("x", { status: 429 }));
    for (let i = 0; i < 5; i++) await mcpInitialize("t1");
    const before = mock.mock.calls.length;
    await mcpInitialize("t1");
    expect(mock.mock.calls.length).toBe(before);
  });

  it("короткий Retry-After поважається і ретрай проходить", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(
        new Response("x", { status: 429, headers: { "retry-after": "1" } }),
      )
      .mockResolvedValueOnce(jsonResponse(INIT_RESULT))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const t0 = Date.now();
    const r = await mcpInitialize("t1");
    expect(r.ok).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
  });

  it("тіло більше за стелю: protocol_error без ретраїв, текст не логується", async () => {
    const mock = fetchMock();
    const big = "A".repeat(SILPO_MCP_MAX_BODY_BYTES + 1);
    mock.mockResolvedValueOnce(
      new Response(big, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await mcpInitialize("t1");
    expect(r).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: "protocol_error" }),
    });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain("AAAA");
  });
});
