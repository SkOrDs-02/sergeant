/**
 * Read-only / info slash-commands for the OpenClaw bot.
 *
 * Split out of `handler-commands.ts` (PR-36 follow-up) so the bot
 * handler file stays under the bus-factor threshold flagged in
 * `docs/tech-debt/frontend.md`. Owns `/start`, `/help`, `/reset`,
 * `/budget`, `/decisions`, `/audit`, `/alerts`.
 *
 * All handlers go through `isAllowedDmContext` from the orchestrator
 * so the DM-only + founder-allowlist gate stays single-sourced.
 */

import { InputFile } from "grammy";
import { Sentry } from "../obs/sentry.js";
import { buildAuditCsvFilename, renderWriteAuditCsv } from "./audit-csv.js";
import { parseDuration } from "./duration.js";
import { parseFounderTgUserId } from "./security.js";
import {
  formatPendingReply,
  parseAlertsCommand,
  type PendingAlertItem,
} from "./alerts-format.js";
import { executeRitualCommand } from "./ritual-runner.js";
import type { HandlerContext } from "./handler-context.js";
import {
  HELP_TEXT,
  buildHelpKeyboard,
  buildPersonaQuickRow,
  postJson,
  type BudgetResponse,
  type OpenInvocationResponse,
  type WriteAuditListItem,
} from "./handler-constants.js";

