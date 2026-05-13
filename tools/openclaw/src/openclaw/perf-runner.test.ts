/**
 * `/perf` orchestrator — lifecycle coverage with mocked Fetcher.
 *
 * Тестуємо:
 *   - Happy-path: open → fetch → format → finalize(success).
 *   - HTTP-error на perf-snapshot: open → error reply →
 *     finalize(error).
 *   - openInvocation повертає `null` invocationId (DB-issue): все
 *     одно повертаємо reply, але finalize не дзвонимо.
 *   - Sentry breadcrumb emit на start / success / error.
 */
import { describe, it, expect, vi } from "vitest";
import { executePerfCommand, type PerfFetcher } from "./perf-runner.js";
import type { PerfSnapshotResponse } from "./perfFormat.js";

function makeSnapshot(): PerfSnapshotResponse {
  return {
    generatedAt: "2026-05-13T19:00:00.000Z",
    uptimeSeconds: 600,
    topHttpRoutes: [
      {
        method: "GET",
        path: "/api/x",
        count: 100,
        p50Ms: 40,
        p95Ms: 200,
        p99Ms: 500,
      },
    ],
    aiLatency: [{ provider: "anthropic", count: 12, p95Ms: 800 }],
    dbPool: { total: 10, idle: 6, waiting: 0, active: 4 },
    aiMemoryQueue: [{ status: "waiting", depth: 0 }],
    topErrors: [],
  };
}

interface FetcherMocks {
  getPerfSnapshot: ReturnType<typeof vi.fn>;
  openInvocation: ReturnType<typeof vi.fn>;
  finalizeInvocation: ReturnType<typeof vi.fn>;
}

function makeFetcher(overrides: Partial<PerfFetcher> = {}): {
  fetcher: PerfFetcher;
  mocks: FetcherMocks;
} {
  const mocks: FetcherMocks = {
    getPerfSnapshot: vi.fn(async () => ({
      ok: true,
      status: 200,
      data: makeSnapshot(),
    })),
    openInvocation: vi.fn(async () => ({
      ok: true,
      status: 200,
      invocationId: 42,
    })),
    finalizeInvocation: vi.fn(async () => ({ ok: true, status: 200 })),
  };
  return {
    fetcher: { ...mocks, ...overrides } as unknown as PerfFetcher,
    mocks,
  };
}

describe("executePerfCommand — happy path", () => {
  it("open → fetch → format → finalize(success); reply має HTML-формат", async () => {
    const { fetcher, mocks } = makeFetcher();
    const breadcrumb = vi.fn();

    const result = await executePerfCommand({
      founderUserId: "user_abc",
      founderTgUserId: 12345,
      telegramChatId: 67890,
      fetcher,
      addBreadcrumb: breadcrumb,
    });

    expect(result.ok).toBe(true);
    expect(result.invocationId).toBe(42);
    expect(result.reply).toContain("Performance snapshot");
    expect(result.reply).toContain("/api/x");

    expect(mocks.openInvocation).toHaveBeenCalledTimes(1);
    expect(mocks.openInvocation).toHaveBeenCalledWith({
      founderUserId: "user_abc",
      founderTgUserId: 12345,
      trigger: "dm",
      userMessage: "/perf",
      metadata: {
        telegramChatId: 67890,
        slashCommand: "/perf",
      },
    });

    expect(mocks.getPerfSnapshot).toHaveBeenCalledTimes(1);

    expect(mocks.finalizeInvocation).toHaveBeenCalledTimes(1);
    const finalizeCall = mocks.finalizeInvocation.mock.calls[0]?.[0] as {
      invocationId: number;
      status: string;
      errorMessage: string | null;
    };
    expect(finalizeCall.invocationId).toBe(42);
    expect(finalizeCall.status).toBe("success");
    expect(finalizeCall.errorMessage).toBe(null);

    // Breadcrumbs: start + success.
    expect(breadcrumb).toHaveBeenCalledTimes(2);
    expect(breadcrumb.mock.calls[0]?.[0]).toMatchObject({
      category: "openclaw.perf",
      message: "openclaw.perf.start",
    });
    expect(breadcrumb.mock.calls[1]?.[0]).toMatchObject({
      message: "openclaw.perf.success",
    });
  });

  it("без telegramChatId — metadata прокидує null", async () => {
    const { fetcher, mocks } = makeFetcher();
    await executePerfCommand({
      founderUserId: "user_abc",
      founderTgUserId: 1,
      fetcher,
    });
    const openCall = mocks.openInvocation.mock.calls[0]?.[0] as {
      metadata: Record<string, unknown>;
    };
    expect(openCall.metadata["telegramChatId"]).toBe(null);
  });
});

describe("executePerfCommand — HTTP error path", () => {
  it("snapshot fetch повертає 500 → reply error + finalize(error)", async () => {
    const { fetcher, mocks } = makeFetcher({
      getPerfSnapshot: vi.fn(async () => ({
        ok: false,
        status: 500,
        data: null,
      })),
    });
    const breadcrumb = vi.fn();

    const result = await executePerfCommand({
      founderUserId: "user_abc",
      founderTgUserId: 1,
      fetcher,
      addBreadcrumb: breadcrumb,
    });

    expect(result.ok).toBe(false);
    expect(result.reply).toContain("HTTP 500");
    expect(mocks.finalizeInvocation).toHaveBeenCalledTimes(1);
    const finalizeCall = mocks.finalizeInvocation.mock.calls[0]?.[0] as {
      status: string;
      errorMessage: string | null;
    };
    expect(finalizeCall.status).toBe("error");
    expect(finalizeCall.errorMessage).toContain("HTTP 500");

    expect(breadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "openclaw.perf.error",
        level: "error",
        data: { status: 500 },
      }),
    );
  });

  it("openInvocation повертає null invocationId → finalize не викликаємо", async () => {
    const { fetcher, mocks } = makeFetcher({
      openInvocation: vi.fn(async () => ({
        ok: false,
        status: 500,
        invocationId: null,
      })),
    });

    const result = await executePerfCommand({
      founderUserId: "user_abc",
      founderTgUserId: 1,
      fetcher,
    });

    expect(result.invocationId).toBe(null);
    expect(result.ok).toBe(true);
    expect(result.reply).toContain("Performance snapshot");
    expect(mocks.finalizeInvocation).not.toHaveBeenCalled();
  });

  it("addBreadcrumb optional — no-op коли не переданий", async () => {
    const { fetcher } = makeFetcher();
    const result = await executePerfCommand({
      founderUserId: "user_abc",
      founderTgUserId: 1,
      fetcher,
    });
    expect(result.ok).toBe(true);
  });
});
