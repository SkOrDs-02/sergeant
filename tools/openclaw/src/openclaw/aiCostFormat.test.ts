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
