import { describe, expect, it } from "vitest";

import {
  formatWhoisSnapshot,
  formatWhoisEndpointFailure,
  parseWhoisArg,
  WHOIS_HELP_TEXT,
  type WhoisSnapshot,
} from "./whois-format.js";

const NOW = new Date("2026-05-13T19:30:00.000Z");

function baseSnapshot(overrides: Partial<WhoisSnapshot> = {}): WhoisSnapshot {
  return {
    tgUserId: 123456,
    resolvedFrom: "numeric",
    username: null,
    firstName: null,
    lastName: null,
    inAllowlist: false,
    isFounder: false,
    invocations7d: 0,
    lastSeenIso: null,
    topTools: [],
    muteState: null,
    telegramError: null,
    ...overrides,
  };
}

describe("parseWhoisArg", () => {
  it("returns kind=missing on empty input", () => {
    const p = parseWhoisArg("");
    expect(p.kind).toBe("missing");
    expect(p.error).toBeDefined();
  });

  it("returns kind=missing on whitespace-only input", () => {
    const p = parseWhoisArg("   ");
    expect(p.kind).toBe("missing");
  });

  it("returns kind=numeric for digit-only token", () => {
    const p = parseWhoisArg("123456789");
    expect(p.kind).toBe("numeric");
    expect(p.value).toBe("123456789");
  });

  it("returns kind=username for @username", () => {
    const p = parseWhoisArg("@dmytrostakhov");
    expect(p.kind).toBe("username");
    expect(p.value).toBe("dmytrostakhov");
  });

  it("returns kind=username for bare username (no @)", () => {
    const p = parseWhoisArg("dmytrostakhov");
    expect(p.kind).toBe("username");
    expect(p.value).toBe("dmytrostakhov");
  });

  it("rejects too-short username (<3)", () => {
    const p = parseWhoisArg("@ab");
    expect(p.kind).toBe("invalid");
  });

  it("rejects username with invalid chars", () => {
    const p = parseWhoisArg("@hello-world");
    expect(p.kind).toBe("invalid");
  });

  it("rejects numeric overflow (>15 digits)", () => {
    const p = parseWhoisArg("1234567890123456789");
    expect(p.kind).toBe("invalid");
  });

  it("ignores trailing words (takes only first token)", () => {
    const p = parseWhoisArg("123 extra garbage");
    expect(p.kind).toBe("numeric");
    expect(p.value).toBe("123");
  });
});

describe("formatWhoisSnapshot — happy paths", () => {
  it("renders all 5 sections for a non-founder numeric user", () => {
    const reply = formatWhoisSnapshot(
      baseSnapshot({
        tgUserId: 123456,
        firstName: "Foo",
        lastName: "Bar",
        username: "foobar",
        invocations7d: 7,
        lastSeenIso: "2026-05-13T17:30:00.000Z",
        topTools: [
          { tool: "recall_memory", count: 4 },
          { tool: "list_memories", count: 2 },
        ],
      }),
      NOW,
    );
    expect(reply).toContain("🦅 OpenClaw whois");
    expect(reply).toContain("<code>123456</code>");
    expect(reply).toContain("Foo Bar");
    expect(reply).toContain("@foobar");
    expect(reply).toContain("Allowlist:</b> no");
    expect(reply).toContain("Founder:</b> no");
    expect(reply).toContain("7 invocations (7d)");
    expect(reply).toContain("2 год тому");
    expect(reply).toContain("Mute:</b> n/a");
    expect(reply).toContain("<code>recall_memory</code> × 4");
    expect(reply).toContain("<code>list_memories</code> × 2");
  });

  it("renders Mute:off for founder without mute row", () => {
    const reply = formatWhoisSnapshot(
      baseSnapshot({ isFounder: true, inAllowlist: true }),
      NOW,
    );
    expect(reply).toContain("Allowlist:</b> yes");
    expect(reply).toContain("Founder:</b> yes");
    expect(reply).toContain("Mute:</b> off");
  });

  it("renders Mute:active when muted_until is in the future", () => {
    const reply = formatWhoisSnapshot(
      baseSnapshot({
        isFounder: true,
        inAllowlist: true,
        muteState: {
          mutedUntilIso: "2026-05-13T22:00:00.000Z",
          setAtIso: "2026-05-13T19:00:00.000Z",
          reason: "sleep",
        },
      }),
      NOW,
    );
    expect(reply).toMatch(/Mute:<\/b> active until/);
    expect(reply).toContain("«sleep»");
  });

  it("renders Mute:expired when muted_until is in the past", () => {
    const reply = formatWhoisSnapshot(
      baseSnapshot({
        isFounder: true,
        inAllowlist: true,
        muteState: {
          mutedUntilIso: "2026-05-13T18:00:00.000Z",
          setAtIso: "2026-05-13T17:00:00.000Z",
          reason: null,
        },
      }),
      NOW,
    );
    expect(reply).toContain("Mute:</b> expired");
  });

  it("renders '—' for empty topTools", () => {
    const reply = formatWhoisSnapshot(baseSnapshot(), NOW);
    expect(reply).toContain("Top tools (7d):</b> —");
  });

  it("renders 'last: ніколи' when lastSeenIso is null", () => {
    const reply = formatWhoisSnapshot(baseSnapshot(), NOW);
    expect(reply).toContain("last: ніколи");
  });
});

describe("formatWhoisSnapshot — fail-soft / telegramError", () => {
  it("appends ⚠ line for forbidden", () => {
    const reply = formatWhoisSnapshot(
      baseSnapshot({
        telegramError: { code: "forbidden", message: "bot blocked" },
      }),
      NOW,
    );
    expect(reply).toContain("⚠ Telegram: forbidden (bot blocked)");
  });

  it("appends ⚠ line with retry-after for rate_limit", () => {
    const reply = formatWhoisSnapshot(
      baseSnapshot({
        telegramError: {
          code: "rate_limit",
          message: "flood",
          retryAfter: 30,
        },
      }),
      NOW,
    );
    expect(reply).toContain("⚠ Telegram: rate-limit");
    expect(reply).toContain("retry after 30s");
  });

  it("appends ⚠ for not_found", () => {
    const reply = formatWhoisSnapshot(
      baseSnapshot({
        telegramError: { code: "not_found", message: "chat not found" },
      }),
      NOW,
    );
    expect(reply).toContain("⚠ Telegram: not found");
  });

  it("escapes HTML in names + reason", () => {
    const reply = formatWhoisSnapshot(
      baseSnapshot({
        firstName: "<script>",
        username: "evil",
        isFounder: true,
        muteState: {
          mutedUntilIso: "2026-05-13T22:00:00.000Z",
          setAtIso: "2026-05-13T19:00:00.000Z",
          reason: "<b>hack",
        },
      }),
      NOW,
    );
    expect(reply).not.toContain("<script>");
    expect(reply).toContain("&lt;script&gt;");
    expect(reply).toContain("&lt;b&gt;hack");
  });
});

describe("formatWhoisEndpointFailure", () => {
  it("renders an HTTP-error stub with status + message", () => {
    const reply = formatWhoisEndpointFailure(503, "service unavailable");
    expect(reply).toContain("🦅 OpenClaw whois");
    expect(reply).toContain("HTTP 503");
    expect(reply).toContain("service unavailable");
  });
});

describe("WHOIS_HELP_TEXT", () => {
  it("documents both arg kinds", () => {
    expect(WHOIS_HELP_TEXT).toContain("123456789");
    expect(WHOIS_HELP_TEXT).toContain("@username");
  });
});
