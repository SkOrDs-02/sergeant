/**
 * `/perf` formatter — pure rendering coverage.
 *
 * Тестуємо:
 *   - Happy-path layout (всі секції наповнені).
 *   - Empty/partial — секції рендерять `—` / `none`.
 *   - HTML-escape для route path-ів (на випадок route-regex з `<`).
 *   - Uptime rendering (s/m/h/d).
 *   - Latency rendering (<1ms / ms / s).
 *   - Reply ≤30 рядків навіть з 5 routes + 5 errors.
 */
import { describe, it, expect } from "vitest";
import { formatPerfSnapshot, type PerfSnapshotResponse } from "./perfFormat.js";

function makeSnapshot(
  overrides: Partial<PerfSnapshotResponse> = {},
): PerfSnapshotResponse {
  return {
    generatedAt: "2026-05-13T19:00:00.000Z",
    uptimeSeconds: 3600,
    topHttpRoutes: [],
    aiLatency: [],
    dbPool: null,
    aiMemoryQueue: [],
    topErrors: [],
    ...overrides,
  };
}

describe("formatPerfSnapshot — happy path", () => {
  it("рендерить всі 6 секцій коли всі дані наповнені", () => {
    const snap = makeSnapshot({
      uptimeSeconds: 7200, // 2h
      topHttpRoutes: [
        {
          method: "POST",
          path: "/api/chat",
          count: 1234,
          p50Ms: 42,
          p95Ms: 380,
          p99Ms: 920,
        },
        {
          method: "GET",
          path: "/api/health",
          count: 50000,
          p50Ms: 2,
          p95Ms: 6,
          p99Ms: 12,
        },
      ],
      aiLatency: [
        { provider: "anthropic", count: 312, p95Ms: 1800 },
        { provider: "voyage", count: 540, p95Ms: 240 },
      ],
      dbPool: { total: 20, idle: 13, waiting: 0, active: 7 },
      aiMemoryQueue: [
        { status: "waiting", depth: 3 },
        { status: "active", depth: 2 },
      ],
      topErrors: [
        {
          method: "GET",
          path: "/api/nutrition",
          statusClass: "5xx",
          module: "finyk",
          count: 7,
        },
      ],
    });

    const reply = formatPerfSnapshot(snap);
    expect(reply).toContain("Performance snapshot");
    expect(reply).toContain("uptime 2h");
    expect(reply).toContain("/api/chat");
    expect(reply).toContain("p50 42ms");
    expect(reply).toContain("p95 380ms");
    expect(reply).toContain("p99 920ms");
    expect(reply).toContain("anthropic");
    expect(reply).toContain("p95 1.8s");
    expect(reply).toContain("DB pool:</b> 7/20");
    expect(reply).toContain("waiting 3, active 2");
    expect(reply).toContain("/api/nutrition");
    expect(reply).toContain("[5xx]");
    // ≤30 рядків (spec).
    expect(reply.split("\n").length).toBeLessThanOrEqual(30);
  });
});

describe("formatPerfSnapshot — empty/missing sections", () => {
  it("рендерить `—` / `none` placeholder-и", () => {
    const reply = formatPerfSnapshot(makeSnapshot({ uptimeSeconds: 45 }));
    expect(reply).toContain("uptime 45s");
    expect(reply).toContain("HTTP latency");
    expect(reply).toContain("AI latency");
    expect(reply).toContain("DB pool:</b> <i>—</i>");
    expect(reply).toContain("AI memory queue:</b> <i>—</i>");
    expect(reply).toContain("Top error routes");
    expect(reply).toContain("<i>none</i>");
  });

  it("queue лише з нульовими depth-ами рендерить `idle`", () => {
    const snap = makeSnapshot({
      aiMemoryQueue: [
        { status: "delayed", depth: 0 },
        { status: "failed", depth: 0 },
      ],
    });
    const reply = formatPerfSnapshot(snap);
    expect(reply).toContain("AI memory queue:</b> idle");
  });

  it("queue з waiting=0 але active=0 — все ще показує waiting (zero дозволений)", () => {
    const snap = makeSnapshot({
      aiMemoryQueue: [{ status: "waiting", depth: 0 }],
    });
    const reply = formatPerfSnapshot(snap);
    expect(reply).toContain("waiting 0");
  });
});

describe("formatPerfSnapshot — HTML escape + edge cases", () => {
  it("HTML-escape-ить route path з `<` (paranoid)", () => {
    const snap = makeSnapshot({
      topHttpRoutes: [
        {
          method: "GET",
          path: "/api/<test>",
          count: 1,
          p50Ms: 10,
          p95Ms: 20,
          p99Ms: 30,
        },
      ],
    });
    const reply = formatPerfSnapshot(snap);
    expect(reply).not.toContain("/api/<test>");
    expect(reply).toContain("/api/&lt;test&gt;");
  });

  it("рендерить <1ms для sub-millisecond p50", () => {
    const snap = makeSnapshot({
      topHttpRoutes: [
        {
          method: "GET",
          path: "/api/x",
          count: 1,
          p50Ms: 0.5,
          p95Ms: 50,
          p99Ms: 100,
        },
      ],
    });
    expect(formatPerfSnapshot(snap)).toContain("p50 <1ms");
  });

  it("рендерить `—` для негативних / NaN latency (захист від bucket-bug-а)", () => {
    const snap = makeSnapshot({
      topHttpRoutes: [
        {
          method: "GET",
          path: "/api/x",
          count: 1,
          p50Ms: Number.NEGATIVE_INFINITY,
          p95Ms: 50,
          p99Ms: 100,
        },
      ],
    });
    expect(formatPerfSnapshot(snap)).toContain("p50 —");
  });

  it("uptime: <60s → секунди, <60m → хвилини, <24h → години, ≥1d → дні", () => {
    const cases: Array<[number, string]> = [
      [5, "5s"],
      [120, "2m"],
      [3600 * 5, "5h"],
      [86400 * 2 + 3600 * 3, "2d3h"],
    ];
    for (const [seconds, expected] of cases) {
      const reply = formatPerfSnapshot(
        makeSnapshot({ uptimeSeconds: seconds }),
      );
      expect(reply).toContain(`uptime ${expected}`);
    }
  });

  it("count formatting: <1000 / 1k–1M / ≥1M", () => {
    const snap = makeSnapshot({
      topHttpRoutes: [
        {
          method: "GET",
          path: "/a",
          count: 999,
          p50Ms: 1,
          p95Ms: 1,
          p99Ms: 1,
        },
        {
          method: "GET",
          path: "/b",
          count: 12_345,
          p50Ms: 1,
          p95Ms: 1,
          p99Ms: 1,
        },
        {
          method: "GET",
          path: "/c",
          count: 2_500_000,
          p50Ms: 1,
          p95Ms: 1,
          p99Ms: 1,
        },
      ],
    });
    const reply = formatPerfSnapshot(snap);
    expect(reply).toContain("999 req");
    expect(reply).toContain("12.3k req");
    expect(reply).toContain("2.50M req");
  });
});
