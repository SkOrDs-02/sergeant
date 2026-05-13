import { describe, expect, it } from "vitest";

import {
  formatRelativeUa,
  formatStatusSnapshot,
  htmlEscape,
  OPENCLAW_HELP_TEXT,
  parseOpenclawCommand,
  type StatusSnapshot,
} from "./status-format.js";
import { ALL_PERSONAS, DEFAULT_PERSONA } from "../agents/personas.js";

// ─────────────────────────────────────────────────────────────────────────
// parseOpenclawCommand
// ─────────────────────────────────────────────────────────────────────────

describe("parseOpenclawCommand", () => {
  it("defaults to status when input is empty", () => {
    expect(parseOpenclawCommand("")).toEqual({
      subcommand: "status",
      rawArgument: "",
    });
    expect(parseOpenclawCommand("   ")).toEqual({
      subcommand: "status",
      rawArgument: "",
    });
  });

  it("parses status / help case-insensitively", () => {
    expect(parseOpenclawCommand("status").subcommand).toBe("status");
    expect(parseOpenclawCommand("STATUS").subcommand).toBe("status");
    expect(parseOpenclawCommand("Status").subcommand).toBe("status");
    expect(parseOpenclawCommand("help").subcommand).toBe("help");
    expect(parseOpenclawCommand("HELP").subcommand).toBe("help");
  });

  it("returns unknown + Ukrainian error for unrecognized token", () => {
    const parsed = parseOpenclawCommand("debug");
    expect(parsed.subcommand).toBe("unknown");
    expect(parsed.rawArgument).toBe("debug");
    expect(parsed.error).toContain("Невідома підкоманда");
    expect(parsed.error).toContain("«debug»");
  });

  it("ignores tokens after the first one", () => {
    expect(parseOpenclawCommand("status extra args").subcommand).toBe("status");
    expect(parseOpenclawCommand("help me out").subcommand).toBe("help");
  });

  it("preserves rawArgument with original casing", () => {
    expect(parseOpenclawCommand("Status").rawArgument).toBe("Status");
    expect(parseOpenclawCommand("DEBUG-X").rawArgument).toBe("DEBUG-X");
  });

  it("handles nullish input defensively", () => {
    // @ts-expect-error — runtime null guard
    expect(parseOpenclawCommand(null).subcommand).toBe("status");
    // @ts-expect-error — runtime undefined guard
    expect(parseOpenclawCommand(undefined).subcommand).toBe("status");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// OPENCLAW_HELP_TEXT
// ─────────────────────────────────────────────────────────────────────────

describe("OPENCLAW_HELP_TEXT", () => {
  it("lists status + help subcommands", () => {
    expect(OPENCLAW_HELP_TEXT).toContain("/openclaw status");
    expect(OPENCLAW_HELP_TEXT).toContain("/openclaw help");
  });

  it("mentions all 5 snapshot data sources", () => {
    expect(OPENCLAW_HELP_TEXT).toContain("persona");
    expect(OPENCLAW_HELP_TEXT).toContain("invocations");
    expect(OPENCLAW_HELP_TEXT).toContain("n8n");
    expect(OPENCLAW_HELP_TEXT).toContain("budget");
    expect(OPENCLAW_HELP_TEXT).toContain("Sentry");
  });

  it("uses HTML-safe formatting (no raw < > outside code-tags)", () => {
    // Strip code tags and ensure no stray HTML brackets.
    const stripped = OPENCLAW_HELP_TEXT.replace(/<[^>]+>/g, "");
    expect(stripped).not.toMatch(/[<>]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// htmlEscape
// ─────────────────────────────────────────────────────────────────────────

describe("htmlEscape", () => {
  it("escapes &, <, > characters", () => {
    expect(htmlEscape("a<b>c&d")).toBe("a&lt;b&gt;c&amp;d");
  });

  it("leaves ASCII / cyrillic alphanumerics intact", () => {
    expect(htmlEscape("Привіт world 123")).toBe("Привіт world 123");
  });

  it("handles empty string", () => {
    expect(htmlEscape("")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// formatRelativeUa
// ─────────────────────────────────────────────────────────────────────────

describe("formatRelativeUa", () => {
  const now = new Date("2026-05-13T12:00:00Z");

  it("returns 'щойно' for sub-minute deltas", () => {
    const t = new Date(now.getTime() - 30_000).toISOString();
    expect(formatRelativeUa(t, now)).toBe("щойно");
  });

  it("returns 'щойно' for future timestamps (defensive)", () => {
    const t = new Date(now.getTime() + 60_000).toISOString();
    expect(formatRelativeUa(t, now)).toBe("щойно");
  });

  it("formats minutes/hours/days/months/years in Ukrainian", () => {
    const min = new Date(now.getTime() - 5 * 60_000).toISOString();
    const hour = new Date(now.getTime() - 3 * 3600_000).toISOString();
    const yesterday = new Date(now.getTime() - 25 * 3600_000).toISOString();
    const fewDays = new Date(now.getTime() - 5 * 86_400_000).toISOString();
    const months = new Date(now.getTime() - 90 * 86_400_000).toISOString();
    const yearAgo = new Date(now.getTime() - 365 * 86_400_000).toISOString();

    expect(formatRelativeUa(min, now)).toBe("5 хв тому");
    expect(formatRelativeUa(hour, now)).toBe("3 год тому");
    expect(formatRelativeUa(yesterday, now)).toBe("вчора");
    expect(formatRelativeUa(fewDays, now)).toBe("5 дн тому");
    expect(formatRelativeUa(months, now)).toBe("3 міс тому");
    expect(formatRelativeUa(yearAgo, now)).toBe("1 р тому");
  });

  it("returns '?' for null/invalid input", () => {
    expect(formatRelativeUa(null)).toBe("?");
    expect(formatRelativeUa("not a date")).toBe("?");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// formatStatusSnapshot — section coverage
// ─────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-13T12:00:00Z");

function baseSnapshot(overrides: Partial<StatusSnapshot> = {}): StatusSnapshot {
  return {
    generatedAtIso: NOW.toISOString(),
    activePersona: DEFAULT_PERSONA,
    allowedPersonas: ALL_PERSONAS,
    invocations: { data: [], error: null },
    workflows: { data: [], error: null, notConfigured: false },
    budget: { data: null, error: null },
    lastError: { data: null, error: null, notConfigured: false },
    ...overrides,
  };
}

describe("formatStatusSnapshot", () => {
  it("renders the OpenClaw status header", () => {
    const out = formatStatusSnapshot(baseSnapshot(), NOW);
    expect(out).toContain("<b>🦅 OpenClaw status</b>");
  });

  it("renders default persona + sibling personas", () => {
    const out = formatStatusSnapshot(baseSnapshot(), NOW);
    expect(out).toContain("<code>cofounder</code>");
    // Has the other-personas comma-list with at least 'ops' and 'finance'.
    expect(out).toContain("ops");
    expect(out).toContain("finance");
  });

  it("renders budget OK section when within cap", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        budget: {
          data: {
            spentUsd: 0.5432,
            budgetUsd: 5,
            remainingUsd: 4.4568,
            allowed: true,
          },
          error: null,
        },
      }),
      NOW,
    );
    expect(out).toContain("$0.5432 / $5.00");
    expect(out).toContain("$4.4568");
    expect(out).toContain("OK");
  });

  it("renders budget exceeded warning", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        budget: {
          data: {
            spentUsd: 4.95,
            budgetUsd: 5,
            remainingUsd: 0.05,
            allowed: false,
          },
          error: null,
        },
      }),
      NOW,
    );
    expect(out).toContain("⚠️ exceeded");
  });

  it("renders budget недоступно when fetch failed", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({ budget: { data: null, error: "HTTP 500" } }),
      NOW,
    );
    expect(out).toContain("Budget");
    expect(out).toContain("недоступно");
    expect(out).toContain("HTTP 500");
  });

  it("renders empty workflows as '—'", () => {
    const out = formatStatusSnapshot(baseSnapshot(), NOW);
    expect(out).toMatch(/n8n WF:[\s\S]*—/);
  });

  it("renders not-configured workflows hint", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        workflows: { data: null, error: null, notConfigured: true },
      }),
      NOW,
    );
    expect(out).toContain("n8n credentials not configured");
  });

  it("renders active+paused workflow counts + first 3 IDs", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        workflows: {
          data: [
            { id: "WF-25", name: "Morning briefing", active: true, tier: "A" },
            { id: "WF-26", name: "Strategic mode", active: true, tier: "C" },
            { id: "WF-30", name: "AI memory digest", active: true, tier: "A" },
            { id: "WF-99", name: "Legacy stuff", active: false, tier: "B" },
          ],
          error: null,
          notConfigured: false,
        },
      }),
      NOW,
    );
    expect(out).toContain("3 active");
    expect(out).toContain("1 paused");
    expect(out).toContain("<code>WF-25</code>");
    expect(out).toContain("<code>WF-26</code>");
    expect(out).toContain("<code>WF-30</code>");
  });

  it("renders +N more suffix when active > 3", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        workflows: {
          data: Array.from({ length: 7 }, (_, i) => ({
            id: `WF-${10 + i}`,
            name: `Workflow ${i}`,
            active: true,
            tier: "A",
          })),
          error: null,
          notConfigured: false,
        },
      }),
      NOW,
    );
    expect(out).toContain("7 active");
    expect(out).toContain("+4 more");
  });

  it("renders workflows error as недоступно", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        workflows: { data: null, error: "HTTP 502", notConfigured: false },
      }),
      NOW,
    );
    expect(out).toMatch(/n8n WF:[\s\S]*недоступно/);
    expect(out).toContain("HTTP 502");
  });

  it("renders invocations with status glyph + trigger + relative time", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        invocations: {
          data: [
            {
              id: 1,
              invokedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
              trigger: "morning_ritual",
              status: "success",
              userMessage: "/ritual morning",
              durationMs: 1200,
              costUsd: 0.0123,
              toneMode: null,
            },
            {
              id: 2,
              invokedAt: new Date(NOW.getTime() - 2 * 3600_000).toISOString(),
              trigger: "dm",
              status: "error",
              userMessage: "/openclaw status",
              durationMs: 300,
              costUsd: 0,
              toneMode: null,
            },
          ],
          error: null,
        },
      }),
      NOW,
    );
    expect(out).toContain("✅");
    expect(out).toContain("❌");
    expect(out).toContain("<code>morning_ritual</code>");
    expect(out).toContain("<code>dm</code>");
    expect(out).toContain("5 хв тому");
    expect(out).toContain("2 год тому");
  });

  it("truncates long user messages in invocations", () => {
    const longMsg = "/openclaw status " + "x".repeat(100);
    const out = formatStatusSnapshot(
      baseSnapshot({
        invocations: {
          data: [
            {
              id: 1,
              invokedAt: NOW.toISOString(),
              trigger: "dm",
              status: "success",
              userMessage: longMsg,
              durationMs: 0,
              costUsd: 0,
              toneMode: null,
            },
          ],
          error: null,
        },
      }),
      NOW,
    );
    expect(out).toContain("…");
    // Ensure full 100x didn't leak.
    expect(out).not.toContain("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  });

  it("caps invocations rendering at 10 even when more passed", () => {
    const data = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      invokedAt: NOW.toISOString(),
      trigger: "dm",
      status: "success",
      userMessage: `msg ${i}`,
      durationMs: 0,
      costUsd: 0,
      toneMode: null,
    }));
    const out = formatStatusSnapshot(
      baseSnapshot({ invocations: { data, error: null } }),
      NOW,
    );
    expect((out.match(/✅/g) ?? []).length).toBe(10);
  });

  it("renders invocations error as недоступно", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        invocations: { data: null, error: "HTTP 503" },
      }),
      NOW,
    );
    expect(out).toContain("недоступно");
    expect(out).toContain("HTTP 503");
  });

  it("renders 'немає errors' when sentry empty", () => {
    const out = formatStatusSnapshot(baseSnapshot(), NOW);
    expect(out).toContain("немає errors");
  });

  it("renders sentry notConfigured hint", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        lastError: { data: null, error: null, notConfigured: true },
      }),
      NOW,
    );
    expect(out).toContain("Sentry not configured");
  });

  it("renders last sentry error with level + title + count", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        lastError: {
          data: {
            title: "TypeError: cannot read property foo of undefined",
            level: "error",
            count: "12",
            permalink: "https://sentry.io/issue/1",
          },
          error: null,
          notConfigured: false,
        },
      }),
      NOW,
    );
    expect(out).toContain("<code>error</code>");
    expect(out).toContain("TypeError");
    expect(out).toContain("×12");
  });

  it("escapes HTML characters in user-controlled fields", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        invocations: {
          data: [
            {
              id: 1,
              invokedAt: NOW.toISOString(),
              trigger: "dm",
              status: "success",
              userMessage: "<script>alert('xss')</script>",
              durationMs: 0,
              costUsd: 0,
              toneMode: null,
            },
          ],
          error: null,
        },
      }),
      NOW,
    );
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("stays ≤ 30 visible lines for a typical fully-populated snapshot", () => {
    const out = formatStatusSnapshot(
      baseSnapshot({
        invocations: {
          data: Array.from({ length: 10 }, (_, i) => ({
            id: i + 1,
            invokedAt: new Date(NOW.getTime() - i * 60_000).toISOString(),
            trigger: i % 2 === 0 ? "dm" : "morning_ritual",
            status: i === 0 ? "error" : "success",
            userMessage: `msg-${i}`,
            durationMs: 100,
            costUsd: 0.01,
            toneMode: null,
          })),
          error: null,
        },
        workflows: {
          data: Array.from({ length: 5 }, (_, i) => ({
            id: `WF-${20 + i}`,
            name: `WF ${i}`,
            active: i < 4,
            tier: "A",
          })),
          error: null,
          notConfigured: false,
        },
        budget: {
          data: {
            spentUsd: 0.5,
            budgetUsd: 5,
            remainingUsd: 4.5,
            allowed: true,
          },
          error: null,
        },
        lastError: {
          data: {
            title: "OperationalError",
            level: "error",
            count: "3",
            permalink: "x",
          },
          error: null,
          notConfigured: false,
        },
      }),
      NOW,
    );
    const lines = out.split("\n");
    expect(lines.length).toBeLessThanOrEqual(30);
  });

  it("renders generatedAt as relative time", () => {
    const fiveMinAgo = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    const out = formatStatusSnapshot(
      baseSnapshot({ generatedAtIso: fiveMinAgo }),
      NOW,
    );
    expect(out).toContain("snapshot @ 5 хв тому");
  });
});
