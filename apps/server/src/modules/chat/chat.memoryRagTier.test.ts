/**
 * sec-32 (аудит 2026-10-01, рішення власника 2026-11-21): RAG памʼяті в
 * першому турі `/api/chat` урізаний для Free до стелі реєстру доступу
 * (`ai.memoryRecall.freeItems` = 3), Premium отримує повний top-K. Тест
 * стереже саме проводку: handler передає в `buildRagContext` резолвер стелі,
 * який іде через план юзера, а не повний recall для всіх.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

const { buildRagContextMock, getUserPlanMock } = vi.hoisted(() => ({
  buildRagContextMock: vi.fn(
    async (opts: { baseContext: string }) => opts.baseContext,
  ),
  getUserPlanMock: vi.fn(),
}));

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  anthropicMessagesStream: vi.fn(),
  extractAnthropicText: vi.fn(
    (d: { content?: { type: string; text?: string }[] }) =>
      (d?.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n"),
  ),
}));

vi.mock("../ai-memory/ragContext.js", () => ({
  buildRagContext: buildRagContextMock,
}));

vi.mock("../billing/getUserPlan.js", async () => {
  const actual = await vi.importActual<
    typeof import("../billing/getUserPlan.js")
  >("../billing/getUserPlan.js");
  return { ...actual, getUserPlan: getUserPlanMock };
});

vi.mock("../billing/provider.js", async () => {
  const actual = await vi.importActual<typeof import("../billing/provider.js")>(
    "../billing/provider.js",
  );
  return { ...actual, isBillingEnforced: () => true };
});

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./chat.js";
import { __resetChatResponseCache } from "./chatResponseCache.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

function makeRes(): Response {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response;
}

const plan = (p: "free" | "pro") => ({
  plan: p,
  status: "active",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
});

/** Проганяє перший тур і віддає резолвер стелі, який handler передав у RAG. */
async function capturedResolver(): Promise<(userId: string) => unknown> {
  anthropicMessages.mockResolvedValueOnce({
    response: { ok: true, status: 200 },
    data: { content: [{ type: "text", text: "Привіт!" }] },
  });
  await handler(
    {
      anthropicKey: "sk-test",
      body: { messages: [{ role: "user", content: "Що я їв учора?" }] },
    } as unknown as Request,
    makeRes(),
  );
  expect(buildRagContextMock).toHaveBeenCalledTimes(1);
  const opts = buildRagContextMock.mock.calls[0]?.[0] as unknown as {
    resolveMaxItems?: (userId: string) => unknown;
  };
  expect(opts.resolveMaxItems).toBeTypeOf("function");
  return opts.resolveMaxItems as (userId: string) => unknown;
}

beforeEach(() => {
  vi.clearAllMocks();
  anthropicMessages.mockReset();
  __resetChatResponseCache();
});

describe("/api/chat: RAG памʼяті за планом (sec-32)", () => {
  it("Free отримує не більше 3 спогадів", async () => {
    getUserPlanMock.mockResolvedValue(plan("free"));
    const resolve = await capturedResolver();
    await expect(resolve("user_free")).resolves.toBe(3);
    expect(getUserPlanMock).toHaveBeenCalledWith(
      expect.anything(),
      "user_free",
    );
  });

  it("Premium отримує повний RAG без стелі", async () => {
    getUserPlanMock.mockResolvedValue(plan("pro"));
    const resolve = await capturedResolver();
    await expect(resolve("user_pro")).resolves.toBeNull();
  });
});
