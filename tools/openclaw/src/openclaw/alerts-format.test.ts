import { describe, expect, it } from "vitest";
import {
  formatAlertAge,
  formatHistoryReply,
  formatPendingReply,
  parseAlertsCommand,
  shortAlertId,
  type HistoryReplyPayload,
  type HistoryWorkflowStats,
  type PendingAlertItem,
} from "./alerts-format.js";

/**
 * Unit-tests for the `/alerts pending` slash-command parser + renderer
 * (Wave 3 §3.2 PR-3, ADR-0038). Exercising token-permissiveness and
 * age/severity rendering corners we'd otherwise have to reproduce by
 * hand-firing real Telegram callbacks.
 */

function alert(overrides: Partial<PendingAlertItem> = {}): PendingAlertItem {
  return {
    id: 1,
    posted_at: "2026-05-03T10:00:00.000Z",
    alert_id: "wf-04:exec-12345",
    topic: "incidents",
    severity: "P0",
    summary: "Sentry: 5xx spike on /api/auth (50→210 rpm)",
    ack_at: null,
    escalated_at: null,
    ...overrides,
  };
}

describe("parseAlertsCommand", () => {
  it("defaults to subcommand=pending with no filters on empty argument", () => {
    const out = parseAlertsCommand("");
    expect(out.subcommand).toBe("pending");
    expect(out.filters).toEqual({});
    expect(out.error).toBeUndefined();
  });

  it("ignores leading/trailing whitespace", () => {
    const out = parseAlertsCommand("   pending   ");
    expect(out.subcommand).toBe("pending");
    expect(out.filters.limit).toBe(20);
  });

  it("parses pending with default limit=20", () => {
    const out = parseAlertsCommand("pending");
    expect(out.subcommand).toBe("pending");
    expect(out.filters.limit).toBe(20);
  });

  it("rejects unknown subcommand", () => {
    const out = parseAlertsCommand("nope");
    expect(out.subcommand).toBe("unknown");
    expect(out.error).toMatch(/Невідома підкоманда/);
  });

  it("recognises help / ?", () => {
    expect(parseAlertsCommand("help").subcommand).toBe("help");
    expect(parseAlertsCommand("?").subcommand).toBe("help");
  });

  it("parses severity filter (case-insensitive)", () => {
    const out = parseAlertsCommand("pending p0");
    expect(out.filters.severity).toBe("P0");
    const out2 = parseAlertsCommand("pending P1");
    expect(out2.filters.severity).toBe("P1");
  });

  it("parses since=<dur> into olderThanMinutes (rounded up to 1)", () => {
    const out = parseAlertsCommand("pending since=24h");
    expect(out.filters.olderThanMinutes).toBe(24 * 60);
    expect(out.sinceLabel).toBe("24h");
  });

  it("clamps tiny since= durations to >=1 minute", () => {
    // `30s` → 0.5min; we never want to ship `0` to the SQL filter
    // (which would become `make_interval(mins => 0)` and degenerate to
    // a NOW() comparison that returns nothing).
    const out = parseAlertsCommand("pending since=30s");
    expect(out.filters.olderThanMinutes).toBe(1);
  });

  it("returns error on invalid since=", () => {
    const out = parseAlertsCommand("pending since=24hr");
    expect(out.error).toMatch(/Невалідний `since=`/);
    // We still keep subcommand=pending so the caller can choose to
    // surface the error and not retry.
    expect(out.subcommand).toBe("pending");
  });

  it("parses numeric token as limit, capped at 50", () => {
    expect(parseAlertsCommand("pending 5").filters.limit).toBe(5);
    expect(parseAlertsCommand("pending 999").filters.limit).toBe(50);
  });

  it("falls back to topic filter on unknown token", () => {
    const out = parseAlertsCommand("pending revenue");
    expect(out.filters.topic).toBe("revenue");
    expect(out.filters.severity).toBeUndefined();
  });

  it("supports mixed positional args in any order", () => {
    const out = parseAlertsCommand("pending revenue since=7d 10 p1");
    expect(out.filters.topic).toBe("revenue");
    expect(out.sinceLabel).toBe("7d");
    expect(out.filters.olderThanMinutes).toBe(7 * 24 * 60);
    expect(out.filters.limit).toBe(10);
    expect(out.filters.severity).toBe("P1");
  });

  it("parses history subcommand with default 7d / top-10", () => {
    const out = parseAlertsCommand("history");
    expect(out.subcommand).toBe("history");
    expect(out.historyFilters).toEqual({ days: 7, limit: 10 });
    expect(out.error).toBeUndefined();
  });

  it("parses history with explicit days + limit", () => {
    const out = parseAlertsCommand("history 14 limit=20");
    expect(out.subcommand).toBe("history");
    expect(out.historyFilters).toEqual({ days: 14, limit: 20 });
  });

  it("clamps history limit at 50", () => {
    const out = parseAlertsCommand("history 3 limit=999");
    expect(out.historyFilters).toEqual({ days: 3, limit: 50 });
  });

  it("rejects history days beyond 30", () => {
    const out = parseAlertsCommand("history 60");
    expect(out.subcommand).toBe("history");
    expect(out.error).toContain("30 днів");
  });

  it("rejects history with unknown token", () => {
    const out = parseAlertsCommand("history bogus");
    expect(out.error).toContain("bogus");
  });

  it("rejects history limit=0 / negative", () => {
    expect(parseAlertsCommand("history limit=0").error).toContain("limit=");
    expect(parseAlertsCommand("history limit=-5").error).toContain("limit=");
  });
});

