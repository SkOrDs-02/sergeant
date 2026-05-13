/**
 * Pure formatter coverage для `/ai_cost` reply.
 *
 * Перевіряємо markdown patterns у:
 *   - повному «happy path» payload-і (today/week/month, budget, top-3, voyage);
 *   - порожніх payload-ах (нульові periods, missing budget, no endpoints);
 *   - граничних значеннях (USD <$0.01 → 4 decimals; >100% pct → round-up).
 */
import { describe, it, expect } from "vitest";
import {
  formatAiCostMarkdown,
  sparkline,
  type AiCostSummaryResponse,
} from "./aiCostFormat.js";

function makeSummary(
  overrides: Partial<AiCostSummaryResponse> = {},
): AiCostSummaryResponse {
  return {
    generatedAt: "2026-05-13T06:00:00.000Z",
    todayKyiv: "2026-05-13",
    today: {
      startDay: "2026-05-13",
      endDay: "2026-05-13",
      models: [
        {
          model: "claude-sonnet-4-5",
          requestCount: 12,
          inputTokens: 100_000,
          outputTokens: 30_000,
          totalTokens: 130_000,
          estCostUsd: 0.75,
        },
      ],
      totalCostUsd: 0.75,
      totalTokens: 130_000,
    },
    week: {
      startDay: "2026-05-11",
      endDay: "2026-05-13",
      models: [
        {
          model: "claude-sonnet-4-5",
          requestCount: 30,
          inputTokens: 250_000,
          outputTokens: 70_000,
          totalTokens: 320_000,
          estCostUsd: 1.92,
        },
      ],
      totalCostUsd: 1.92,
      totalTokens: 320_000,
    },
    month: {
      startDay: "2026-05-01",
      endDay: "2026-05-31",
      models: [
        {
          model: "claude-sonnet-4-5",
          requestCount: 110,
          inputTokens: 900_000,
          outputTokens: 250_000,
          totalTokens: 1_150_000,
          estCostUsd: 6.5,
        },
        {
          model: "claude-haiku-3-5",
          requestCount: 500,
          inputTokens: 800_000,
          outputTokens: 100_000,
          totalTokens: 900_000,
          estCostUsd: 0.4,
        },
      ],
      totalCostUsd: 6.9,
      totalTokens: 2_050_000,
    },
    topEndpoints: [
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        endpoint: "chat",
        estCostUsd: 4.2,
      },
      {
        provider: "anthropic",
        model: "claude-haiku-3-5",
        endpoint: "internal/weekly-digest",
        estCostUsd: 0.6,
      },
      {
        provider: "voyage",
        model: "voyage-3",
        endpoint: "embed",
        estCostUsd: 0.05,
      },
    ],
    voyage: { cumulativeSinceRestartUsd: 0.05 },
    budget: {
      anthropicMonthlyBudgetUsd: 50,
      voyageMonthlyBudgetUsd: 10,
    },
    projection: {
      avgDailySpendThisMonthUsd: 6.9 / 13,
      eomProjectionUsd: (6.9 / 13) * 31,
      daysElapsedInMonth: 13,
      daysInMonth: 31,
    },
    ...overrides,
  };
}

