/**
 * Console bot HELP_TEXT (M16: MarkdownV2).
 *
 * Authored as a list of `{bold, italic, plain}` pieces that the renderer
 * passes through `escapeTelegramMarkdownV2`. Every MarkdownV2 special
 * character outside our intentional `*…*` / `_…_` markers is escaped
 * via the shared helper, so the bot cannot accidentally send a string
 * Telegram rejects.
 *
 * Lives in its own file (rather than `index.ts`) so the snapshot test
 * can import it without booting the bot's `main()` side-effect.
 *
 * See `docs/security/hardening/M16-telegram-markdown-v2.md`.
 */
import { escapeTelegramMarkdownV2 } from "./security.js";

interface HelpPiece {
  bold?: string;
  italic?: string;
  plain?: string;
}

const HELP_PIECES: HelpPiece[] = [
  {
    bold: "Sergeant Console",
    plain: " - Telegram control surface for ops, marketing, and AI agents",
  },
  { plain: "" },
  { bold: "/ops", plain: " <question> - ask the Ops agent" },
  { bold: "/content", plain: " <topic> - ask the Marketing agent" },
  { plain: "" },
  { bold: "/status", plain: " <scope> - read-only agent/system status" },
  {
    bold: "/plan",
    plain: " <task> - ask n8n to prepare a specialist-agent plan",
  },
  {
    bold: "/assign",
    plain:
      " <specialist> <task> - request agent work; risky work needs approval",
  },
  {
    bold: "/review",
    plain: " <target> - review PR, issue, CI, or workflow state",
  },
  {
    bold: "/run",
    plain: " <check> - request a controlled check or automation",
  },
  {
    bold: "/approve",
    plain: " <task-id|command> - approve a risky dispatcher action",
  },
  { bold: "/cancel", plain: " <task-id> - cancel a queued dispatcher task" },
  { bold: "/logs", plain: " <target> - fetch read-only logs or summaries" },
  { plain: "" },
  { plain: "Free text still routes to ops or marketing by context." },
  { plain: "" },
  { italic: "Version: Telegram control plane + n8n dispatcher" },
];

function renderHelpTextMarkdownV2(): string {
  return HELP_PIECES.map((piece) => {
    let line = "";
    if (piece.bold !== undefined) {
      line += `*${escapeTelegramMarkdownV2(piece.bold)}*`;
    }
    if (piece.italic !== undefined) {
      line += `_${escapeTelegramMarkdownV2(piece.italic)}_`;
    }
    if (piece.plain !== undefined) {
      line += escapeTelegramMarkdownV2(piece.plain);
    }
    return line;
  }).join("\n");
}

export const HELP_TEXT = renderHelpTextMarkdownV2();
