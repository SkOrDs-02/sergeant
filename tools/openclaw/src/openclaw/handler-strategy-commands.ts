/**
 * `/strategy` Telegram slash-command — thin Telegram-wrapper над
 * `/api/internal/strategic/*` (PR-34 datalayer).
 *
 * Mirror того, як `handler-info-commands.ts` робить `/audit` і `/alerts`:
 * pure parser у `strategy-format.ts`, тут — лише plumbing
 * (rate-limit, DM-allowlist, audit invocation open/finalize, fetch, reply).
 *
 * Чому окремий handler-файл, а не у `handler-info-commands.ts`:
 *   * info-file вже > 370 рядків і поступово зростає (Hard Rule #18
 *     active-initiative — module-size budget 600).
 *   * `/strategy` має свій pure-parser + UI-render, які краще тестувати
 *     ізольовано (`strategy-format.test.ts`).
 */

import { parseFounderTgUserId } from "./security.js";
import {
  formatStrategyList,
  kyivMondayOf,
  parseStrategyCommand,
  STRATEGY_PERSONA_GLYPH,
  STRATEGY_STATUS_GLYPH,
  type ParsedStrategyCommand,
  type StrategyGoalForRender,
  type StrategyPersona,
  type StrategyStatus,
} from "./strategy-format.js";
import type { HandlerContext } from "./handler-context.js";
import { OpenInvocationResponse, postJson } from "./handler-constants.js";

interface StrategicGoalApi {
  id: number;
  persona: StrategyPersona;
  founderUserId: string;
  weekStart: string;
  goalText: string;
  status: StrategyStatus;
  createdAt: string;
  updatedAt: string;
}

interface GoalsResponse {
  ok: boolean;
  goals?: StrategicGoalApi[];
  error?: string;
}

interface GoalResponse {
  ok: boolean;
  goal?: StrategicGoalApi;
  error?: string;
}

const HELP_BODY = [
  "<b>/strategy</b> — per-persona weekly goals (PR-34 skeleton).",
  "",
  "Subcommands:",
  "  • <code>/strategy list [active|achieved|abandoned|carried_over|all] [persona]</code> — list goals",
  "  • <code>/strategy add &lt;persona&gt;: &lt;goal text&gt;</code> — add goal (this week)",
  "  • <code>/strategy done &lt;id&gt;</code> — mark achieved",
  "  • <code>/strategy abandon &lt;id&gt;</code> — mark abandoned",
  "  • <code>/strategy carry &lt;id&gt;</code> — push to next week (status='carried_over')",
  "",
  `Personas: ${Object.entries(STRATEGY_PERSONA_GLYPH)
    .map(([k, glyph]) => `${glyph} ${k}`)
    .join(", ")}`,
  `Statuses: ${Object.entries(STRATEGY_STATUS_GLYPH)
    .map(([k, glyph]) => `${glyph} ${k}`)
    .join(", ")}`,
].join("\n");

