import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Tool;
type MessageParam = Anthropic.MessageParam;
type ToolResultBlockParam = Anthropic.ToolResultBlockParam;
type TextBlockParam = Anthropic.TextBlockParam;

export type ToolExecutor = (
  name: string,
  input: Record<string, unknown>,
) => Promise<string>;

interface AgentConfig {
  /** Model to use (e.g. "claude-sonnet-4-6"). */
  model: string;
  /** Max output tokens per turn. */
  maxTokens: number;
  /** System prompt for the agent. */
  systemPrompt: string;
  /** Tool definitions available to the agent. */
  tools: Tool[];
  /** Function that executes a tool call and returns a string result. */
  executeTool: ToolExecutor;
  /** Max tool-use iterations before giving up (default: 5). */
  maxIterations?: number;
}

/**
 * Prompt-caching feature flag — controlled by env var
 * `ANTHROPIC_PROMPT_CACHE=1`. Default off; opt-in for cost savings on
 * heavy-prompt agents (ADR-0057, PR-39). Reads `process.env` on each call so
 * test suites can flip it via `vi.stubEnv()`.
 */
export function isPromptCachingEnabled(): boolean {
  const raw = process.env["ANTHROPIC_PROMPT_CACHE"];
  if (raw === undefined) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/**
 * Wrap a system-prompt string into the array form so the last text block
 * can carry a `cache_control: ephemeral` marker. Caches everything from
 * the start of the request up to (and including) that block.
 */
function systemWithCacheBreakpoint(
  systemPrompt: string,
): string | Array<TextBlockParam> {
  if (!isPromptCachingEnabled()) return systemPrompt;
  return [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" },
    },
  ];
}

/**
 * Stamp `cache_control: ephemeral` on the LAST tool definition. Anthropic's
 * cache breakpoint applies to everything from the start of the request up
 * to and including the marked block; marking the tail of `tools` (which
 * follows `system` in wire order) gives the broadest cache coverage.
 */
function toolsWithCacheBreakpoint(tools: Tool[]): Tool[] {
  if (!isPromptCachingEnabled()) return tools;
  if (tools.length === 0) return tools;
  return tools.map((tool, index) => {
    if (index !== tools.length - 1) return tool;
    return {
      ...tool,
      cache_control: { type: "ephemeral" },
    } satisfies Tool;
  });
}

/**
 * Shared agent loop: sends user message through Anthropic's tool-use cycle.
 *
 * Each console agent (ops, marketing, etc.) defines its own system prompt,
 * tools, and tool executor — this function handles the repetitive message
 * loop logic so agents stay DRY.
 *
 * Prompt caching (ADR-0057): when env var `ANTHROPIC_PROMPT_CACHE` is
 * truthy (`1` / `true` / `yes`), the static system prompt + tools prefix
 * is marked with `cache_control: ephemeral`. First call within the 5-min
 * TTL pays a ~25% premium on prefix tokens; subsequent calls pay 10% on
 * cache reads. Net win for any agent with ≥2 turns or ≥2 calls in 5min.
 */
export async function runAgentLoop(
  client: Anthropic,
  userMessage: string,
  config: AgentConfig,
): Promise<string> {
  const maxIter = config.maxIterations ?? 5;
  const messages: MessageParam[] = [{ role: "user", content: userMessage }];
  const system = systemWithCacheBreakpoint(config.systemPrompt);
  const tools = toolsWithCacheBreakpoint(config.tools);

  for (let i = 0; i < maxIter; i++) {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system,
      tools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");
      return text || "(empty response)";
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const result = await config.executeTool(
          block.name,
          block.input as Record<string, unknown>,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    break;
  }

  return `Agent did not produce a response after ${maxIter} iterations.`;
}
