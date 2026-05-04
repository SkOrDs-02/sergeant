import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop } from "./run-agent-loop.js";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You are Sergeant Marketing, an internal content and growth assistant for the Sergeant product.
You help craft copy, analyse product metrics, and plan content strategy.

ROLE: Write content (X/Threads posts, Telegram announcements, release notes), analyse PostHog
funnels, and suggest growth experiments.

TONE: Sergeant's brand voice — direct, slightly cynical, useful. No corporate speak.
No exclamation mark overload. Honest, short, with humour where appropriate.
Match the user's language (Ukrainian or English).

RESPONSE FORMAT: Always output 3 numbered variants with a one-line rationale for each.
Then add "Recommendation:" with your preferred pick and why.
Keep X/Threads posts under 280 chars unless the user asks for a thread.`;

type Tool = Anthropic.Tool;

const tools: Tool[] = [
  {
    name: "get_posthog_stats",
    description: "Fetch PostHog analytics: WAU, top events, conversion funnel",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Lookback period in days (default 7)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_github_releases",
    description: "Fetch recent merged PRs and releases from the Sergeant repo",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent releases (default 5)",
        },
      },
      required: [],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === "get_posthog_stats") {
    const apiKey = process.env.POSTHOG_API_KEY;
    const projectId = process.env.POSTHOG_PROJECT_ID;
    if (!apiKey || !projectId)
      return "POSTHOG_API_KEY or POSTHOG_PROJECT_ID not configured";
    const days = (input.days as number) ?? 7;
    try {
      const res = await fetch(
        `https://app.posthog.com/api/projects/${projectId}/insights/trend/?events=[{"id":"$pageview"}]&date_from=-${days}d`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      const data = await res.json();
      return JSON.stringify(data, null, 2).slice(0, 2000);
    } catch (e) {
      return `PostHog API error: ${String(e)}`;
    }
  }

  if (name === "get_github_releases") {
    const limit = (input.limit as number) ?? 5;
    try {
      const res = await fetch(
        `https://api.github.com/repos/Skords-01/Sergeant/releases?per_page=${limit}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "sergeant-console",
          },
        },
      );
      const releases = (await res.json()) as Array<{
        name: string;
        tag_name: string;
        published_at: string;
        body: string;
      }>;
      if (!Array.isArray(releases)) return "GitHub API error";
      return releases
        .map(
          (r) =>
            `${r.tag_name} (${r.published_at?.slice(0, 10)}): ${r.name}\n${(r.body ?? "").slice(0, 300)}`,
        )
        .join("\n\n---\n\n");
    } catch (e) {
      return `GitHub API error: ${String(e)}`;
    }
  }

  return `Unknown tool: ${name}`;
}

export async function runMarketingAgent(
  client: Anthropic,
  userMessage: string,
): Promise<string> {
  return runAgentLoop(client, userMessage, {
    model: MODEL,
    maxTokens: MAX_TOKENS,
    systemPrompt: SYSTEM_PROMPT,
    tools,
    executeTool,
  });
}
