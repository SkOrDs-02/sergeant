/**
 * OpenClaw Telegram bot command registry.
 *
 * Telegram clients only show the slash-command auto-suggest menu (and the
 * burger "Menu" button) AFTER the bot calls
 * `setMyCommands` / `setChatMenuButton` against the Bot API. Without
 * these, the founder has to remember every command from `HELP_TEXT` —
 * which is exactly the UX gap this module closes.
 *
 * Single source-of-truth: this list mirrors the slash handlers wired up
 * in `handler.ts` (and only those visible to the founder; we do not
 * expose internal callback prefixes like `oc:approve:` here).
 *
 * Bot API constraints (as of May 2026):
 *   • `command` matches `^[a-z0-9_]{1,32}$` (Cyrillic / hyphens are
 *     rejected at the Telegram side — this is also why "/хелп" silently
 *     never matches a handler).
 *   • `description` is 3..256 chars; we keep them ≤64 so Telegram
 *     renders them on a single line on iOS / Android.
 *   • Up to 100 commands per scope.
 *
 * We register at the default scope (no `scope` argument) — OpenClaw is
 * DM-only, so a per-chat scope wouldn't add value, and the default
 * scope already covers all private chats.
 */
import type { Bot } from "grammy";

export interface BotCommandSpec {
  /** Lowercase command without the leading slash. */
  command: string;
  /** Short, single-line, ≤64 chars description shown by the TG client. */
  description: string;
}

/**
 * Display-order matters: Telegram preserves the array order in the
 * command popup. We group by intent so the founder sees the most
 * common cofounder prompts first, then specialists, then dispatcher
 * commands, then service / journal commands at the bottom.
 */
export const OPENCLAW_BOT_COMMANDS: ReadonlyArray<BotCommandSpec> = [
  { command: "help", description: "Show available commands" },
  {
    command: "metrics",
    description: "Weekly metrics digest (Stripe/PostHog/Sentry)",
  },
  {
    command: "digest",
    description: "Growth digest (PostHog + GitHub releases + n8n)",
  },
  // Persona round-table (ADR-0033).
  {
    command: "cofounder",
    description: "Default cofounder synthesis (full toolset)",
  },
  {
    command: "ops",
    description: "Reliability persona (Sentry + n8n + healthz)",
  },
  {
    command: "growth",
    description: "Growth persona (PostHog + releases + strategy)",
  },
  {
    command: "eng",
    description: "Engineering persona (PRs + schema + GitHub)",
  },
  {
    command: "finance",
    description: "Finance persona (Stripe + memory + decisions)",
  },
  {
    command: "council",
    description: "Round-table: ops → growth → eng → finance",
  },
  // Agent-network dispatcher (ADR-0040 / WF-20).
  { command: "status", description: "Read-only agent / system status" },
  { command: "plan", description: "Ask n8n to prepare a specialist plan" },
  {
    command: "assign",
    description: "Request agent work (risky → needs approval)",
  },
  { command: "review", description: "Review PR / issue / CI / workflow state" },
  { command: "run", description: "Request a controlled check or automation" },
  {
    command: "approve",
    description: "Approve a queued risky dispatcher action",
  },
  { command: "cancel", description: "Cancel a queued dispatcher task" },
  { command: "logs", description: "Fetch read-only logs or summaries" },
  // Service / journal.
  { command: "alerts", description: "Unacked Sergeant_alert_bot broadcasts" },
  {
    command: "audit",
    description: "Recent write-actions journal (CSV optional)",
  },
  { command: "decisions", description: "Last recorded cofounder decisions" },
  {
    command: "strategy",
    description: "Per-persona weekly goals (list/add/done/abandon/carry)",
  },
  { command: "budget", description: "Today's OpenClaw spend vs daily cap" },
  {
    command: "ritual",
    description: "Run morning/weekly/monthly briefing on demand",
  },
  {
    command: "ai_cost",
    description: "AI spend rollup; /ai_cost <N> — N-day trend (1..30)",
  },
  {
    command: "openclaw",
    description: "Debug snapshot: persona / WF / invocations / budget",
  },
  {
    command: "mute",
    description: "Pause bot pings (30m/1h/4h/8h/until-morning, off, status)",
  },
  { command: "reset", description: "Start a new cofounder session" },
];

