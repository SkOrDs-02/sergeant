import { describe, expect, it } from "vitest";
import {
  assertChatFixturesValid,
  chatErrorFixtures,
  chatTextFixtures,
  chatToolCallRawFixtures,
  chatToolCapErrorFixtures,
  type ChatResponseFixture,
  type ChatToolCapErrorFixture,
} from "./chat";

function withPatched<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K],
  assertion: () => void,
): void {
  const hadKey = Object.prototype.hasOwnProperty.call(target, key);
  const original = target[key];
  target[key] = value;
  try {
    assertion();
  } finally {
    if (hadKey) {
      target[key] = original;
    } else {
      delete target[key];
    }
  }
}

describe("chat contract fixtures", () => {
  it("passes the canonical self-check", () => {
    expect(() => assertChatFixturesValid()).not.toThrow();
  });

  it("rejects invalid text fixtures", () => {
    const textOnly = chatTextFixtures.textOnly as {
      text: unknown;
      tool_calls?: unknown[];
    };

    withPatched(textOnly, "text", "", () => {
      expect(() => assertChatFixturesValid()).toThrow(/text.*non-empty string/);
    });
    withPatched(textOnly, "tool_calls", [], () => {
      expect(() => assertChatFixturesValid()).toThrow(
        /must not have "tool_calls"/,
      );
    });
  });

  it("rejects invalid tool-call fixtures", () => {
    const toolCallOnly = chatToolCallRawFixtures.toolCallOnly as {
      tool_calls: NonNullable<ChatResponseFixture["tool_calls"]>;
      tool_calls_raw: unknown[] | null;
    };
    const originalCalls = toolCallOnly.tool_calls;
    const originalRaw = toolCallOnly.tool_calls_raw;

    toolCallOnly.tool_calls = [];
    expect(() => assertChatFixturesValid()).toThrow(
      /tool_calls.*non-empty array/,
    );
    toolCallOnly.tool_calls = originalCalls;

    toolCallOnly.tool_calls = [{ id: "", name: "tool", input: {} }];
    expect(() => assertChatFixturesValid()).toThrow(
      /tool_call\.id.*non-empty string/,
    );

    toolCallOnly.tool_calls = [{ id: "toolu_test", name: "", input: {} }];
    expect(() => assertChatFixturesValid()).toThrow(
      /tool_call\.name.*non-empty string/,
    );

    toolCallOnly.tool_calls = originalCalls;
    toolCallOnly.tool_calls_raw = null;
    expect(() => assertChatFixturesValid()).toThrow(
      /tool_calls_raw.*must be an array/,
    );

    toolCallOnly.tool_calls_raw = originalRaw;
  });

  it("rejects invalid error fixtures", () => {
    const quota = chatErrorFixtures.errorQuotaExceeded as { error: unknown };
    withPatched(quota, "error", "", () => {
      expect(() => assertChatFixturesValid()).toThrow(
        /chat\.error.*non-empty string/,
      );
    });
  });

  it("rejects invalid tool-cap error fixtures", () => {
    const cap =
      chatToolCapErrorFixtures.errorToolIterationCap as ChatToolCapErrorFixture;
    withPatched(cap, "code", "OTHER" as ChatToolCapErrorFixture["code"], () => {
      expect(() => assertChatFixturesValid()).toThrow(
        /code.*MAX_TOOL_ITERATIONS/,
      );
    });

    const originalDetail = cap.detail;
    cap.detail = {
      ...originalDetail,
      observed: "9" as unknown as number,
    };
    try {
      expect(() => assertChatFixturesValid()).toThrow(
        /detail\.observed.*number/,
      );
    } finally {
      cap.detail = originalDetail;
    }
  });
});
