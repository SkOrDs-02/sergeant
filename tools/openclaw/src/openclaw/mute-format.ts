/**
 * `/mute` slash-command parser + response renderer (pure, no I/O).
 *
 * `/mute` — founder DM "do not disturb" пауза. Дозволяє вимкнути outbound
 * bot pings (alerts, ranok briefing, /ritual digests) на N часу без
 * env-var changes і без рестартів. Critical alerts (severity=P0) bypass-
 * аються — gate-implementation в `apps/server/src/routes/internal/alerts.ts`.
 *
 * Modes:
 *   - `/mute 30m` / `/mute 1h` / `/mute 4h` / `/mute 8h` → set mute
 *     на duration relative до now.
 *   - `/mute until-morning` → set mute до 08:00 наступного дня Europe/Kyiv
 *     (якщо зараз Kyiv-час < 08:00, то до 08:00 сьогодні — спить).
 *   - `/mute status` → show remaining time (no state mutation).
 *   - `/mute off` → manual resume (clear mute).
 *   - `/mute help` → show usage.
 *
 * Парсер `parseMuteCommand(arg)` exhaustive — будь-який невідомий token →
 * `subcommand: "unknown"` + людський error-message.
 *
 * Renderer functions composeать Telegram-HTML response. HTML, не Markdown
 * — той самий choice, що у `ritual-format.ts` / `status-format.ts`:
 * кутові-bracket у токенах не ламають parser.
 */

// ─────────────────────────────────────────────────────────────────────────
// Types & parser
// ─────────────────────────────────────────────────────────────────────────

export type MuteDuration = "30m" | "1h" | "4h" | "8h" | "until-morning";

export type MuteSubcommand =
  | MuteDuration
  | "status"
  | "off"
  | "help"
  | "unknown";

export interface ParsedMuteCommand {
  subcommand: MuteSubcommand;
  /** Сирий argument-токен (для логування / debug-у). */
  rawArgument: string;
  /** Людський error-message коли token невідомий. Undefined для valid. */
  error?: string;
}

const DURATION_TOKENS: ReadonlySet<MuteDuration> = new Set([
  "30m",
  "1h",
  "4h",
  "8h",
  "until-morning",
]);

/**
 * Парсить argument після `/mute`. Empty input → `help` (default) —
 * щоб user, що випадково набрав просто `/mute`, побачив список
 * варіантів замість silent no-op. Це відрізняється від `/ritual`, де
 * empty → morning (там "default action" корисний), а тут default
 * action був би небезпечним (mute наосліп без знання duration).
 */
