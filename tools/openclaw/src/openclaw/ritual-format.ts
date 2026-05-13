/**
 * `/ritual` slash-command parser + response renderer (pure, no I/O).
 *
 * `/ritual` — manual-trigger для OpenClaw ranok / weekly / monthly ritual-у.
 * Дублює behaviour cron-а WF-25 (PR-27 #2659) для ad-hoc запитів +
 * testing-у.
 *
 * Modes:
 *   - `/ritual` (default) → morning
 *   - `/ritual morning` → POST /api/internal/openclaw/briefing/morning
 *     (PR-26 #2613 + O1 #2689)
 *   - `/ritual weekly` → not implemented yet (O3 follow-up)
 *   - `/ritual monthly` → not implemented yet (O3 follow-up)
 *   - `/ritual help` → show usage
 *
 * Парсер `parseRitualCommand(arg)` — exhaustive: будь-який невідомий token
 * мапиться у `mode: "unknown"` + людський error-message, щоб founder не
 * мав гадати, що пішло не так.
 *
 * Renderer `formatRitualReply(...)` — composes Telegram-HTML response з
 * markdown briefing-у (для morning) або з not-implemented hint-у (weekly /
 * monthly). HTML, не Markdown — той самий choice, що у HELP_TEXT
 * (handler-constants.ts §142): угловий-bracket [tool] не ламає parser.
 */

export type RitualMode = "morning" | "weekly" | "monthly";

export type RitualSubcommand = RitualMode | "help" | "unknown";

export interface ParsedRitualCommand {
  /** Розв'язана підкоманда. `unknown` коли token не зрозумілий. */
  subcommand: RitualSubcommand;
  /**
   * Сирий argument-токен у вигляді, як його ввів user (для логування /
   * debug-у). Empty string коли user написав просто `/ritual`.
   */
  rawArgument: string;
  /**
   * Людський error-message, що показуємо founder-у коли token невідомий.
   * Undefined для valid підкоманд.
   */
  error?: string;
}

/**
 * Парсить argument після `/ritual` (тобто `c.match` у grammy). Першим
 * не-whitespace token-ом визначається підкоманда. Решта token-ів зараз
 * ігнорується — простір лишений на майбутні флаги (`--no-llm`, etc).
 *
 * Empty input → morning (default mode), так щоб `/ritual` без аргументів
 * "просто працював" і не вимагав від founder-а пам'ятати mode-name.
 */
export function parseRitualCommand(rawArgument: string): ParsedRitualCommand {
  const trimmed = (rawArgument ?? "").trim();
  if (trimmed.length === 0) {
    return { subcommand: "morning", rawArgument: "" };
  }
  const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  switch (firstToken) {
    case "morning":
    case "weekly":
    case "monthly":
    case "help":
      return { subcommand: firstToken, rawArgument: trimmed };
    default:
      return {
        subcommand: "unknown",
        rawArgument: trimmed,
        error: `Невідомий режим «${firstToken}». Доступні: morning, weekly, monthly, help.`,
      };
  }
}

/**
 * Help text для `/ritual help`. HTML-format щоб гармонувати з HELP_TEXT
 * у `handler-constants.ts`.
 */
export const RITUAL_HELP_TEXT = [
  "<b>/ritual</b> — manual-trigger ranok / weekly / monthly ritual-у.",
  "",
  "Usage:",
  "  <code>/ritual</code> — те саме, що <code>/ritual morning</code>",
  "  <code>/ritual morning</code> — Stripe / PostHog / PR-черга / n8n / Sentry + LLM-пропозиції (O1)",
  "  <code>/ritual weekly</code> — weekly review (O3, ще не зашиплено)",
  "  <code>/ritual monthly</code> — monthly OKR (O3, ще не зашиплено)",
  "  <code>/ritual help</code> — ця довідка",
  "",
  "Ranok ritual автоматично іде о <b>07:00 Kyiv</b> через WF-25 cron;",
  "цей slash — для ad-hoc запитів і testing-у.",
].join("\n");

/**
 * Renderer для not-implemented mode (weekly / monthly). Повертає
 * однотипний hint щоб не вимагати окремого case-у у handler-і.
 */
export function formatRitualNotImplemented(mode: "weekly" | "monthly"): string {
  const label = mode === "weekly" ? "Weekly review" : "Monthly OKR";
  return [
    `🚧 <b>${label}</b> ще не зашиплено.`,
    "",
    "Тек-роадмепі — O3 follow-up (див.",
    "<code>docs/planning/sprint-roadmap-q2q3-2026.md §B</code>).",
    "Поки що доступний лише <code>/ritual morning</code> (PR-26 / O1).",
  ].join("\n");
}

/**
 * Renderer для morning ritual response. Гнучкий до того, у якому форматі
 * прийшов payload — берем markdown коли він є, інакше fallback на raw
 * data dump (defensive coding на випадок server-side breaking change).
 */
export function formatRitualMorningReply(payload: {
  markdown?: unknown;
  data?: unknown;
}): string {
  if (typeof payload.markdown === "string" && payload.markdown.trim() !== "") {
    return payload.markdown;
  }
  return "Briefing зібрано, але markdown-payload порожній (див. PR-26 builder.ts).";
}

/**
 * Renderer для HTTP-помилки briefing endpoint-у. Показує status + hint,
 * куди дивитись (Sentry / Railway logs / WF-25 cron).
 */
export function formatRitualEndpointFailure(httpStatus: number): string {
  return [
    `❌ Не вдалося зібрати ritual (HTTP ${httpStatus}).`,
    "Перевір Sentry, Railway logs, або n8n WF-98 (errorWorkflow для WF-25).",
  ].join("\n");
}