describe("formatAiCostMarkdown — happy path", () => {
  it("містить заголовок з today Kyiv-day", () => {
    const out = formatAiCostMarkdown(makeSummary());
    expect(out).toContain("<b>AI cost — 2026-05-13 (Europe/Kyiv)</b>");
  });

  it("показує today total + top-models + tokens/requests", () => {
    const out = formatAiCostMarkdown(makeSummary());
    expect(out).toContain("<b>Сьогодні:</b> $0.75");
    expect(out).toContain("claude-sonnet-4-5 $0.75");
    expect(out).toContain("130.0k tokens, 12 requests");
  });

  it("показує week + month діапазони з моделями", () => {
    const out = formatAiCostMarkdown(makeSummary());
    expect(out).toContain(
      "<b>Цей тиждень (2026-05-11 → 2026-05-13):</b> $1.92",
    );
    expect(out).toContain("<b>Цей місяць (2026-05-01 → 2026-05-31):</b> $6.90");
    expect(out).toContain("claude-sonnet-4-5 $6.50, claude-haiku-3-5 $0.40");
  });

  it("рендерить budget + percent (anthropic 6.9 / 50)", () => {
    const out = formatAiCostMarkdown(makeSummary());
    expect(out).toContain("бюджет Anthropic $50.00 — використано 13.8%");
  });

  it("показує avg + EOM-projection (13/31 днів)", () => {
    const out = formatAiCostMarkdown(makeSummary());
    expect(out).toContain("(13/31 днів)");
    expect(out).toContain("EOM-projection");
  });

  it("рендерить top-3 endpoints з provider:endpoint (model)", () => {
    const out = formatAiCostMarkdown(makeSummary());
    expect(out).toContain("<b>Top-3 endpoints</b> (since restart):");
    expect(out).toContain("anthropic:chat (claude-sonnet-4-5) — $4.20");
    expect(out).toContain(
      "anthropic:internal/weekly-digest (claude-haiku-3-5) — $0.60",
    );
    expect(out).toContain("voyage:embed (voyage-3) — $0.0500");
  });

  it("рендерить voyage since restart + бюджет", () => {
    const out = formatAiCostMarkdown(makeSummary());
    expect(out).toContain(
      "<b>Voyage embeddings:</b> $0.0500 since restart (бюджет $10.00/міс)",
    );
  });
});

describe("formatAiCostMarkdown — edge cases", () => {
  it("без budget показує курсивне 'не сконфігуровано'", () => {
    const out = formatAiCostMarkdown(
      makeSummary({
        budget: { anthropicMonthlyBudgetUsd: 0, voyageMonthlyBudgetUsd: 0 },
      }),
    );
    expect(out).toContain(
      "<i>ANTHROPIC_MONTHLY_BUDGET_USD не сконфігуровано</i>",
    );
  });

  it("без top-endpoints → fallback line", () => {
    const out = formatAiCostMarkdown(makeSummary({ topEndpoints: [] }));
    expect(out).toContain("<b>Top endpoints:</b> — (Prom-counter порожній)");
  });

  it("без Voyage cumulative → '0 (з моменту рестарту)'", () => {
    const out = formatAiCostMarkdown(
      makeSummary({ voyage: { cumulativeSinceRestartUsd: 0 } }),
    );
    expect(out).toContain(
      "<b>Voyage embeddings:</b> 0 (з моменту рестарту інстансу)",
    );
  });

  it("USD <$0.01 → 4 decimals; >$1 → 2 decimals", () => {
    const summary = makeSummary({
      today: {
        ...makeSummary().today,
        totalCostUsd: 0.0042,
        models: [],
      },
    });
    const out = formatAiCostMarkdown(summary);
    expect(out).toContain("<b>Сьогодні:</b> $0.0042");
  });

  it("budget exceeded (>100%) — округлення до integer", () => {
    const summary = makeSummary({
      month: {
        ...makeSummary().month,
        totalCostUsd: 75,
      },
      budget: {
        anthropicMonthlyBudgetUsd: 50,
        voyageMonthlyBudgetUsd: 10,
      },
    });
    const out = formatAiCostMarkdown(summary);
    expect(out).toContain("використано 150%");
  });

  it("empty today → пропускає під-рядок моделей", () => {
    const summary = makeSummary({
      today: {
        startDay: "2026-05-13",
        endDay: "2026-05-13",
        models: [],
        totalCostUsd: 0,
        totalTokens: 0,
      },
    });
    const out = formatAiCostMarkdown(summary);
    expect(out).toContain("<b>Сьогодні:</b> $0.00");
    expect(out).not.toContain("tokens, 0 requests");
  });
});

