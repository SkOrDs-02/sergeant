import { describe, expect, it } from "vitest";
import {
  computeExpiryFromDuration,
  formatKyivTime,
  formatMuteEndpointFailure,
  formatMuteOffReply,
  formatMuteSetReply,
  formatMuteStatusActive,
  formatMuteStatusInactive,
  formatRelativeRemaining,
  MUTE_HELP_TEXT,
  parseMuteCommand,
} from "./mute-format.js";

describe("parseMuteCommand", () => {
  it("empty input → help (default — щоб slash без argument-ів показав опції)", () => {
    expect(parseMuteCommand("")).toEqual({
      subcommand: "help",
      rawArgument: "",
    });
    expect(parseMuteCommand("   ")).toEqual({
      subcommand: "help",
      rawArgument: "",
    });
  });

  it("парсить усі 5 duration-токенів case-insensitively", () => {
    expect(parseMuteCommand("30m").subcommand).toBe("30m");
    expect(parseMuteCommand("1H").subcommand).toBe("1h");
    expect(parseMuteCommand("4h").subcommand).toBe("4h");
    expect(parseMuteCommand("8H ").subcommand).toBe("8h");
    expect(parseMuteCommand("Until-Morning").subcommand).toBe("until-morning");
  });

  it("парсить status / off / help підкоманди", () => {
    expect(parseMuteCommand("status").subcommand).toBe("status");
    expect(parseMuteCommand("OFF").subcommand).toBe("off");
    expect(parseMuteCommand("help").subcommand).toBe("help");
  });

  it("повертає unknown + UA error-message на невідомий token", () => {
    const result = parseMuteCommand("foobar");
    expect(result.subcommand).toBe("unknown");
    expect(result.error).toMatch(/foobar/);
    expect(result.error).toMatch(/Доступні/);
  });

  it("ігнорує trailing tokens (зарезервовано на майбутні флаги)", () => {
    const result = parseMuteCommand("1h --silent");
    expect(result.subcommand).toBe("1h");
    expect(result.rawArgument).toBe("1h --silent");
  });
});

describe("computeExpiryFromDuration — fixed-duration", () => {
  it("30m → now + 30 хв", () => {
    const now = new Date("2026-05-13T18:00:00.000Z");
    const expiry = computeExpiryFromDuration("30m", now);
    expect(expiry.getTime() - now.getTime()).toBe(30 * 60_000);
  });

  it("1h → now + 60 хв", () => {
    const now = new Date("2026-05-13T18:00:00.000Z");
    const expiry = computeExpiryFromDuration("1h", now);
    expect(expiry.getTime() - now.getTime()).toBe(60 * 60_000);
  });

  it("4h → now + 240 хв", () => {
    const now = new Date("2026-05-13T18:00:00.000Z");
    const expiry = computeExpiryFromDuration("4h", now);
    expect(expiry.getTime() - now.getTime()).toBe(4 * 60 * 60_000);
  });

  it("8h → now + 480 хв", () => {
    const now = new Date("2026-05-13T18:00:00.000Z");
    const expiry = computeExpiryFromDuration("8h", now);
    expect(expiry.getTime() - now.getTime()).toBe(8 * 60 * 60_000);
  });
});