export function registerInfoCommands(ctx: HandlerContext): void {
  const {
    bot,
    serverUrl,
    internalApiKey,
    founderUserId,
    rateLimiter,
    sessions,
    isAllowedDmContext,
  } = ctx;

  bot.command("start", async (c) => {
    if (!isAllowedDmContext(c)) return; // silent ignore у non-DM
    await c.reply(HELP_TEXT, {
      parse_mode: "HTML",
      reply_markup: buildPersonaQuickRow(),
    });
  });

  bot.command("help", async (c) => {
    if (!isAllowedDmContext(c)) return;
    await c.reply(HELP_TEXT, {
      parse_mode: "HTML",
      reply_markup: buildHelpKeyboard(),
    });
  });

  bot.command("reset", async (c) => {
    if (!isAllowedDmContext(c)) return;
    if (c.from?.id) sessions.reset(c.from.id);
    await c.reply("OK, нова сесія.");
  });

  bot.command("budget", async (c) => {
    if (!isAllowedDmContext(c)) return;
    const r = await postJson<BudgetResponse>(
      `${serverUrl}/api/internal/openclaw/budget`,
      internalApiKey,
      { founderUserId },
    );
    if (!r.ok || !r.data) {
      await c.reply(`Не зміг прочитати budget (HTTP ${r.status}).`);
      return;
    }
    const { spentUsd, budgetUsd, remainingUsd } = r.data;
    await c.reply(
      `Сьогодні: $${spentUsd.toFixed(4)} / $${budgetUsd.toFixed(2)} (залишок $${remainingUsd.toFixed(4)}).`,
    );
  });

  bot.command("decisions", async (c) => {
    if (!isAllowedDmContext(c)) return;
    interface DecisionsResp {
      decisions: Array<{
        id: number;
        decided_at: string;
        topic: string;
        git_pr_url: string | null;
      }>;
    }
    const r = await postJson<DecisionsResp>(
      `${serverUrl}/api/internal/openclaw/decisions/list`,
      internalApiKey,
      { founderUserId, limit: 10 },
    );
    if (!r.ok || !r.data) {
      await c.reply(`Не зміг прочитати decisions (HTTP ${r.status}).`);
      return;
    }
    if (r.data.decisions.length === 0) {
      await c.reply("Жодних decisions ще не зафіксовано.");
      return;
    }
    const lines = r.data.decisions.map((d) => {
      const date = d.decided_at.slice(0, 10);
      const pr = d.git_pr_url ? ` — ${d.git_pr_url}` : "";
      return `• ${date} #${d.id} ${d.topic}${pr}`;
    });
    await c.reply(lines.join("\n"));
  });

  // ADR-0037 (Phase 4.5): `/audit` — last N write-actions з опційними
  // фільтрами. Syntax:
  //   /audit [tool] [action] [limit] [since=<dur>] [csv]
  // Argument-order is permissive — `since=` and `csv` tokens are matched
  // first, the remaining positional tokens fall back to the historical
  // tool/action/limit parsing (unknown → tool filter so typos still
  // surface something useful).
  //
  // Defaults:
  //   - no `since=`, no `csv`  → 20 rows (legacy behaviour)
  //   - `since=<dur>`           → 100 rows (full ADR-0037 cap)
  //   - `csv` only              → 20 rows, sent as document
  //   - explicit numeric token  → caller-provided limit (capped at 100)
  bot.command("audit", async (c) => {
    if (!isAllowedDmContext(c)) return;
    if (!rateLimiter.allow(String(c.from?.id))) {
      await c.reply("Rate limit exceeded. Спробуй за хвилину.");
      return;
    }

    const argument = (c.match ?? "").toString().trim();
    const tokens = argument ? argument.split(/\s+/) : [];

    let toolFilter: string | undefined;
    let actionFilter: "approved" | "executed" | "rejected" | undefined;
    let limit: number | undefined;
    let recordedAfterIso: string | undefined;
    let sinceLabel: string | undefined;
    let asCsv = false;

    const ACTIONS = new Set(["approved", "executed", "rejected"] as const);
    for (const tok of tokens) {
      const lower = tok.toLowerCase();
      if (lower === "csv") {
        asCsv = true;
        continue;
      }
      if (lower.startsWith("since=")) {
        const raw = tok.slice("since=".length);
        const durMs = parseDuration(raw);
        if (durMs == null) {
          await c.reply(
            "Невалідний `since=` параметр. Приклади: `since=30m`, " +
              "`since=24h`, `since=7d`. Max 30d.",
          );
          return;
        }
        recordedAfterIso = new Date(Date.now() - durMs).toISOString();
        sinceLabel = raw;
        continue;
      }
      const n = Number(tok);
      if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) {
        limit = Math.min(100, n);
        continue;
      }
      if (ACTIONS.has(tok as "approved" | "executed" | "rejected")) {
        actionFilter = tok as "approved" | "executed" | "rejected";
        continue;
      }
      // Unknown token → treat as tool name (last write wins on duplicate).
      toolFilter = tok;
    }

    const effectiveLimit = limit ?? (recordedAfterIso ? 100 : 20);

    const r = await postJson<{ audits: WriteAuditListItem[] }>(
      `${serverUrl}/api/internal/openclaw/write-audit/list`,
      internalApiKey,
      {
        founderUserId,
        limit: effectiveLimit,
        ...(toolFilter ? { tool: toolFilter } : {}),
        ...(actionFilter ? { action: actionFilter } : {}),
        ...(recordedAfterIso ? { recordedAfterIso } : {}),
      },
    );
    if (!r.ok || !r.data) {
      await c.reply(`Не зміг прочитати write-audit (HTTP ${r.status}).`);
      return;
    }
    if (r.data.audits.length === 0) {
      await c.reply("Жодних write-actions у журналі.");
      return;
    }

    if (asCsv) {
      // CSV-export branch: `replyWithDocument` with an in-memory Buffer.
      // Keep the column-set tight (per roadmap §3.3) so the file is safe
      // to forward — no full input/response payloads.
      const csv = renderWriteAuditCsv(
        r.data.audits.map((a) => ({
          recorded_at: a.recorded_at,
          tool: a.tool,
          action: a.action,
          persona: a.persona,
          http_status: a.http_status,
          approval_id: a.approval_id,
        })),
      );
      const filename = buildAuditCsvFilename();
      const captionParts: string[] = [`${r.data.audits.length} write-actions`];
      if (sinceLabel) captionParts.push(`за ${sinceLabel}`);
      if (toolFilter) captionParts.push(`tool=${toolFilter}`);
      if (actionFilter) captionParts.push(`action=${actionFilter}`);
      await c.replyWithDocument(
        new InputFile(Buffer.from(csv, "utf8"), filename),
        { caption: captionParts.join(", ") },
      );
      return;
    }

    const ACTION_GLYPH: Record<string, string> = {
      approved: "✅",
      executed: "▶️",
      rejected: "❌",
    };
    // Format: `HH:MM glyph tool [persona] (id=…)` — newest first. We
    // intentionally show only time-of-day (date contained in the
    // grouping/timezone of the answer); LLM never reads this output, so
    // pure plaintext is fine.
    const lines = r.data.audits.map((a) => {
      const t = a.recorded_at.slice(11, 16);
      const glyph = ACTION_GLYPH[a.action] ?? "•";
      const persona = a.persona ? ` [${a.persona}]` : "";
      const status =
        a.action === "executed" && a.http_status != null
          ? ` (HTTP ${a.http_status}${a.ok ? "" : " ⚠"})`
          : "";
      return `${t} ${glyph} ${a.tool}${persona}${status} (id=${a.approval_id})`;
    });
    const headerWindow = sinceLabel ? ` (since=${sinceLabel})` : "";
    const header = `Останні ${r.data.audits.length} write-actions${headerWindow}:`;
    await c.reply([header, ...lines].join("\n"));
  });

  // ADR-0038 (Wave 3 §3.2 PR-3): `/alerts pending` — unacked broadcast
  // queue from `Sergeant_alert_bot`. Reads from `tg_alert_acks` via
  // `/api/internal/alerts/pending`. No `notYetEscalated` filter — the
  // founder wants to see *everything* still un-acked, including rows
  // that WF-103 already DM-pinged about (we mark those with `⚠️esc`).
  // O5: audit row in `openclaw_invocations` for every call.
  // Syntax:
  //   /alerts pending [p0|p1|p2|p3] [topic] [N] [since=<dur>]
  bot.command("alerts", async (c) => {
    if (!isAllowedDmContext(c)) return;
    if (!rateLimiter.allow(String(c.from?.id))) {
      await c.reply("Rate limit exceeded. Спробуй за хвилину.");
      return;
    }

    const argument = (c.match ?? "").toString();
    const parsed = parseAlertsCommand(argument);

    if (parsed.subcommand === "help") {
      await c.reply(
        [
          "<b>Usage:</b> <code>/alerts pending [filters]</code>",
          "",
          "Filters:",
          "  • <code>p0</code>/<code>p1</code>/<code>p2</code>/<code>p3</code> — severity",
          "  • <code>since=15m|24h|7d</code> — лише старші за вказаний інтервал",
          "  • число (1..50) — limit (default 20)",
          "  • будь-який інший токен — topic-key",
        ].join("\n"),
        { parse_mode: "HTML" },
      );
      return;
    }
    if (parsed.subcommand === "unknown") {
      await c.reply(parsed.error ?? "Невідома підкоманда.");
      return;
    }
    if (parsed.error) {
      await c.reply(parsed.error);
      return;
    }

    // O5: open audit row before the data-fetch.
    const founderTgUserId = parseFounderTgUserId(
      process.env["OPENCLAW_FOUNDER_TG_USER_ID"],
    );
    const openRes = await postJson<OpenInvocationResponse>(
      `${serverUrl}/api/internal/openclaw/invocations/open`,
      internalApiKey,
      {
        founderUserId,
        founderTgUserId: founderTgUserId ?? c.from?.id ?? 0,
        trigger: "dm",
        userMessage: `/alerts ${argument}`.trim(),
        metadata: {
          telegramChatId: c.chat?.id,
          persona: "cofounder",
          subcommand: parsed.subcommand,
        },
      },
    );
    const invocationId = openRes.data?.invocationId;

    const r = await postJson<{ alerts: PendingAlertItem[] }>(
      `${serverUrl}/api/internal/alerts/pending`,
      internalApiKey,
      {
        ...(parsed.filters.topic ? { topic: parsed.filters.topic } : {}),
        ...(parsed.filters.severity
          ? { severity: parsed.filters.severity }
          : {}),
        ...(parsed.filters.olderThanMinutes
          ? { olderThanMinutes: parsed.filters.olderThanMinutes }
          : {}),
        ...(parsed.filters.limit ? { limit: parsed.filters.limit } : {}),
      },
    );
    if (!r.ok || !r.data) {
      if (invocationId) {
        await postJson(
          `${serverUrl}/api/internal/openclaw/invocations/finalize`,
          internalApiKey,
          {
            invocationId,
            status: "error",
            assistantResponse: null,
            errorMessage: `alerts HTTP ${r.status}`,
            inputTokens: 0,
            outputTokens: 0,
          },
        );
      }
      await c.reply(`Не зміг прочитати alerts (HTTP ${r.status}).`);
      return;
    }

    const reply = formatPendingReply(r.data.alerts, {
      now: new Date(),
      sinceLabel: parsed.sinceLabel,
      filters: parsed.filters,
    });

    // O5: finalize audit row with success.
    if (invocationId) {
      await postJson(
        `${serverUrl}/api/internal/openclaw/invocations/finalize`,
        internalApiKey,
        {
          invocationId,
          status: "success",
          assistantResponse: reply,
          errorMessage: null,
          inputTokens: 0,
          outputTokens: 0,
        },
      );
    }

    await c.reply(reply);
  });

  // O5 / WF-25 (PR-26 #2613 + PR-27 #2659 + O1 #2689): manual-trigger
  // ranok / weekly / monthly ritual-у. Defaults to morning, mirroring
  // 07:00 Kyiv cron. Useful for testing-у і ad-hoc після-launch invocations.
  //
  // Implementation: всі fetch+audit гілки живуть у pure `executeRitualCommand`
  // (ritual-runner.ts) щоб handler лишався thin shim над grammy.
  bot.command("ritual", async (c) => {
    if (!isAllowedDmContext(c)) return;
    if (!rateLimiter.allow(String(c.from?.id))) {
      await c.reply("Rate limit exceeded. Спробуй за хвилину.");
      return;
    }

    const argument = (c.match ?? "").toString();
    const founderTgUserId =
      parseFounderTgUserId(process.env["OPENCLAW_FOUNDER_TG_USER_ID"]) ??
      c.from?.id ??
      0;

    const result = await executeRitualCommand({
      rawArgument: argument,
      founderUserId,
      founderTgUserId,
      ...(c.chat?.id !== undefined ? { telegramChatId: c.chat.id } : {}),
      fetcher: {
        async postMorningBriefing() {
          const r = await postJson<{ markdown?: unknown; data?: unknown }>(
            `${serverUrl}/api/internal/openclaw/briefing/morning`,
            internalApiKey,
            {},
          );
          return { ok: r.ok, status: r.status, data: r.data };
        },
        async openInvocation(input) {
          const r = await postJson<OpenInvocationResponse>(
            `${serverUrl}/api/internal/openclaw/invocations/open`,
            internalApiKey,
            input,
          );
          return {
            ok: r.ok,
            status: r.status,
            invocationId: r.data?.invocationId ?? null,
          };
        },
        async finalizeInvocation(input) {
          const r = await postJson(
            `${serverUrl}/api/internal/openclaw/invocations/finalize`,
            internalApiKey,
            input,
          );
          return { ok: r.ok, status: r.status };
        },
      },
      addBreadcrumb: (b) => Sentry.addBreadcrumb(b),
    });

    await c.reply(result.reply, { parse_mode: "HTML" });
  });
}
