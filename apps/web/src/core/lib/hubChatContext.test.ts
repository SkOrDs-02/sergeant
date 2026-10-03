import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

vi.mock("@shared/lib/ui/perf", () => ({
  perfMark: vi.fn(() => ({ name: "hubchat:buildContext", start: 0 })),
  perfEnd: vi.fn(),
}));

vi.mock("./hubChatContext/readAllData", () => ({
  readAllData: vi.fn(() => ({
    transactions: [],
    accounts: [],
    clientName: "",
    cacheTime: null,
    hiddenAccounts: [],
    budgets: [],
    manualDebts: [],
    receivables: [],
    txCategories: {},
    txSplits: {},
    customCategories: [],
    monthlyPlan: {},
    subscriptions: [],
    monoDebtLinked: {},
    statTx: [],
    excludedIds: new Set(),
  })),
}));

vi.mock("./hubChatContext/finance", () => ({
  appendFinanceLines: vi.fn(),
}));

vi.mock("./hubChatContext/sections", () => ({
  appendAiSignalLines: vi.fn(),
  appendNutritionLines: vi.fn(),
  appendRoutineLines: vi.fn(),
  appendWorkoutLines: vi.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { buildContextMeasured } from "./hubChatContext";
import { perfMark, perfEnd } from "@shared/lib/ui/perf";
import { readAllData } from "./hubChatContext/readAllData";
import { appendFinanceLines } from "./hubChatContext/finance";
import {
  appendAiSignalLines,
  appendNutritionLines,
  appendRoutineLines,
  appendWorkoutLines,
} from "./hubChatContext/sections";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildContextMeasured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls readAllData once", () => {
    buildContextMeasured();
    expect(readAllData).toHaveBeenCalledTimes(1);
  });

  it("calls all section appenders", () => {
    buildContextMeasured();
    expect(appendFinanceLines).toHaveBeenCalledTimes(1);
    expect(appendWorkoutLines).toHaveBeenCalledTimes(1);
    expect(appendRoutineLines).toHaveBeenCalledTimes(1);
    expect(appendNutritionLines).toHaveBeenCalledTimes(1);
    expect(appendAiSignalLines).toHaveBeenCalledTimes(1);
  });

  it("calls perfMark before and perfEnd after building context", () => {
    buildContextMeasured();
    expect(perfMark).toHaveBeenCalledWith("hubchat:buildContext");
    expect(perfEnd).toHaveBeenCalledTimes(1);
  });

  it("returns fallback string when no data is produced by appenders", () => {
    // Appenders are no-ops (mocked) → lines array stays length ≤ 1
    const result = buildContextMeasured();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a non-empty string when appenders push lines", () => {
    vi.mocked(appendFinanceLines).mockImplementationOnce((lines: string[]) => {
      lines.push("# Фінанси");
      lines.push("Баланс: 1000 грн");
    });
    const result = buildContextMeasured();
    expect(result).toContain("Фінанси");
  });
});
