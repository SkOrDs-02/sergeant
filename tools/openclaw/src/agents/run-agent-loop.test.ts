/**
 * Unit-тести `runAgentLoop` — purity і коректність prompt-caching
 * feature flag (ADR-0057, PR-39).
 *
 * Покриваємо:
 *
 * - default (`ANTHROPIC_PROMPT_CACHE` unset) → request надсилається з
 *   plain string `system` і tools без `cache_control` — нуль regression
 *   для існуючих агентів.
 * - opt-in (`ANTHROPIC_PROMPT_CACHE=1`) → `system` обернутий у array із
 *   text-block + `cache_control: ephemeral`; останній tool у списку
 *   маркований `cache_control: ephemeral`.
 * - tool-use loop коректно ітерується (regression проти agent-loop
 *   shape), не залежно від caching-flag.
 * - порожній `tools[]` із enabled cache flag — `system` все ще caching-ed,
 *   tools НЕ мутуються (немає що mark-увати).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop, isPromptCachingEnabled } from "./run-agent-loop.js";

type Tool = Anthropic.Tool;
type MessageCreateParams = Anthropic.MessageCreateParams;
type Message = Anthropic.Message;

interface FakeClient {
  messages: {
    create: ReturnType<typeof vi.fn>;
  };
}

function makeClient(): FakeClient {
  return {
    messages: {
      create: vi.fn(),
    },
  };
}

function endTurn(text: string): Partial<Message> {
  return {
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text,
      } as Anthropic.TextBlock,
    ],
  };
}

const SAMPLE_TOOLS: Tool[] = [
  {
    name: "tool_a",
    description: "first tool",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "tool_b",
    description: "second tool — should carry cache_control when flag is on",
    input_schema: { type: "object", properties: {} },
  },
];

describe("run-agent-loop — prompt caching", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isPromptCachingEnabled", () => {
    it("returns false when env var is unset", () => {
      vi.stubEnv("ANTHROPIC_PROMPT_CACHE", "");
      expect(isPromptCachingEnabled()).toBe(false);
    });

    it("returns true for '1', 'true', 'yes' (case-insensitive)", () => {
      for (const v of ["1", "true", "TRUE", "yes", "Yes", "  true  "]) {
        vi.stubEnv("ANTHROPIC_PROMPT_CACHE", v);
        expect(isPromptCachingEnabled(), `value=${JSON.stringify(v)}`).toBe(
          true,
        );
      }
    });

    it("returns false for other truthy-looking values", () => {
      for (const v of ["on", "y", "enable", "0", "false", "no", "off"]) {
        vi.stubEnv("ANTHROPIC_PROMPT_CACHE", v);
        expect(isPromptCachingEnabled(), `value=${JSON.stringify(v)}`).toBe(
          false,
        );
      }
    });
  });

  describe("with caching DISABLED (default)", () => {
    it("sends plain string `system` and tools without cache_control", async () => {
      vi.stubEnv("ANTHROPIC_PROMPT_CACHE", "");
      const client = makeClient();
      client.messages.create.mockResolvedValueOnce(endTurn("hello"));

      const result = await runAgentLoop(
        client as unknown as Anthropic,
        "ping",
        {
          model: "claude-sonnet-4-6",
          maxTokens: 256,
          systemPrompt: "You are a helpful assistant.",
          tools: SAMPLE_TOOLS,
          executeTool: async () => "noop",
        },
      );

      expect(result).toBe("hello");
      expect(client.messages.create).toHaveBeenCalledTimes(1);
      const params = client.messages.create.mock
        .calls[0]?.[0] as MessageCreateParams;
      expect(params.system).toBe("You are a helpful assistant.");
      const sentTools = params.tools as Tool[];
      expect(sentTools.length).toBe(2);
      for (const t of sentTools) {
        expect(
          (t as Tool & { cache_control?: unknown }).cache_control,
        ).toBeUndefined();
      }
    });
  });

  describe("with caching ENABLED", () => {
    it("wraps `system` into array form with cache_control on the text block", async () => {
      vi.stubEnv("ANTHROPIC_PROMPT_CACHE", "1");
      const client = makeClient();
      client.messages.create.mockResolvedValueOnce(endTurn("ok"));

      await runAgentLoop(client as unknown as Anthropic, "hi", {
        model: "claude-sonnet-4-6",
        maxTokens: 256,
        systemPrompt: "Long static prompt — eligible for cache.",
        tools: SAMPLE_TOOLS,
        executeTool: async () => "noop",
      });

      const params = client.messages.create.mock
        .calls[0]?.[0] as MessageCreateParams;
      expect(Array.isArray(params.system)).toBe(true);
      const systemBlocks = params.system as Array<{
        type: "text";
        text: string;
        cache_control?: { type: "ephemeral" };
      }>;
      expect(systemBlocks).toHaveLength(1);
      expect(systemBlocks[0]).toEqual({
        type: "text",
        text: "Long static prompt — eligible for cache.",
        cache_control: { type: "ephemeral" },
      });
    });

    it("marks only the LAST tool with cache_control", async () => {
      vi.stubEnv("ANTHROPIC_PROMPT_CACHE", "1");
      const client = makeClient();
      client.messages.create.mockResolvedValueOnce(endTurn("ok"));

      await runAgentLoop(client as unknown as Anthropic, "hi", {
        model: "claude-sonnet-4-6",
        maxTokens: 256,
        systemPrompt: "prompt",
        tools: SAMPLE_TOOLS,
        executeTool: async () => "noop",
      });

      const params = client.messages.create.mock
        .calls[0]?.[0] as MessageCreateParams;
      const sentTools = params.tools as Array<
        Tool & { cache_control?: { type: "ephemeral" } }
      >;
      expect(sentTools).toHaveLength(2);
      expect(sentTools[0]?.cache_control).toBeUndefined();
      expect(sentTools[1]?.cache_control).toEqual({ type: "ephemeral" });
      // Source array не мутується — повертається новий список.
      expect(
        (SAMPLE_TOOLS[1] as Tool & { cache_control?: unknown }).cache_control,
      ).toBeUndefined();
    });

    it("leaves tools[] untouched when the agent has no tools registered", async () => {
      vi.stubEnv("ANTHROPIC_PROMPT_CACHE", "1");
      const client = makeClient();
      client.messages.create.mockResolvedValueOnce(endTurn("ok"));

      await runAgentLoop(client as unknown as Anthropic, "hi", {
        model: "claude-sonnet-4-6",
        maxTokens: 256,
        systemPrompt: "no-tools agent",
        tools: [],
        executeTool: async () => "noop",
      });

      const params = client.messages.create.mock
        .calls[0]?.[0] as MessageCreateParams;
      const sentTools = params.tools as Tool[] | undefined;
      expect(sentTools).toEqual([]);
      // `system` все одно отримує cache breakpoint.
      expect(Array.isArray(params.system)).toBe(true);
    });
  });

  describe("tool-use loop", () => {
    it("iterates through tool_use → tool_result → end_turn", async () => {
      vi.stubEnv("ANTHROPIC_PROMPT_CACHE", "");
      const client = makeClient();
      client.messages.create
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "tool_a",
              input: { x: 1 },
            },
          ],
        } as Partial<Message>)
        .mockResolvedValueOnce(endTurn("done"));

      const executeTool = vi.fn().mockResolvedValue("42");

      const result = await runAgentLoop(
        client as unknown as Anthropic,
        "compute",
        {
          model: "claude-sonnet-4-6",
          maxTokens: 256,
          systemPrompt: "prompt",
          tools: SAMPLE_TOOLS,
          executeTool,
        },
      );

      expect(result).toBe("done");
      expect(executeTool).toHaveBeenCalledWith("tool_a", { x: 1 });
      expect(client.messages.create).toHaveBeenCalledTimes(2);
      // 2-й виклик отримує тривіальний tool_result у messages.
      const secondCall = client.messages.create.mock
        .calls[1]?.[0] as MessageCreateParams;
      const lastMsg = secondCall.messages[secondCall.messages.length - 1];
      expect(lastMsg).toBeDefined();
      const content = (lastMsg as { content: unknown }).content as Array<{
        type: string;
        tool_use_id: string;
        content: string;
      }>;
      expect(content[0]?.type).toBe("tool_result");
      expect(content[0]?.tool_use_id).toBe("toolu_1");
      expect(content[0]?.content).toBe("42");
    });

    it("returns fallback string after maxIterations without end_turn", async () => {
      vi.stubEnv("ANTHROPIC_PROMPT_CACHE", "");
      const client = makeClient();
      // Each iteration returns tool_use → tool_result → repeat. Never end_turn.
      client.messages.create.mockResolvedValue({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_loop",
            name: "tool_a",
            input: {},
          },
        ],
      } as Partial<Message>);

      const result = await runAgentLoop(
        client as unknown as Anthropic,
        "stuck",
        {
          model: "claude-sonnet-4-6",
          maxTokens: 256,
          systemPrompt: "prompt",
          tools: SAMPLE_TOOLS,
          executeTool: async () => "noop",
          maxIterations: 2,
        },
      );

      expect(result).toBe(
        "Agent did not produce a response after 2 iterations.",
      );
      expect(client.messages.create).toHaveBeenCalledTimes(2);
    });
  });
});