export function registerStrategyCommands(ctx: HandlerContext): void {
  const {
    bot,
    serverUrl,
    internalApiKey,
    founderUserId,
    rateLimiter,
    isAllowedDmContext,
  } = ctx;

  bot.command("strategy", async (c) => {
    if (!isAllowedDmContext(c)) return;
    if (!rateLimiter.allow(String(c.from?.id))) {
      await c.reply("Rate limit exceeded. Спробуй за хвилину.");
      return;
    }

    const argument = (c.match ?? "").toString();
    const parsed = parseStrategyCommand(argument);

    if (parsed.kind === "help") {
      await c.reply(HELP_BODY, { parse_mode: "HTML" });
      return;
    }
    if (parsed.kind === "error") {
      await c.reply(parsed.message);
      return;
    }

    // Open audit invocation BEFORE work; finalize у двох гілках (success/err).
    const founderTgUserId =
      parseFounderTgUserId(process.env["OPENCLAW_FOUNDER_TG_USER_ID"]) ??
      c.from?.id ??
      0;
    const openRes = await postJson<OpenInvocationResponse>(
      `${serverUrl}/api/internal/openclaw/invocations/open`,
      internalApiKey,
      {
        founderUserId,
        founderTgUserId,
        trigger: "dm",
        userMessage: `/strategy ${argument}`.trim(),
        metadata: {
          telegramChatId: c.chat?.id,
          persona: "cofounder",
          subcommand: parsed.kind,
        },
      },
    );
    const invocationId = openRes.data?.invocationId;

    const finalize = async (
      status: "success" | "error",
      reply: string,
      errorMessage: string | null,
    ): Promise<void> => {
      if (!invocationId) return;
      await postJson(
        `${serverUrl}/api/internal/openclaw/invocations/finalize`,
        internalApiKey,
        {
          invocationId,
          status,
          assistantResponse: status === "success" ? reply : null,
          errorMessage,
          inputTokens: 0,
          outputTokens: 0,
        },
      );
    };

    try {
      const reply = await handleStrategy(parsed, {
        serverUrl,
        internalApiKey,
        founderUserId,
      });
      await c.reply(reply, { parse_mode: "HTML" });
      await finalize("success", reply, null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const reply = `Не зміг виконати /strategy ${parsed.kind}: ${message}`;
      await c.reply(reply);
      await finalize("error", reply, message);
    }
  });
}

interface StrategyEndpointDeps {
  serverUrl: string;
  internalApiKey: string;
  founderUserId: string;
}

/**
 * Pure (modulo postJson) dispatcher: бере parsed-команду + deps,
 * повертає string-reply. Помилка від API/мережі — re-throw, обробляється
 * у registerStrategyCommands try/catch.
 */
export async function handleStrategy(
  parsed: Exclude<ParsedStrategyCommand, { kind: "help" } | { kind: "error" }>,
  deps: StrategyEndpointDeps,
): Promise<string> {
  const { serverUrl, internalApiKey, founderUserId } = deps;

  switch (parsed.kind) {
    case "list": {
      const body: Record<string, unknown> = { founderUserId };
      if (parsed.persona !== undefined) body["persona"] = parsed.persona;
      if (parsed.status !== undefined && parsed.status !== "all") {
        body["status"] = parsed.status;
      }
      const r = await postJson<GoalsResponse>(
        `${serverUrl}/api/internal/strategic/list`,
        internalApiKey,
        body,
      );
      if (!r.ok || !r.data || !r.data.ok || !r.data.goals) {
        throw new Error(`list HTTP ${r.status}`);
      }
      const goals: StrategyGoalForRender[] = r.data.goals.map((g) => ({
        id: g.id,
        persona: g.persona,
        weekStart: g.weekStart,
        goalText: g.goalText,
        status: g.status,
      }));
      return formatStrategyList(goals, {
        ...(parsed.persona !== undefined ? { persona: parsed.persona } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      });
    }

    case "add": {
      const weekStart = kyivMondayOf(new Date());
      const r = await postJson<GoalResponse>(
        `${serverUrl}/api/internal/strategic/goals`,
        internalApiKey,
        {
          persona: parsed.persona,
          founderUserId,
          weekStart,
          goalText: parsed.goalText,
        },
      );
      if (!r.ok || !r.data || !r.data.ok || !r.data.goal) {
        const errorCode = r.data?.error ?? `HTTP ${r.status}`;
        throw new Error(`add failed: ${errorCode}`);
      }
      const g = r.data.goal;
      return (
        `${STRATEGY_PERSONA_GLYPH[g.persona]} <b>${g.persona}</b> goal added\n` +
        `<code>#${g.id}</code> [${g.weekStart}] ${escapeHtml(g.goalText)}`
      );
    }

    case "done":
    case "abandon": {
      const status: StrategyStatus =
        parsed.kind === "done" ? "achieved" : "abandoned";
      const r = await postJson<GoalResponse>(
        `${serverUrl}/api/internal/strategic/goals/status`,
        internalApiKey,
        { id: parsed.id, status },
      );
      if (!r.ok || !r.data || !r.data.ok || !r.data.goal) {
        const errorCode = r.data?.error ?? `HTTP ${r.status}`;
        throw new Error(`status update failed: ${errorCode}`);
      }
      const g = r.data.goal;
      return (
        `${STRATEGY_STATUS_GLYPH[g.status]} goal <code>#${g.id}</code> → <b>${status}</b>\n` +
        `${STRATEGY_PERSONA_GLYPH[g.persona]} ${g.persona} [${g.weekStart}] ${escapeHtml(g.goalText)}`
      );
    }

    case "carry": {
      const r = await postJson<GoalResponse>(
        `${serverUrl}/api/internal/strategic/goals/carry`,
        internalApiKey,
        { id: parsed.id },
      );
      if (!r.ok || !r.data || !r.data.ok || !r.data.goal) {
        const errorCode = r.data?.error ?? `HTTP ${r.status}`;
        throw new Error(`carry failed: ${errorCode}`);
      }
      const g = r.data.goal;
      return (
        `${STRATEGY_STATUS_GLYPH.carried_over} goal <code>#${g.id}</code> carried → next week\n` +
        `${STRATEGY_PERSONA_GLYPH[g.persona]} ${g.persona} [${g.weekStart}] ${escapeHtml(g.goalText)}`
      );
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
