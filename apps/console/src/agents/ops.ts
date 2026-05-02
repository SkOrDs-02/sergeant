import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop } from "./run-agent-loop.js";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You are Sergeant Ops, an internal operations assistant for the Sergeant product.
You have read access to infrastructure and billing data via tools.

ROLE: Answer questions about production state — billing metrics, error rates, deployment status.
Diagnose problems and propose next steps. You do NOT write to systems directly.

TONE: Direct and concise. Telegram-friendly Markdown (*bold*, \`code\`). Always link to evidence.
If you don't have data, say so — don't guess.

CONSTRAINTS:
- Never reveal raw API keys, tokens, or passwords.
- Never take write actions (no Stripe refunds, no DB mutations, no deploys).
- All monetary amounts in UAH unless the user specifies otherwise.
- Timestamps in Europe/Kyiv timezone.

RESPONSE FORMAT: Max 30 lines unless user asks for detail.
Start with a one-line summary, then evidence, then recommendations.`;

type Tool = Anthropic.Tool;

const tools: Tool[] = [
  {
    name: "get_stripe_metrics",
    description:
      "Fetch recent Stripe metrics: MRR, new subscriptions, failed payments",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back (default 7)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_sentry_issues",
    description:
      "Fetch open Sentry issues filtered by severity. Returns top unresolved issues.",
    input_schema: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["fatal", "error", "warning"],
          description: "Minimum severity level",
        },
        limit: {
          type: "number",
          description: "Max issues to return (default 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_server_stats",
    description:
      "Fetch server health stats from the Sergeant internal API: user count, recent deploys, DB health",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const serverUrl = process.env.SERVER_INTERNAL_URL ?? "http://localhost:3000";
  const apiKey = process.env.INTERNAL_API_KEY ?? "";

  if (name === "get_stripe_metrics") {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return "STRIPE_SECRET_KEY not configured";
    const days = (input.days as number) ?? 7;
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    try {
      const res = await fetch(
        `https://api.stripe.com/v1/charges?created[gte]=${since}&limit=100`,
        { headers: { Authorization: `Bearer ${stripeKey}` } },
      );
      const data = (await res.json()) as {
        data?: { amount: number; paid: boolean }[];
      };
      const charges = data.data ?? [];
      const successful = charges.filter((c) => c.paid);
      const failed = charges.filter((c) => !c.paid);
      const mrr = successful.reduce((s, c) => s + c.amount, 0) / 100;
      return `Stripe (last ${days}d): ${successful.length} successful charges (₴${mrr.toFixed(0)} total), ${failed.length} failed`;
    } catch (e) {
      return `Stripe API error: ${String(e)}`;
    }
  }

  if (name === "get_sentry_issues") {
    const token = process.env.SENTRY_AUTH_TOKEN;
    const org = process.env.SENTRY_ORG ?? "sergeant";
    if (!token) return "SENTRY_AUTH_TOKEN not configured";
    const level = (input.level as string) ?? "error";
    const limit = (input.limit as number) ?? 10;
    try {
      const res = await fetch(
        `https://sentry.io/api/0/organizations/${org}/issues/?query=is:unresolved level:${level}&limit=${limit}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const issues = (await res.json()) as Array<{
        title: string;
        level: string;
        count: string;
        permalink: string;
      }>;
      if (!Array.isArray(issues)) return "Sentry API error or no issues";
      return issues
        .map(
          (i) =>
            `[${i.level.toUpperCase()}] ${i.title} (${i.count} events) ${i.permalink}`,
        )
        .join("\n");
    } catch (e) {
      return `Sentry API error: ${String(e)}`;
    }
  }

  if (name === "get_server_stats") {
    try {
      const res = await fetch(`${serverUrl}/healthz`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      const data = await res.json();
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return `Server health check error: ${String(e)}`;
    }
  }

  return `Unknown tool: ${name}`;
}

export async function runOpsAgent(
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
