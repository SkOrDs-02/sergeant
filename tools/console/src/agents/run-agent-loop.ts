import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Tool;
type MessageParam = Anthropic.MessageParam;
type ToolResultBlockParam = Anthropic.ToolResultBlockParam;

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
 * Shared agent loop: sends user message through Anthropic's tool-use cycle.
 *
 * Each console agent (ops, marketing, etc.) defines its own system prompt,
 * tools, and tool executor — this function handles the repetitive message
 * loop logic so agents stay DRY.
 */
export async function runAgentLoop(
  client: Anthropic,
  userMessage: string,
  config: AgentConfig,
): Promise<string> {
  const maxIter = config.maxIterations ?? 5;
  const messages: MessageParam[] = [{ role: "user", content: userMessage }];

  for (let i = 0; i < maxIter; i++) {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: config.systemPrompt,
      tools: config.tools,
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
