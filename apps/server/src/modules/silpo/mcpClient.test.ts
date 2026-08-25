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
