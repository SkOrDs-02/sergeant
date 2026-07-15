// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// `kvStoreBoot` pulls in `@sergeant/db-schema/sqlite` (WASM — only available
// when the package is built). Stub it at the boundary so the full import chain
// resolves without needing the built WASM artefact in the test environment.
vi.mock("../db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

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

// `generatePDFReport` builds the report HTML that HubReports feeds into
// the in-app `PdfPreviewModal`. Stub it to a deterministic string so the
// click-path test can assert the section payload without exercising the
// full HTML template.
vi.mock("@shared/lib/ui/export", () => ({
  generatePDFReport: vi.fn(() => "<!DOCTYPE html><html></html>"),
}));

// Stub `generateInsights` so F7 assertions can control the returned copy
// without requiring actual localStorage data to cross insight thresholds.
// The mock is set up per-test via `vi.mocked(generateInsights)` when needed.
vi.mock("../lib/insightsEngine", () => ({
  generateInsights: vi.fn(() => []),
}));

import { act } from "@testing-library/react";
import { generateInsights } from "../lib/insightsEngine";
import { generatePDFReport } from "@shared/lib/ui/export";

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

  it("renders all four domain card stubs via Suspense", () => {
    render(<HubReports />);

    expect(screen.getByTestId("hub-reports-fitness-card")).toBeInTheDocument();
    expect(screen.getByTestId("hub-reports-expenses-card")).toBeInTheDocument();
    expect(screen.getByTestId("hub-reports-routine-card")).toBeInTheDocument();
    expect(
      screen.getByTestId("hub-reports-nutrition-card"),
    ).toBeInTheDocument();
  });

  it("renders the WeeklyDigestCard stub in week mode", () => {
    render(<HubReports />);

    // WeeklyDigestCard is shown in 'week' mode (initial period)
    expect(screen.getByTestId("hub-reports-weekly-digest")).toBeInTheDocument();
  });

  it("hides WeeklyDigestCard when switching to month period", async () => {
    render(<HubReports />);

    // Switch to 'Місяць' — the period selector is a `Segmented` control
    // (role="tablist" with role="tab" segments), not plain buttons.
    await act(async () => {
      screen.getByRole("tab", { name: "Місяць" }).click();
    });

    expect(
      screen.queryByTestId("hub-reports-weekly-digest"),
    ).not.toBeInTheDocument();
  });

  it("period navigation buttons are present and navigable", async () => {
    render(<HubReports />);

    // 'Попередній' button should be enabled always
    const prevBtn = screen.getByRole("button", { name: "Попередній" });
    expect(prevBtn).toBeInTheDocument();

    // 'Наступний' button is disabled for current period (offset=0)
    const nextBtn = screen.getByRole("button", { name: "Наступний" });
    expect(nextBtn).toBeDisabled();

    // After going back one period, next button should be enabled
    await act(async () => {
      prevBtn.click();
    });

    expect(nextBtn).not.toBeDisabled();
  });

  it("export PDF button is present", () => {
    render(<HubReports />);

    expect(
      screen.getByRole("button", { name: /Експортувати PDF/i }),
    ).toBeInTheDocument();
  });

  it("export PDF sends period and report-state sections to the preview generator", () => {
    render(<HubReports />);

    fireEvent.click(screen.getByRole("button", { name: /Експортувати PDF/i }));

    expect(generatePDFReport).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Sergeant — звіт",
        sections: expect.arrayContaining([
          expect.objectContaining({ title: "Період" }),
          expect.objectContaining({ title: "Стан звіту" }),
        ]),
      }),
    );

    // The in-app preview overlay opens (replaces the old window.open tab).
    expect(
      screen.getByRole("dialog", { name: /Перегляд PDF-звіту/i }),
    ).toBeInTheDocument();
  });

  // ── F4: touch-target floor + aria-labels ──────────────────────────────────
  // The Button primitive auto-applies pointer-coarse:min-h-[44px] / min-w-[44px]
  // for iconOnly / sm / xs variants (see apps/web/src/shared/components/ui/Button.tsx).
  // Here we verify the semantic layer: both nav buttons have descriptive
  // aria-labels and are rendered as accessible `<button>` elements so AT can
  // announce them. Visual size is covered by design-system (Button docs).
  it("F4 — prev/next period buttons have descriptive aria-labels (touch-target check)", () => {
    render(<HubReports />);

    const prevBtn = screen.getByRole("button", { name: "Попередній" });
    const nextBtn = screen.getByRole("button", { name: "Наступний" });

    expect(prevBtn).toBeInTheDocument();
    expect(nextBtn).toBeInTheDocument();

    // Both must be focusable (not hidden from AT)
    expect(prevBtn).not.toHaveAttribute("aria-hidden", "true");
    expect(nextBtn).not.toHaveAttribute("aria-hidden", "true");
  });

  // ── F7: insight text includes period label ────────────────────────────────
  // The presentation layer (HubReports) appends the active-period label to each
  // insight title returned by the side-effect-free engine. Mock the engine to
  // return a plain title and assert the period suffix reaches the DOM.
  const plainInsight = {
    id: "best_workout_day",
    iconName: "calendar" as const,
    title: "Найпродуктивніший день для тренувань",
    stat: "Понеділок",
    detail: "5 з 22 тренувань",
  };

  it("F7 — insight title gets the «за тиждень» suffix on the default period", () => {
    vi.mocked(generateInsights).mockReturnValue([plainInsight]);

    render(<HubReports />);

    expect(
      screen.getByText("Найпродуктивніший день для тренувань (за тиждень)"),
    ).toBeInTheDocument();
  });

  it("F7 — insight title suffix switches to «за місяць» when the period changes", () => {
    vi.mocked(generateInsights).mockReturnValue([plainInsight]);

    render(<HubReports />);

    act(() => {
      screen.getByRole("tab", { name: "Місяць" }).click();
    });

    expect(
      screen.getByText("Найпродуктивніший день для тренувань (за місяць)"),
    ).toBeInTheDocument();
  });

  // ── F23-c: period range header updates on offset change ───────────────────
  // formatPeriodLabel uses getPeriodRange(period, offset) and returns a
  // locale-formatted date range string. After clicking «Попередній» once
  // the displayed label must change from the current-period label.
  it("F23 — period range header updates when offset changes", async () => {
    render(<HubReports />);

    // Capture the initial period label text shown in the nav strip
    const initialLabel = screen.getByText(
      // The label is a short date range rendered between the nav buttons;
      // use a regex that matches the date separator used by formatPeriodLabel.
      /–/,
    ).textContent;

    const prevBtn = screen.getByRole("button", { name: "Попередній" });

    await act(async () => {
      prevBtn.click();
    });

    const updatedLabel = screen.getByText(/–/).textContent;

    // After navigating back one period the range label must differ
    expect(updatedLabel).not.toBe(initialLabel);
  });
});