describe("computeExpiryFromDuration — until-morning", () => {
  it("evening (22:00 Kyiv) → завтра 08:00 Kyiv", () => {
    // 22:00 Kyiv DST(+3) = 19:00 UTC; standard(+2) = 20:00 UTC. Беремо
    // 19:00 UTC — це 22:00 Kyiv у літо (May).
    const now = new Date("2026-05-13T19:00:00.000Z");
    const expiry = computeExpiryFromDuration("until-morning", now);
    // Очікувано: 14 травня 08:00 Kyiv = 05:00 UTC (DST=+3).
    expect(expiry.toISOString()).toBe("2026-05-14T05:00:00.000Z");
  });

  it("post-midnight (03:00 Kyiv) → сьогодні 08:00 Kyiv (founder спить)", () => {
    // 03:00 Kyiv DST(+3) = 00:00 UTC.
    const now = new Date("2026-05-13T00:00:00.000Z");
    const expiry = computeExpiryFromDuration("until-morning", now);
    // Очікувано: 13 травня 08:00 Kyiv = 05:00 UTC.
    expect(expiry.toISOString()).toBe("2026-05-13T05:00:00.000Z");
  });

  it("midday (12:00 Kyiv) → завтра 08:00 Kyiv (founder не сплятиме)", () => {
    // 12:00 Kyiv DST(+3) = 09:00 UTC.
    const now = new Date("2026-05-13T09:00:00.000Z");
    const expiry = computeExpiryFromDuration("until-morning", now);
    expect(expiry.toISOString()).toBe("2026-05-14T05:00:00.000Z");
  });

  it("winter-time 22:00 Kyiv (UTC+2) → завтра 08:00 Kyiv = 06:00 UTC", () => {
    // 2026-01-13 22:00 Kyiv = 20:00 UTC (Ukraine standard time UTC+2 у
    // січні — DST off). Не залежить від того, чи Ukraine перейде назад
    // до DST у майбутньому: ітератор перебирає 5 і 6 UTC-годин і
    // вибере правильну для конкретного дня.
    const now = new Date("2026-01-13T20:00:00.000Z");
    const expiry = computeExpiryFromDuration("until-morning", now);
    expect(expiry.toISOString()).toBe("2026-01-14T06:00:00.000Z");
  });

  it("на межі (07:59 Kyiv) → сьогодні 08:00 Kyiv (≈ 1 хв)", () => {
    // 07:59 Kyiv DST(+3) = 04:59 UTC.
    const now = new Date("2026-05-13T04:59:00.000Z");
    const expiry = computeExpiryFromDuration("until-morning", now);
    expect(expiry.toISOString()).toBe("2026-05-13T05:00:00.000Z");
    expect(expiry.getTime() - now.getTime()).toBe(60_000);
  });

  it("на межі (08:00 Kyiv) → завтра 08:00 Kyiv", () => {
    // 08:00 Kyiv DST(+3) = 05:00 UTC.
    const now = new Date("2026-05-13T05:00:00.000Z");
    const expiry = computeExpiryFromDuration("until-morning", now);
    expect(expiry.toISOString()).toBe("2026-05-14T05:00:00.000Z");
  });
});

describe("formatRelativeRemaining", () => {
  it("returns 'вже завершився' for past expiry", () => {
    expect(
      formatRelativeRemaining(
        "2026-05-13T17:00:00.000Z",
        new Date("2026-05-13T18:00:00.000Z"),
      ),
    ).toBe("вже завершився");
  });

  it("returns minutes for < 1 hour", () => {
    expect(
      formatRelativeRemaining(
        "2026-05-13T18:30:00.000Z",
        new Date("2026-05-13T18:00:00.000Z"),
      ),
    ).toBe("30 хв");
  });

  it("returns 'X год' for exact hours", () => {
    expect(
      formatRelativeRemaining(
        "2026-05-13T22:00:00.000Z",
        new Date("2026-05-13T18:00:00.000Z"),
      ),
    ).toBe("4 год");
  });

  it("returns 'X год Y хв' for mixed", () => {
    expect(
      formatRelativeRemaining(
        "2026-05-13T20:30:00.000Z",
        new Date("2026-05-13T18:00:00.000Z"),
      ),
    ).toBe("2 год 30 хв");
  });

  it("returns 'невідомо' for invalid ISO", () => {
    expect(formatRelativeRemaining("not-iso")).toBe("невідомо");
  });
});

