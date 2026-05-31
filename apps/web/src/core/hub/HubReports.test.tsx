// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Stub the four lazy domain cards so `Suspense` resolves synchronously and
// the test does not need to wait on dynamic-import resolution under jsdom.
// Each stub renders a deterministic marker; we don't assert on them here —
// this is a render-smoke focused on the empty-insights path (F23).
vi.mock("./FitnessCard", () => ({
  default: () => <div data-testid="hub-reports-fitness-card" />,
}));
vi.mock("./ExpensesCard", () => ({
  default: () => <div data-testid="hub-reports-expenses-card" />,
}));
vi.mock("./RoutineCard", () => ({
  default: () => <div data-testid="hub-reports-routine-card" />,
}));
vi.mock("./NutritionCard", () => ({
  default: () => <div data-testid="hub-reports-nutrition-card" />,
}));

// `WeeklyDigestCard` reads its own localStorage state and renders an
// async-narrative surface — out of scope for this smoke test.
vi.mock("../insights/WeeklyDigestCard", () => ({
  WeeklyDigestCard: () => <div data-testid="hub-reports-weekly-digest" />,
}));

// PaywallModal + useFeatureGate side-effects (event listeners, plan probe)
// are not under test here — stub to keep the surface minimal.
vi.mock("../billing", () => ({
  PaywallModal: () => null,
  useFeatureGate: () => ({
    requireAccess: () => true,
    paywallOpen: false,
    closePaywall: () => undefined,
    paywallSurface: "analytics-export-pdf",
  }),
}));

// `exportToPDF` opens a new window — never invoked in this test but stub
// defensively so a future click-path test does not surprise jsdom.
vi.mock("@shared/lib/ui/export", () => ({
  exportToPDF: vi.fn(),
}));

import { HubReports } from "./HubReports";

describe("HubReports — render smoke (F23)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders the empty-insights copy when there is no source data", () => {
    // Empty localStorage → `generateInsights()` returns `[]` (see
    // `apps/web/src/core/lib/insightsEngine.ts`), which routes the
    // component into the empty-state branch in `HubReports.tsx`.
    render(<HubReports />);

    expect(
      screen.getByText("Збери більше даних для інсайтів"),
    ).toBeInTheDocument();
  });
});