/**
 * Telegram Bot API constraints we want to enforce locally so a typo in
 * this file fails the unit test rather than the production deploy.
 *
 * `MAX_COMMANDS` is Telegram's 100-per-scope cap. We assert ≤32 here
 * because the popup is keyboard-clamped on mobile; if the registry
 * grows past that, we should split into scoped registrations.
 */
const COMMAND_REGEX = /^[a-z0-9_]{1,32}$/;
const DESCRIPTION_MIN = 3;
const DESCRIPTION_MAX = 256;
const SAFE_DESCRIPTION_MAX = 64;
const MAX_COMMANDS = 32;

/**
 * Validate the registry shape. Throws on the first offending entry so
 * misconfiguration is immediately visible (and unit-testable) — never
 * silently swallowed by Telegram's "Bad Request: command name has
 * invalid character" 400.
 */
export function assertOpenClawCommandsValid(
  commands: ReadonlyArray<BotCommandSpec> = OPENCLAW_BOT_COMMANDS,
): void {
  if (commands.length === 0) {
    throw new Error("OpenClaw command registry is empty.");
  }
  if (commands.length > MAX_COMMANDS) {
    throw new Error(
      `OpenClaw command registry has ${commands.length} entries; cap is ${MAX_COMMANDS}.`,
    );
  }
  const seen = new Set<string>();
  for (const entry of commands) {
    if (!COMMAND_REGEX.test(entry.command)) {
      throw new Error(
        `OpenClaw command "${entry.command}" must match /^[a-z0-9_]{1,32}$/.`,
      );
    }
    if (seen.has(entry.command)) {
      throw new Error(`Duplicate OpenClaw command: "${entry.command}".`);
    }
    seen.add(entry.command);
    const len = entry.description.length;
    if (len < DESCRIPTION_MIN || len > DESCRIPTION_MAX) {
      throw new Error(
        `OpenClaw command "${entry.command}" description must be ${DESCRIPTION_MIN}..${DESCRIPTION_MAX} chars (got ${len}).`,
      );
    }
    if (len > SAFE_DESCRIPTION_MAX) {
      throw new Error(
        `OpenClaw command "${entry.command}" description >${SAFE_DESCRIPTION_MAX} chars; trim it so iOS/Android render it on one line (got ${len}).`,
      );
    }
  }
}

/**
 * Push the OpenClaw command registry to Telegram so the founder sees
 * the slash-popup and the chat-level "Menu" button on every client.
 *
 * Idempotent: calling it on every container boot is cheap and overrides
 * any stale registry from a previous deploy.
 *
 * Failure policy: log + swallow. A 5xx from Telegram MUST NOT crash the
 * console process — the bot still serves messages even if the command
 * popup is briefly stale. Validation errors (caught by
 * `assertOpenClawCommandsValid`) ARE thrown so a typo in the registry
 * fails the test suite before it ships.
 */
export async function registerOpenClawBotCommands(bot: Bot): Promise<void> {
  assertOpenClawCommandsValid();
  try {
    await bot.api.setMyCommands(
      OPENCLAW_BOT_COMMANDS.map((c) => ({
        command: c.command,
        description: c.description,
      })),
    );
  } catch (err) {
    console.warn(
      "[openclaw] setMyCommands failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
    return;
  }
  try {
    // `type: "commands"` makes Telegram render a "Menu" button next to
    // the input field that opens the same command list (Bot API §
    // setChatMenuButton). Without it, mobile clients show the generic
    // "/" button only.
    await bot.api.setChatMenuButton({ menu_button: { type: "commands" } });
  } catch (err) {
    console.warn(
      "[openclaw] setChatMenuButton failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }
}
