/**
 * debug-window-runner — lifecycle coverage with mocked DebugWindowFetcher.
 *
 * Covers:
 *   - enable: happy-path → reply contains "debug" level + remaining time.
 *   - enable: HTTP error → reply contains error message, ok=false.
 *   - status: window active → reply shows remaining time.
 *   - status: window inactive (remainingMs=0) → reply says not active.
 *   - status: HTTP error → reply contains error message, ok=false.
 */

import { describe, it, expect, vi } from "vitest";
import {
  executeDebugWindowEnable,
  executeDebugWindowStatus,
  formatDebugWindowStatus,
  type DebugWindowFetcher,
} from "./debug-window-runner.js";

function makeFetcher(
  overrides: Partial<DebugWindowFetcher> = {},
): DebugWindowFetcher {
  return {
    enable: vi.fn(async () => ({
      ok: true,
      status: 200,
      data: { ok: true, remainingMs: 14 * 60_000 + 32_000 }, // 14м 32с
    })),
    disable: vi.fn(async () => ({ ok: true, status: 200 })),
    status: vi.fn(async () => ({
      ok: true,
      status: 200,
      data: { level: "debug", remainingMs: 5 * 60_000 },
    })),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// formatDebugWindowStatus (pure helper)
// ─────────────────────────────────────────────────────────────────────────

describe("formatDebugWindowStatus", () => {
  it("active window → shows level and remaining time", () => {
    const out = formatDebugWindowStatus("debug", 14 * 60_000 + 32_000);
    expect(out).toContain("debug");
    expect(out).toContain("14м");
    expect(out).toContain("32с");
  });

  it("inactive window (remainingMs=0) → says not active", () => {
    const out = formatDebugWindowStatus("info", 0);
    expect(out).toContain("info");
    expect(out).toContain("не активна");
  });

  it("negative remainingMs treated as inactive", () => {
    const out = formatDebugWindowStatus("info", -1_000);
    expect(out).toContain("не активна");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// executeDebugWindowEnable
// ─────────────────────────────────────────────────────────────────────────

describe("executeDebugWindowEnable — happy path", () => {
  it("calls enable with correct durationMs and requestedBy; reply contains debug level", async () => {
    const fetcher = makeFetcher();
    const result = await executeDebugWindowEnable({
      founderUserId: "user_abc",
      founderTgUserId: 12345,
      fetcher,
    });

    expect(result.ok).toBe(true);
    expect(result.reply).toContain("debug");
    expect(fetcher.enable).toHaveBeenCalledTimes(1);
    const call = (fetcher.enable as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      durationMs: number;
      requestedBy: string;
    };
    // Default 15 minutes
    expect(call.durationMs).toBe(15 * 60_000);
    expect(call.requestedBy).toBe("openclaw:12345");
  });

  it("custom durationMs is forwarded to fetcher", async () => {
    const fetcher = makeFetcher();
    await executeDebugWindowEnable({
      founderUserId: "user_abc",
      founderTgUserId: 1,
      durationMs: 5 * 60_000,
      fetcher,
    });
    const call = (fetcher.enable as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      durationMs: number;
    };
    expect(call.durationMs).toBe(5 * 60_000);
  });
});

describe("executeDebugWindowEnable — HTTP error path", () => {
  it("server returns 500 → ok=false, reply contains HTTP status", async () => {
    const fetcher = makeFetcher({
      enable: vi.fn(async () => ({ ok: false, status: 500, data: null })),
    });
    const result = await executeDebugWindowEnable({
      founderUserId: "user_abc",
      founderTgUserId: 1,
      fetcher,
    });
    expect(result.ok).toBe(false);
    expect(result.reply).toContain("500");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// executeDebugWindowStatus
// ─────────────────────────────────────────────────────────────────────────

describe("executeDebugWindowStatus — happy path", () => {
  it("active window → reply shows level and remaining time", async () => {
    const fetcher = makeFetcher({
      status: vi.fn(async () => ({
        ok: true,
        status: 200,
        data: { level: "debug", remainingMs: 5 * 60_000 },
      })),
    });
    const result = await executeDebugWindowStatus({ fetcher });
    expect(result.ok).toBe(true);
    expect(result.reply).toContain("debug");
    expect(result.reply).toContain("5м");
  });

  it("inactive (remainingMs=0) → reply says not active", async () => {
    const fetcher = makeFetcher({
      status: vi.fn(async () => ({
        ok: true,
        status: 200,
        data: { level: "info", remainingMs: 0 },
      })),
    });
    const result = await executeDebugWindowStatus({ fetcher });
    expect(result.ok).toBe(true);
    expect(result.reply).toContain("info");
    expect(result.reply).toContain("не активна");
  });
});

describe("executeDebugWindowStatus — HTTP error path", () => {
  it("server returns 503 → ok=false, reply contains HTTP status", async () => {
    const fetcher = makeFetcher({
      status: vi.fn(async () => ({ ok: false, status: 503, data: null })),
    });
    const result = await executeDebugWindowStatus({ fetcher });
    expect(result.ok).toBe(false);
    expect(result.reply).toContain("503");
  });
});
