/**
 * O3 (Phase 2.B) — pure-template `buildMonthlyOkrReview(data)` tests.
 */

import { describe, expect, it } from "vitest";
import { buildMonthlyOkrReview } from "./template.js";
import type { MonthlyOkrData } from "./types.js";

function makeData(overrides: Partial<MonthlyOkrData> = {}): MonthlyOkrData {
  return {
    generatedAt: "2026-06-01T09:00:00.000Z",
    reportingMonth: "2026-05",
    progress: {
      okrs: [
        {
          id: "foundation-q2-2026",
          objective: "Foundation: ship core CRUD + 50 paying users",
          quarter: "Q2 2026",
          progressPct: 33,
          krs: [
            {
              label: "Paying users",
              target: 50,
              current: 12,
              unit: "users",
              progressPct: 24,
            },
            {
              label: "MRR",
              target: 25000,
              current: 10000,
              unit: "₴/mo",
              progressPct: 40,
            },
          ],
        },
      ],
      note: "Interim hardcoded OKR (PR-34 strategic_goals ще не merged).",
    },
    wins: {
      mergedCount: 47,
      topMerged: [
        {
          number: 2659,
          title: "feat(agents): morning briefing cron",
          url: "https://github.com/Skords-01/Sergeant/pull/2659",
          author: "Skords-01",
        },
      ],
    },
    risks: {
      sentryUnresolvedCount: 3,
      staleCommitmentsCount: 5,
      topBlockers: [
        {
          kind: "sentry",
          title: "TypeError: foo",
          url: "https://sentry.io/issues/1/",
        },
        {
          kind: "stale_pr",
          title: "#2500 old WIP",
          url: "https://github.com/Skords-01/Sergeant/pull/2500",
        },
      ],
    },
    narrative: {
      source: "llm",
      text: "Прогрес на 33% — час сфокусуватись на user-activation.",
      provider: "anthropic",
    },
    ...overrides,
  };
}

describe("buildMonthlyOkrReview — happy path", () => {
  const md = buildMonthlyOkrReview(makeData());

  it("includes header with reporting month", () => {
    expect(md).toContain("🎯 *Місячний OKR-ритуал — 2026-05*");
  });

  it("renders 4 sections in canonical order", () => {
    const narrIdx = md.indexOf("🔄 Recalibration");
    const progIdx = md.indexOf("📈 OKR progress");
    const winsIdx = md.indexOf("🏆 Wins");
    const risksIdx = md.indexOf("⚠️ Risks & blockers");
    expect(narrIdx).toBeGreaterThan(-1);
    expect(progIdx).toBeGreaterThan(narrIdx);
    expect(winsIdx).toBeGreaterThan(progIdx);
    expect(risksIdx).toBeGreaterThan(winsIdx);
  });

  it("renders LLM narrative", () => {
    expect(md).toContain("Прогрес на 33% — час сфокусуватись");
  });

  it("renders OKR per-quarter with progress", () => {
    expect(md).toContain(
      "*Q2 2026 · Foundation: ship core CRUD + 50 paying users* — 33%",
    );
    expect(md).toContain("Paying users: 12 users / 50 users (24%)");
    expect(md).toMatch(/MRR: 10\u00A0?000 ₴\/mo \/ 25\u00A0?000 ₴\/mo \(40%\)/);
  });

  it("renders interim OKR note", () => {
    expect(md).toContain("Interim hardcoded OKR");
  });

  it("renders wins + top merged PR with link", () => {
    expect(md).toContain("Merged за місяць: 47");
    expect(md).toContain(
      "[#2659](https://github.com/Skords-01/Sergeant/pull/2659) feat(agents): morning briefing cron · @Skords-01",
    );
  });

  it("renders risks with sentry + stale + blocker emoji", () => {
    expect(md).toContain("Sentry unresolved error issues: 3");
    expect(md).toContain("Stale-PR (>30 дн): 5");
    expect(md).toContain("🐛 [TypeError: foo]");
    expect(md).toContain("🧊 [#2500 old WIP]");
  });
});

describe("buildMonthlyOkrReview — notConfigured branches", () => {
  it("renders github-not-configured hint for wins", () => {
    const md = buildMonthlyOkrReview(
      makeData({ wins: { notConfigured: true } }),
    );
    expect(md).toMatch(/Wins[\s\S]*GitHub-доступу немає/);
  });

  it("renders not-configured hint for risks", () => {
    const md = buildMonthlyOkrReview(
      makeData({ risks: { notConfigured: true } }),
    );
    expect(md).toContain("Sentry або GitHub-доступу немає");
  });

  it("renders template-fallback note", () => {
    const md = buildMonthlyOkrReview(
      makeData({
        narrative: {
          source: "template",
          text: "Чистий місяць.",
        },
      }),
    );
    expect(md).toContain("Чистий місяць.");
    expect(md).toContain("шаблонний summary");
  });

  it("handles empty OKR list with placeholder", () => {
    const md = buildMonthlyOkrReview(
      makeData({
        progress: { okrs: [] },
      }),
    );
    expect(md).toContain("OKR-список порожній");
  });
});