export function parseMuteCommand(rawArgument: string): ParsedMuteCommand {
  const trimmed = (rawArgument ?? "").trim();
  if (trimmed.length === 0) {
    return { subcommand: "help", rawArgument: "" };
  }
  const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (DURATION_TOKENS.has(firstToken as MuteDuration)) {
    return { subcommand: firstToken as MuteDuration, rawArgument: trimmed };
  }
  switch (firstToken) {
    case "status":
    case "off":
    case "help":
      return { subcommand: firstToken, rawArgument: trimmed };
    default:
      return {
        subcommand: "unknown",
        rawArgument: trimmed,
        error: `Невідомий аргумент «${firstToken}». Доступні: 30m, 1h, 4h, 8h, until-morning, status, off, help.`,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Duration → expiry computation
// ─────────────────────────────────────────────────────────────────────────

const DURATION_MINUTES: Record<
  Exclude<MuteDuration, "until-morning">,
  number
> = {
  "30m": 30,
  "1h": 60,
  "4h": 4 * 60,
  "8h": 8 * 60,
};

/**
 * Парсить Kyiv-local hour з UTC-instant-у. Враховує DST (якщо в
 * майбутньому Ukraine знову буде переходити). Returns 0..23.
 */
function kyivHour(now: Date): number {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return Number.parseInt(hourStr, 10);
}

interface KyivYmd {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

function kyivYmd(now: Date): KyivYmd {
  // `en-CA` форматує як `YYYY-MM-DD` без локалізаційних сюрпризів.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-");
  return {
    year: Number(parts[0]),
    month: Number(parts[1]),
    day: Number(parts[2]),
  };
}

/**
 * Construct UTC-instant, що рендериться як 08:00 Europe/Kyiv на цільовий
 * Kyiv-день. Iterative по UTC-hour (5 або 6, залежно від DST=+3 / +2) —
 * один з них дасть Kyiv-hour=8.
 */
function utcInstantFor8amKyiv(target: KyivYmd): Date {
  for (const hourUtc of [5, 6]) {
    const candidate = new Date(
      Date.UTC(target.year, target.month - 1, target.day, hourUtc, 0, 0),
    );
    if (kyivHour(candidate) === 8) return candidate;
  }
  // Defensive fallback — should never hit. UTC+3 → 05:00 UTC = 08:00 Kyiv.
  return new Date(Date.UTC(target.year, target.month - 1, target.day, 5, 0, 0));
}

/**
 * Адітивний крок по Kyiv-календарю на N days. Для `until-morning` нам
 * треба inc 0 або 1 (today або tomorrow); ця helper — generic для
 * майбутніх mode-ів.
 */
function addKyivDays(ymd: KyivYmd, days: number): KyivYmd {
  // Anchor at UTC-noon (Kyiv = noon ± few h, безпечно від DST-edge);
  // adding `days * 86400_000 ms` — точний день у будь-якій tz, якщо
  // потім переформатуємо back у Kyiv.
  const anchor = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12, 0, 0));
  const shifted = new Date(anchor.getTime() + days * 86_400_000);
  return kyivYmd(shifted);
}

/**
 * Обчислює UTC-expiry-instant для всіх 5 duration-ів.
 *
 * Для часових duration-ів (`30m` / `1h` / `4h` / `8h`) — простий
 * relative offset від `now`.
 *
 * Для `until-morning`:
 *   - якщо зараз Kyiv-час < 08:00 → expiry = сьогодні 08:00 Kyiv
 *     (founder спить, прокидається сьогодні);
 *   - інакше → expiry = завтра 08:00 Kyiv (founder йде спати ввечері).
 */
export function computeExpiryFromDuration(
  duration: MuteDuration,
  now: Date = new Date(),
): Date {
  if (duration === "until-morning") {
    const todayKyiv = kyivYmd(now);
    const hourKyiv = kyivHour(now);
    const target = hourKyiv < 8 ? todayKyiv : addKyivDays(todayKyiv, 1);
    return utcInstantFor8amKyiv(target);
  }
  const minutes = DURATION_MINUTES[duration];
  return new Date(now.getTime() + minutes * 60_000);
}

// ─────────────────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────────────────

/** Help text для `/mute help` і empty-input default. HTML-format. */
export const MUTE_HELP_TEXT = [
  "<b>/mute</b> — призупинити вихідні bot pings (DM founder).",
  "",
  "Usage:",
  "  <code>/mute 30m</code> — 30 хвилин",
  "  <code>/mute 1h</code> — 1 година",
  "  <code>/mute 4h</code> — 4 години",
  "  <code>/mute 8h</code> — 8 годин (≈ ніч)",
  "  <code>/mute until-morning</code> — до 08:00 Kyiv наступного ранку",
  "  <code>/mute status</code> — показати скільки лишилось",
  "  <code>/mute off</code> — зняти mute зараз",
  "  <code>/mute help</code> — ця довідка",
  "",
  "Critical alerts (severity=P0) <b>НЕ</b> silenced — DB outage, payment-fail",
  "тощо все одно прорвуться. Звичайні alerts, briefing, ritual digests —",
  "skip-аються з breadcrumb <code>[openclaw-muted-skip]</code> у Sentry.",
].join("\n");

/** Telegram HTML escape — той самий patterns, що у `status-format.ts`. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Форматує relative-time delta «через X хв / Y год» (UA). Negative
 * delta → "вже завершився".
 */
export function formatRelativeRemaining(
  expiryIso: string,
  now: Date = new Date(),
): string {
  const expiry = new Date(expiryIso);
  if (Number.isNaN(expiry.getTime())) return "невідомо";
  const diffMs = expiry.getTime() - now.getTime();
  if (diffMs <= 0) return "вже завершився";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) {
    return `${diffMin} хв`;
  }
  const hours = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (remMin === 0) return `${hours} год`;
  return `${hours} год ${remMin} хв`;
}

/**
 * Форматує Kyiv-локальний час «HH:mm» для UI-friendly виводу expiry.
 */
export function formatKyivTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Reply на successful `/mute <duration>`. */
export function formatMuteSetReply(
  duration: MuteDuration,
  expiryIso: string,
  now: Date = new Date(),
): string {
  const remaining = formatRelativeRemaining(expiryIso, now);
  const kyivTime = formatKyivTime(expiryIso);
  return [
    `🔕 <b>Mute активовано</b> на ${escapeHtml(duration)}.`,
    `Тиша до <b>${escapeHtml(kyivTime)}</b> Kyiv (~${escapeHtml(remaining)}).`,
    "",
    "Зняти: <code>/mute off</code>. Critical-severity alerts усе ще прорвуться.",
  ].join("\n");
}

/** Reply на `/mute off`. */
export function formatMuteOffReply(): string {
  return [
    "🔔 <b>Mute знято.</b>",
    "Усі outbound pings (alerts, ranok briefing, ritual) відновлені.",
  ].join("\n");
}

/** Reply на `/mute status` коли mute активний. */
export function formatMuteStatusActive(
  expiryIso: string,
  reason: string | null,
  now: Date = new Date(),
): string {
  const remaining = formatRelativeRemaining(expiryIso, now);
  const kyivTime = formatKyivTime(expiryIso);
  const lines = [
    "🔕 <b>Mute активний.</b>",
    `Залишилось: <b>${escapeHtml(remaining)}</b> (до ${escapeHtml(kyivTime)} Kyiv).`,
  ];
  if (reason) {
    lines.push(`Причина: <code>${escapeHtml(reason)}</code>.`);
  }
  lines.push("");
  lines.push("Зняти: <code>/mute off</code>.");
  return lines.join("\n");
}

/** Reply на `/mute status` коли mute неактивний. */
export function formatMuteStatusInactive(): string {
  return [
    "🔔 <b>Mute неактивний.</b>",
    "Усі outbound pings працюють штатно.",
    "",
    `Виставити: <code>/mute 1h</code> (або інша duration; <code>/mute help</code>).`,
  ].join("\n");
}

/** Reply на endpoint-failure (HTTP non-2xx). */
export function formatMuteEndpointFailure(httpStatus: number): string {
  return [
    "⚠️ Internal endpoint повернув HTTP " + httpStatus + ".",
    "Mute-state НЕ змінено. Спробуй ще раз; якщо повторюється — пінгни через ritual.",
  ].join("\n");
}