describe("sparkline", () => {
  it("порожній array → порожній рядок", () => {
    expect(sparkline([])).toBe("");
  });

  it("всі нулі → N×▁", () => {
    expect(sparkline([0, 0, 0, 0])).toBe("▁▁▁▁");
  });

  it("одне ненульове значення → █ у тій позиції, ▁ — у решті", () => {
    expect(sparkline([0, 0, 5, 0])).toBe("▁▁█▁");
  });

  it("monotonically ascending → останній символ █", () => {
    const out = sparkline([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out).toHaveLength(8);
    expect(out.endsWith("█")).toBe(true);
    expect(out.startsWith("▁")).toBe(true);
  });

  it("монотонно descending → перший символ █", () => {
    const out = sparkline([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(out.startsWith("█")).toBe(true);
  });

  it("negative/NaN values clamp до 0", () => {
    expect(sparkline([-1, NaN, 0, 4])).toBe("▁▁▁█");
  });

  it("два рівних max-и обидва рендеряться як █", () => {
    expect(sparkline([1, 5, 5, 1])).toBe("▁██▁");
  });
});

describe("formatAiCostMarkdown — trend block", () => {
  it("без trend property → reply не містить trend-section", () => {
    const out = formatAiCostMarkdown(makeSummary());
    expect(out).not.toContain("<b>Trend");
    expect(out).not.toContain("trend = Anthropic-only");
  });

  it("з trend (7 днів) → містить header + sparkline + per-day rows", () => {
    const points = [
      {
        day: "2026-05-07",
        totalCostUsd: 0.2,
        totalTokens: 50_000,
        requestCount: 3,
      },
      { day: "2026-05-08", totalCostUsd: 0.0, totalTokens: 0, requestCount: 0 },
      {
        day: "2026-05-09",
        totalCostUsd: 0.45,
        totalTokens: 110_000,
        requestCount: 7,
      },
      {
        day: "2026-05-10",
        totalCostUsd: 0.8,
        totalTokens: 180_000,
        requestCount: 12,
      },
      {
        day: "2026-05-11",
        totalCostUsd: 1.2,
        totalTokens: 250_000,
        requestCount: 18,
      },
      {
        day: "2026-05-12",
        totalCostUsd: 0.6,
        totalTokens: 130_000,
        requestCount: 9,
      },
      {
        day: "2026-05-13",
        totalCostUsd: 0.75,
        totalTokens: 130_000,
        requestCount: 12,
      },
    ];
    const total = points.reduce((acc, p) => acc + p.totalCostUsd, 0);
    const tokens = points.reduce((acc, p) => acc + p.totalTokens, 0);
    const out = formatAiCostMarkdown(
      makeSummary({
        trend: {
          days: 7,
          startDay: "2026-05-07",
          endDay: "2026-05-13",
          points,
          totalCostUsd: total,
          totalTokens: tokens,
        },
      }),
    );
    expect(out).toContain("<b>Trend (7d, 2026-05-07 → 2026-05-13):</b>");
    expect(out).toMatch(/<code>[▁▂▃▄▅▆▇█]{7}<\/code>/u);
    expect(out).toContain("05-09: $0.45 (110.0k tokens, 7 req)");
    expect(out).toContain("05-11: $1.20 (250.0k tokens, 18 req)");
    expect(out).toContain("trend = Anthropic-only");
  });

  it("trend з усіма нулями → sparkline = N×▁, total $0.00", () => {
    const points = Array.from({ length: 7 }, (_, i) => ({
      day: `2026-05-${String(7 + i).padStart(2, "0")}`,
      totalCostUsd: 0,
      totalTokens: 0,
      requestCount: 0,
    }));
    const out = formatAiCostMarkdown(
      makeSummary({
        trend: {
          days: 7,
          startDay: "2026-05-07",
          endDay: "2026-05-13",
          points,
          totalCostUsd: 0,
          totalTokens: 0,
        },
      }),
    );
    expect(out).toContain("<b>Trend (7d, 2026-05-07 → 2026-05-13):</b> $0.00");
    expect(out).toContain("<code>▁▁▁▁▁▁▁</code>");
  });

  it("trend з порожнім points[] → fallback 'даних немає'", () => {
    const out = formatAiCostMarkdown(
      makeSummary({
        trend: {
          days: 7,
          startDay: "2026-05-07",
          endDay: "2026-05-13",
          points: [],
          totalCostUsd: 0,
          totalTokens: 0,
        },
      }),
    );
    expect(out).toContain("даних немає");
    expect(out).not.toContain("<code>");
  });
});
