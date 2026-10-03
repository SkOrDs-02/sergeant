import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  anthropicResponses,
  createAnthropicMockHandle,
} from "../../../test/__mocks__/anthropic.js";

const envMock = vi.hoisted(() => ({
  LLM_RECEIPT_PROVIDER: "openrouter" as "openrouter" | "anthropic" | "stub",
  OPENROUTER_API_KEY: "",
  OPENROUTER_RECEIPT_MODEL: "google/gemini-2.5-flash-lite",
  ANTHROPIC_API_KEY: "",
}));
vi.mock("../../../env.js", () => ({ env: envMock }));
vi.mock("../../../lib/anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as _anthropicMessages } from "../../../lib/anthropic.js";
import { callReceiptVision } from "./visionClient.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

beforeEach(() => {
  anthropicMessages.mockReset();
  envMock.LLM_RECEIPT_PROVIDER = "openrouter";
  envMock.OPENROUTER_API_KEY = "";
  envMock.ANTHROPIC_API_KEY = "";
});

describe("callReceiptVision", () => {
  it("LLM_RECEIPT_PROVIDER=stub повертає канонічний JSON без виклику anthropicMessages", async () => {
    envMock.LLM_RECEIPT_PROVIDER = "stub";
    const text = await callReceiptVision({
      base64: "abc",
      mediaType: "image/jpeg",
    });
    expect(anthropicMessages).not.toHaveBeenCalled();
    const parsed = JSON.parse(text) as {
      store: string;
      total_kopiykas: number;
    };
    expect(parsed.store).toBe("Тестовий магазин");
    expect(parsed.total_kopiykas).toBe(100);
  });

  it("openrouter + OPENROUTER_API_KEY → allowOpenRouter:true, модель з OPENROUTER_RECEIPT_MODEL", async () => {
    envMock.OPENROUTER_API_KEY = "or-key";
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text('{"store":"x"}'),
    );

    const text = await callReceiptVision({
      base64: "abc",
      mediaType: "image/jpeg",
    });

    expect(text).toBe('{"store":"x"}');
    const [, payload, opts] = anthropicMessages.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(opts["allowOpenRouter"]).toBe(true);
    expect(payload["model"]).toBe("google/gemini-2.5-flash-lite");
  });

  it("openrouter БЕЗ OPENROUTER_API_KEY → деградує до Anthropic-fallback-моделі", async () => {
    envMock.OPENROUTER_API_KEY = "";
    anthropicMessages.mockResolvedValueOnce(anthropicResponses.text("{}"));

    await callReceiptVision({ base64: "abc", mediaType: "image/jpeg" });

    const [, payload, opts] = anthropicMessages.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(opts["allowOpenRouter"]).toBe(false);
    expect(payload["model"]).toBe("claude-haiku-4-5-20251001");
  });

  it("LLM_RECEIPT_PROVIDER=anthropic форсує прямий Anthropic незалежно від OPENROUTER_API_KEY", async () => {
    envMock.LLM_RECEIPT_PROVIDER = "anthropic";
    envMock.OPENROUTER_API_KEY = "or-key"; // present, але не має значення
    anthropicMessages.mockResolvedValueOnce(anthropicResponses.text("{}"));

    await callReceiptVision({ base64: "abc", mediaType: "image/jpeg" });

    const [, , opts] = anthropicMessages.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(opts["allowOpenRouter"]).toBe(false);
  });

  it("надсилає image-блок з переданим base64/mediaType", async () => {
    anthropicMessages.mockResolvedValueOnce(anthropicResponses.text("{}"));

    await callReceiptVision({ base64: "BASE64DATA", mediaType: "image/png" });

    const [, payload] = anthropicMessages.mock.calls[0] as [
      string,
      { messages: Array<{ content: Array<Record<string, unknown>> }> },
    ];
    const imageBlock = payload.messages[0]?.content[0] as {
      type: string;
      source: { media_type: string; data: string };
    };
    expect(imageBlock.type).toBe("image");
    expect(imageBlock.source.media_type).toBe("image/png");
    expect(imageBlock.source.data).toBe("BASE64DATA");
  });

  it("кидає ExternalServiceError-подібну помилку, коли upstream не ok", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 429 },
      data: { error: { message: "rate limited" } },
    });

    await expect(
      callReceiptVision({ base64: "abc", mediaType: "image/jpeg" }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
