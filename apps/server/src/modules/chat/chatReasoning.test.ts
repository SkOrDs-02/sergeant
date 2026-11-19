/**
 * `CHAT_FIRST_TURN_REASONING_EFFORT`: парсинг змінної і переклад у поля
 * Anthropic-сумісного `/api/v1/messages`. Шлях через обробник чату —
 * `chat.firstTurnReasoning.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHAT_FIRST_TURN_REASONING_EFFORT_DEFAULT,
  CHAT_FIRST_TURN_REASONING_EFFORTS,
} from "../../env/aiRoutingEnv.js";
import { REASONING_EFFORTS } from "../../lib/llm/provider.js";
import { firstTurnReasoningFields } from "./chatReasoning.js";

describe("firstTurnReasoningFields", () => {
  it("без значення — порожній обʼєкт, поля в запит не йдуть", () => {
    expect(firstTurnReasoningFields(undefined)).toEqual({});
  });

  it("`none` — `thinking: disabled`, без `output_config`", () => {
    expect(firstTurnReasoningFields("none")).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it.each(["low", "medium", "high", "xhigh"] as const)(
    "`%s` — `output_config.effort` з тим самим значенням",
    (effort) => {
      expect(firstTurnReasoningFields(effort)).toEqual({
        output_config: { effort },
      });
    },
  );
});

describe("перелік значень проти `REASONING_EFFORTS`", () => {
  it("це `REASONING_EFFORTS` без `minimal` (його не приймає /messages)", () => {
    expect([...CHAT_FIRST_TURN_REASONING_EFFORTS]).toEqual(
      REASONING_EFFORTS.filter((e) => e !== "minimal"),
    );
  });
});

describe("CHAT_FIRST_TURN_REASONING_EFFORT: парсинг змінної оточення", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function parsed(value: string | undefined) {
    vi.stubEnv("CHAT_FIRST_TURN_REASONING_EFFORT", value);
    vi.resetModules();
    return (await import("../../env/env.js")).env
      .CHAT_FIRST_TURN_REASONING_EFFORT;
  }

  it("незадана й порожня змінна — дефолт `low` (рішення 2026-11-18)", async () => {
    expect(CHAT_FIRST_TURN_REASONING_EFFORT_DEFAULT).toBe("low");
    expect(await parsed(undefined)).toBe("low");
    expect(await parsed("")).toBe("low");
    expect(await parsed("  ")).toBe("low");
  });

  it("`medium` — шлях повернення до дефолту шлюзу", async () => {
    expect(await parsed("medium")).toBe("medium");
  });

  it("приймає перелік; регістр і пробіли не важливі", async () => {
    expect(await parsed("low")).toBe("low");
    expect(await parsed(" None ")).toBe("none");
    expect(await parsed("XHIGH")).toBe("xhigh");
  });

  it.each(["minimal", "max", "lo"])(
    "`%s` валить старт, а не вгадується",
    async (value) => {
      vi.stubEnv("CHAT_FIRST_TURN_REASONING_EFFORT", value);
      vi.resetModules();
      await expect(import("../../env/env.js")).rejects.toThrow(
        /CHAT_FIRST_TURN_REASONING_EFFORT/,
      );
    },
  );
});