describe("shortAlertId", () => {
  it("returns input unchanged when ≤16 chars", () => {
    expect(shortAlertId("wf-04:exec-1234")).toBe("wf-04:exec-1234");
  });

  it("truncates and adds ellipsis past 16 chars", () => {
    expect(shortAlertId("wf-04:exec-1234567890abcdef")).toBe(
      "wf-04:exec-12345…",
    );
  });
});

describe("formatAlertAge", () => {
  const NOW = new Date("2026-05-03T12:00:00.000Z");

  it("shows minutes under 1h", () => {
    expect(formatAlertAge("2026-05-03T11:55:00.000Z", NOW)).toBe("5m");
    expect(formatAlertAge("2026-05-03T11:01:00.000Z", NOW)).toBe("59m");
  });

  it("shows hours from 1h..23h", () => {
    expect(formatAlertAge("2026-05-03T11:00:00.000Z", NOW)).toBe("1h");
    expect(formatAlertAge("2026-05-02T13:00:00.000Z", NOW)).toBe("23h");
  });

  it("shows days from 1d+", () => {
    expect(formatAlertAge("2026-05-02T12:00:00.000Z", NOW)).toBe("1d");
    expect(formatAlertAge("2026-04-25T12:00:00.000Z", NOW)).toBe("8d");
  });

  it("clamps negative deltas to 0m (clock skew)", () => {
    expect(formatAlertAge("2026-05-03T12:01:00.000Z", NOW)).toBe("0m");
  });

  it("returns ? on unparseable input", () => {
    expect(formatAlertAge("not-a-date", NOW)).toBe("?");
  });
});

describe("formatPendingReply", () => {
  const NOW = new Date("2026-05-03T12:00:00.000Z");

  it("returns a clear-queue message when list is empty", () => {
    const out = formatPendingReply([], { now: NOW });
    expect(out).toBe("Всі алерти прочитані ✅");
  });

  it("echoes filters in empty-state message", () => {
    const out = formatPendingReply([], {
      now: NOW,
      sinceLabel: "24h",
      filters: { severity: "P0", topic: "incidents" },
    });
    expect(out).toBe(
      "Всі алерти прочитані ✅ (since=24h, P0, topic=incidents)",
    );
  });

  it("renders header + one line per alert with severity glyph and age", () => {
    const out = formatPendingReply(
      [
        alert({
          posted_at: "2026-05-03T11:30:00.000Z",
          alert_id: "wf-04:1",
          severity: "P0",
          summary: "Sentry 5xx spike",
        }),
        alert({
          posted_at: "2026-05-03T10:45:00.000Z",
          alert_id: "wf-22:9",
          severity: "P1",
          topic: "revenue",
          summary: "Stripe failed_charges +12%",
        }),
      ],
      { now: NOW },
    );
    const lines = out.split("\n");
    expect(lines[0]).toBe("2 unacked alerts:");
    expect(lines[1]).toBe(
      "11:30 🔴 [incidents] Sentry 5xx spike (id=wf-04:1, age=30m)",
    );
    expect(lines[2]).toBe(
      "10:45 🟠 [revenue] Stripe failed_charges +12% (id=wf-22:9, age=1h)",
    );
  });

  it("singularises header for exactly one alert", () => {
    const out = formatPendingReply([alert()], { now: NOW });
    expect(out.split("\n")[0]).toBe("1 unacked alert:");
  });

  it("marks rows that already escalated", () => {
    const out = formatPendingReply(
      [
        alert({
          posted_at: "2026-05-03T11:00:00.000Z",
          escalated_at: "2026-05-03T11:15:00.000Z",
        }),
      ],
      { now: NOW },
    );
    expect(out).toContain("⚠️esc");
  });

  it("renders em-dash when summary is null", () => {
    const out = formatPendingReply([alert({ summary: null })], { now: NOW });
    expect(out).toContain("[incidents] —");
  });

  it("truncates long summaries", () => {
    const long = "x".repeat(200);
    const out = formatPendingReply([alert({ summary: long })], { now: NOW });
    expect(out).not.toContain("x".repeat(200));
    expect(out).toContain("…");
  });

  it("handles missing-time posted_at defensively", () => {
    const out = formatPendingReply([alert({ posted_at: "bogus" })], {
      now: NOW,
    });
    expect(out).toContain("??:??");
  });
});

