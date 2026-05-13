/**
 * Pure helpers for the `/strategy` Telegram slash-command.
 *
 * `parseStrategyCommand` turns the raw `c.match` string (everything after
 * `/strategy` and the next whitespace) into a discriminated `Parsed`
 * union. Splitting parsing from the bot-handler keeps `handler.ts` thin
 * and lets us unit-test the grammar without spinning up `grammy`.
 *
 * Grammar (mirrors `/strategy` shape requested у task-prompt):
 *
 *   /strategy                              → help
 *   /strategy list                         → list (status='active' default)
 *   /strategy list active|achieved|all     → list with status-filter
 *   /strategy list <persona>               → list scoped to persona
 *   /strategy list <persona> <status>      → both filters
 *   /strategy add <persona>: <goal text>   → create-goal у current week
 *   /strategy done <id>                    → status='achieved'
 *   /strategy abandon <id>                 → status='abandoned'
 *   /strategy carry <id>                   → week_start += 7d, status='carried_over'
 *
 * Persona enum mirrors `STRATEGIC_GOAL_PERSONAS` (helper-side) — kept
 * inline to avoid a cross-package dependency on the server lib.
 */

export const STRATEGY_PERSONAS = [
  "finyk",
  "fizruk",
  "nutrition",
  "routine",
] as const;
export type StrategyPersona = (typeof STRATEGY_PERSONAS)[number];

export const STRATEGY_STATUSES = [
  "active",
  "achieved",
  "abandoned",
  "carried_over",
] as const;
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number];

/** `list`-subcommand status-filter; `'all'` means no filter. */
export type StrategyListStatusFilter = StrategyStatus | "all";

export type ParsedStrategyCommand =
  | { kind: "help" }
  | {
      kind: "list";
      persona?: StrategyPersona;
      status?: StrategyListStatusFilter;
    }
  | { kind: "add"; persona: StrategyPersona; goalText: string }
  | { kind: "done"; id: number }
  | { kind: "abandon"; id: number }
  | { kind: "carry"; id: number }
  | { kind: "error"; message: string };

function isPersona(token: string): token is StrategyPersona {
  return (STRATEGY_PERSONAS as readonly string[]).includes(token);
}

function isListStatusFilter(token: string): token is StrategyListStatusFilter {
  return (
    token === "all" || (STRATEGY_STATUSES as readonly string[]).includes(token)
  );
}

/**
 * Parse `c.match` of `/strategy` command. Empty/whitespace input → help.
 * Returns `{ kind: 'error' }` for malformed numeric IDs / unknown
 * subcommands so caller can render a friendly message без throw.
 */
export function parseStrategyCommand(input: string): ParsedStrategyCommand {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { kind: "help" };

  const firstSpace = trimmed.search(/\s/);
  const subcommand =
    firstSpace === -1
      ? trimmed.toLowerCase()
      : trimmed.slice(0, firstSpace).toLowerCase();
  const rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

  switch (subcommand) {
    case "help":
      return { kind: "help" };

    case "list": {
      if (rest.length === 0) return { kind: "list", status: "active" };
      const tokens = rest.split(/\s+/).map((t) => t.toLowerCase());
      let persona: StrategyPersona | undefined;
      let status: StrategyListStatusFilter | undefined;
      for (const token of tokens) {
        if (isPersona(token)) {
          persona = token;
          continue;
        }
        if (isListStatusFilter(token)) {
          status = token;
          continue;
        }
        return {
          kind: "error",
          message: `Невідомий filter '${token}'. Підтримується: persona (${STRATEGY_PERSONAS.join("|")}) і status (active|achieved|abandoned|carried_over|all).`,
        };
      }
      // Дефолт `active` коли persona задано без status — найчастіший use-case.
      if (status === undefined) status = "active";
      return {
        kind: "list",
        ...(persona !== undefined ? { persona } : {}),
        ...(status !== undefined ? { status } : {}),
      };
    }

    case "add": {
      // Grammar: `<persona>: <goal text>`. Кoлoн обов'язковий; інакше
      // парсинг неоднозначний (текст-goal-у може містити пробіли).
      const colonIdx = rest.indexOf(":");
      if (colonIdx === -1) {
        return {
          kind: "error",
          message:
            "Формат: `/strategy add <persona>: <goal text>`. Приклад: `/strategy add finyk: cut coffee spend by 60%`.",
        };
      }
      const personaToken = rest.slice(0, colonIdx).trim().toLowerCase();
      const goalText = rest.slice(colonIdx + 1).trim();
      if (!isPersona(personaToken)) {
        return {
          kind: "error",
          message: `Невідомий persona '${personaToken}'. Доступні: ${STRATEGY_PERSONAS.join(", ")}.`,
        };
      }
      if (goalText.length === 0) {
        return {
          kind: "error",
          message: "Goal text порожній — нічого додавати.",
        };
      }
      return { kind: "add", persona: personaToken, goalText };
    }

    case "done":
    case "abandon":
    case "carry": {
      const id = parseGoalId(rest);
      if (id === null) {
        return {
          kind: "error",
          message: `Формат: \`/strategy ${subcommand} <id>\`. ID має бути додатнім цілим числом.`,
        };
      }
      return { kind: subcommand as "done" | "abandon" | "carry", id };
    }

    default:
      return {
        kind: "error",
        message: `Невідомий subcommand '${subcommand}'. Спробуй \`/strategy help\`.`,
      };
  }
}