describe("formatKyivTime", () => {
  it("renders HH:mm in Europe/Kyiv (DST=+3 у травні)", () => {
    expect(formatKyivTime("2026-05-14T05:00:00.000Z")).toBe("08:00");
  });

  it("renders HH:mm in Europe/Kyiv (winter standard=+2)", () => {
    expect(formatKyivTime("2026-01-14T06:00:00.000Z")).toBe("08:00");
  });

  it("returns input unchanged when not valid ISO", () => {
    expect(formatKyivTime("not-iso")).toBe("not-iso");
  });
});

describe("formatMuteSetReply", () => {
  it("renders HTML з duration, expiry-time, remaining hint", () => {
    const now = new Date("2026-05-13T18:00:00.000Z");
    const expiry = "2026-05-13T19:00:00.000Z";
    const reply = formatMuteSetReply("1h", expiry, now);
    expect(reply).toContain("🔕");
    expect(reply).toContain("Mute активовано");
    expect(reply).toContain("1h");
    expect(reply).toContain("22:00"); // 19:00 UTC = 22:00 Kyiv (DST)
    expect(reply).toContain("1 год");
    expect(reply).toContain("/mute off");
  });
});

describe("formatMuteOffReply", () => {
  it("renders cheerful 'mute зняте' message", () => {
    const reply = formatMuteOffReply();
    expect(reply).toContain("🔔");
    expect(reply).toContain("Mute знято");
  });
});

describe("formatMuteStatusActive", () => {
  it("renders remaining + Kyiv-time + optional reason", () => {
    const now = new Date("2026-05-13T18:00:00.000Z");
    const reply = formatMuteStatusActive(
      "2026-05-13T22:00:00.000Z",
      "sleep",
      now,
    );
    expect(reply).toContain("Mute активний");
    expect(reply).toContain("4 год");
    expect(reply).toContain("01:00"); // 22:00 UTC = 01:00 Kyiv next day
    expect(reply).toContain("sleep");
  });

  it("omits reason line when reason is null", () => {
    const now = new Date("2026-05-13T18:00:00.000Z");
    const reply = formatMuteStatusActive("2026-05-13T19:00:00.000Z", null, now);
    expect(reply).not.toContain("Причина:");
  });

  it("escapes HTML у reason (XSS guard)", () => {
    const now = new Date("2026-05-13T18:00:00.000Z");
    const reply = formatMuteStatusActive(
      "2026-05-13T19:00:00.000Z",
      "<script>x</script>",
      now,
    );
    expect(reply).toContain("&lt;script&gt;");
    expect(reply).not.toContain("<script>");
  });
});

describe("formatMuteStatusInactive", () => {
  it("renders 'mute неактивний' з нагадуванням про /mute help", () => {
    const reply = formatMuteStatusInactive();
    expect(reply).toContain("Mute неактивний");
    expect(reply).toContain("/mute help");
  });
});

describe("formatMuteEndpointFailure", () => {
  it("includes HTTP status code", () => {
    expect(formatMuteEndpointFailure(503)).toContain("HTTP 503");
    expect(formatMuteEndpointFailure(500)).toContain("HTTP 500");
  });
});

describe("MUTE_HELP_TEXT", () => {
  it("lists all 5 durations + status/off/help", () => {
    expect(MUTE_HELP_TEXT).toContain("/mute 30m");
    expect(MUTE_HELP_TEXT).toContain("/mute 1h");
    expect(MUTE_HELP_TEXT).toContain("/mute 4h");
    expect(MUTE_HELP_TEXT).toContain("/mute 8h");
    expect(MUTE_HELP_TEXT).toContain("/mute until-morning");
    expect(MUTE_HELP_TEXT).toContain("/mute status");
    expect(MUTE_HELP_TEXT).toContain("/mute off");
    expect(MUTE_HELP_TEXT).toContain("/mute help");
  });

  it("mentions critical override semantics", () => {
    expect(MUTE_HELP_TEXT).toContain("Critical");
    expect(MUTE_HELP_TEXT).toContain("P0");
  });
});