describe("formatHistoryReply", () => {
  function wf(
    overrides: Partial<HistoryWorkflowStats> = {},
  ): HistoryWorkflowStats {
    return {
      workflowId: "wf-15",
      total: 10,
      acked: 7,
      escalated: 2,
      repeated: 1,
      sentryWarned: 0,
      ackRatePct: 70,
      avgTtaMinutes: 12.5,
      ...overrides,
    };
  }

  function payload(
    overrides: Partial<HistoryReplyPayload> = {},
  ): HistoryReplyPayload {
    return {
      workflows: [wf()],
      summary: {
        daysBack: 7,
        total: 10,
        acked: 7,
        escalated: 2,
        repeated: 1,
        sentryWarned: 0,
        ackRatePct: 70,
        avgTtaMinutes: 12.5,
        workflowCount: 1,
      },
      ...overrides,
    };
  }

  it("renders empty-state when summary.total=0", () => {
    const out = formatHistoryReply({
      workflows: [],
      summary: {
        daysBack: 14,
        total: 0,
        acked: 0,
        escalated: 0,
        repeated: 0,
        sentryWarned: 0,
        ackRatePct: 0,
        avgTtaMinutes: null,
        workflowCount: 0,
      },
    });
    expect(out).toContain("last 14d");
    expect(out).toContain("0 broadcasts");
    expect(out).toContain("Жодного алерту");
  });

  it("renders header + per-workflow rows + totals footer", () => {
    const out = formatHistoryReply(payload());
    const lines = out.split("\n");
    expect(lines[0]).toContain(
      "Alert history — last 7d (10 broadcasts, 1 workflows)",
    );
    expect(lines[1]).toContain("🟢 wf-15");
    expect(lines[1]).toContain("7/10 acked (70%)");
    expect(lines[1]).toContain("avg-tta 13m");
    // Tier counters surfaced when > 0.
    expect(lines[1]).toContain("[T1×2 T2×1]");
    // Footer with totals.
    expect(out).toContain("———");
    expect(out).toContain("Totals: 7/10 acked (70%)");
    expect(out).toContain("T1 2 · T2 1 · T3 0");
  });

  it("uses 🟡 glyph in 30..69% ack-rate band and 🔴 below", () => {
    const out = formatHistoryReply(
      payload({
        workflows: [
          wf({ workflowId: "wf-22", ackRatePct: 50 }),
          wf({ workflowId: "wf-08", ackRatePct: 20 }),
        ],
      }),
    );
    expect(out).toContain("🟡 wf-22");
    expect(out).toContain("🔴 wf-08");
  });

  it("omits tier-counter brackets when all tiers are zero", () => {
    const out = formatHistoryReply(
      payload({
        workflows: [
          wf({ escalated: 0, repeated: 0, sentryWarned: 0, ackRatePct: 100 }),
        ],
      }),
    );
    const row = out.split("\n")[1] ?? "";
    expect(row).not.toContain("[T");
  });

  it("renders avg-tta in hours + minutes when ≥60 min", () => {
    const out = formatHistoryReply(
      payload({
        workflows: [wf({ avgTtaMinutes: 95 })],
      }),
    );
    expect(out).toContain("avg-tta 1h 35m");
  });

  it("renders em-dash when avg-tta is null", () => {
    const out = formatHistoryReply(
      payload({
        workflows: [wf({ avgTtaMinutes: null, acked: 0 })],
        summary: {
          daysBack: 7,
          total: 10,
          acked: 0,
          escalated: 0,
          repeated: 0,
          sentryWarned: 0,
          ackRatePct: 0,
          avgTtaMinutes: null,
          workflowCount: 1,
        },
      }),
    );
    expect(out).toContain("avg-tta —");
  });

  it("truncates very long workflow ids past 18 chars", () => {
    const out = formatHistoryReply(
      payload({
        workflows: [wf({ workflowId: "abcdefghijklmnopqrstuvwxyz" })],
      }),
    );
    expect(out).toContain("abcdefghijklmnopq…");
  });
});