function parseGoalId(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Status-glyph для UI-render-у `/strategy list`. Емоджі мають бути
 * 1-char-wide на iOS/Android (без variation-selector-16 issue) — обрав
 * базові з Unicode 6.0 base.
 */
export const STRATEGY_STATUS_GLYPH: Record<StrategyStatus, string> = {
  active: "🟢",
  achieved: "✅",
  abandoned: "❌",
  carried_over: "↪️",
};

/**
 * Persona-glyph для group-header-у `/strategy list`. Прозорий mapping
 * до tooltip-ів finyk/fizruk/nutrition/routine.
 */
export const STRATEGY_PERSONA_GLYPH: Record<StrategyPersona, string> = {
  finyk: "💰",
  fizruk: "💪",
  nutrition: "🥗",
  routine: "🔁",
};

export interface StrategyGoalForRender {
  id: number;
  persona: StrategyPersona;
  weekStart: string;
  goalText: string;
  status: StrategyStatus;
}

/**
 * Format the list-reply: group by persona, persona-emoji у header-і,
 * status-glyph і ID у кожному рядку. Goal-text truncate-иться до
 * `MAX_TEXT_PREVIEW` символів щоб Telegram-message не лопнув на 4096.
 *
 * Якщо результат порожній — повертає короткий "no goals" message.
 */
const MAX_TEXT_PREVIEW = 200;

export function formatStrategyList(
  goals: ReadonlyArray<StrategyGoalForRender>,
  opts: {
    status?: StrategyListStatusFilter;
    persona?: StrategyPersona;
  } = {},
): string {
  if (goals.length === 0) {
    const statusLabel =
      opts.status && opts.status !== "all" ? ` (${opts.status})` : "";
    const personaLabel = opts.persona ? ` для ${opts.persona}` : "";
    return `Жодних strategic goals${personaLabel}${statusLabel}.`;
  }

  const grouped = new Map<StrategyPersona, StrategyGoalForRender[]>();
  for (const g of goals) {
    const arr = grouped.get(g.persona);
    if (arr) arr.push(g);
    else grouped.set(g.persona, [g]);
  }

  const lines: string[] = [];
  const statusLabel =
    opts.status && opts.status !== "all" ? ` (${opts.status})` : "";
  lines.push(
    `<b>Strategic goals${statusLabel}</b> — ${goals.length} рядк${goals.length === 1 ? "" : "ів"}.`,
  );

  for (const persona of STRATEGY_PERSONAS) {
    const list = grouped.get(persona);
    if (!list || list.length === 0) continue;
    lines.push("");
    lines.push(
      `${STRATEGY_PERSONA_GLYPH[persona]} <b>${persona}</b> (${list.length})`,
    );
    for (const g of list) {
      const truncated =
        g.goalText.length > MAX_TEXT_PREVIEW
          ? g.goalText.slice(0, MAX_TEXT_PREVIEW - 1) + "…"
          : g.goalText;
      const week = g.weekStart;
      lines.push(
        `  ${STRATEGY_STATUS_GLYPH[g.status]} <code>#${g.id}</code> [${week}] ${escapeHtml(truncated)}`,
      );
    }
  }
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Compute `YYYY-MM-DD` понеділка ISO-тижня у Kyiv-local для arbitrary
 * `Date`. Дзеркало `toKyivDateString` + ISO-week-start логіки helper-у,
 * але без cross-package залежності. `/strategy add` використовує цей
 * хелпер для `weekStart`.
 */
export function kyivMondayOf(date: Date): string {
  const kyivPartsFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const partsRaw = kyivPartsFmt.formatToParts(date);
  const lookup = (type: string) =>
    partsRaw.find((p) => p.type === type)?.value ?? "";
  const year = Number(lookup("year"));
  const month = Number(lookup("month"));
  const day = Number(lookup("day"));
  const weekdayShort = lookup("weekday"); // 'Mon', 'Tue', ...

  // Mon → 0, Tue → 1, ..., Sun → 6 (so subtract index from current day)
  const WEEKDAY_INDEX: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const offset = WEEKDAY_INDEX[weekdayShort] ?? 0;

  // Build UTC-midnight date for the Kyiv-calendar day, then subtract offset.
  const baseUtc = Date.UTC(year, month - 1, day);
  const mondayUtc = baseUtc - offset * 24 * 3600 * 1000;
  const monday = new Date(mondayUtc);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(monday);
}
