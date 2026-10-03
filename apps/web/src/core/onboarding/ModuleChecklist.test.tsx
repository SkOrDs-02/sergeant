/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ToastProvider } from "@shared/hooks/useToast";
import { STORAGE_KEYS } from "@sergeant/shared";
import { ModuleChecklist } from "./ModuleChecklist";
import { markFinykAnalyticsViewed } from "./useChecklistSignals";

vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: vi.fn(),
  hapticSuccess: vi.fn(),
}));

// The finyk checklist probes Monobank sync-state for the "Підключити
// Monobank" step, so it needs a QueryClient just like the Hub gives it in
// production. `retry: false` keeps the unresolved probe from retrying.
function renderChecklist(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * DAY_MS).toISOString();

describe("ModuleChecklist", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // F3 audit (2026-09-11), defect (a): a row tap used to write
  // `completedSteps` directly and unconditionally — tapping ANY step
  // checked it off regardless of whether the underlying data backed it.
  it("does not complete a step from a tap — a row is pure navigation now", () => {
    renderChecklist(<ModuleChecklist moduleId="finyk" />);

    const setBudget = screen.getByRole("button", {
      name: "Встановити бюджет",
    });
    fireEvent.click(setBudget);

    // Still shows as not-done — no signal proved it, and the tap must not
    // have marked it done on its own.
    expect(setBudget).not.toHaveAttribute("aria-checked");
    expect(screen.getByText("0/4 виконано")).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem("finyk_checklist_v1") ?? "{}"),
    ).toMatchObject({ completedSteps: [] });
  });

  // F3 audit (2026-09-11), defect (a): regression test for the exact
  // reported symptom — "тапнув «Встановити бюджет» → пункт закреслився
  // → нікуди не перейшло". The row must still forward the action for
  // navigation; it just must not ALSO check itself off.
  it("still forwards the action for navigation on tap, without completing the step", () => {
    const onAction = vi.fn();
    renderChecklist(<ModuleChecklist moduleId="finyk" onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Встановити бюджет" }));

    expect(onAction).toHaveBeenCalledWith("set_budget");
    expect(
      JSON.parse(localStorage.getItem("finyk_checklist_v1") ?? "{}"),
    ).toMatchObject({ completedSteps: [] });
  });

  // F3 audit (2026-09-11), defect (b): the whole row used to be
  // `role="checkbox"`, so one tap did two things at once (checked the
  // box AND tried to navigate). A step's role must match what it does —
  // it navigates, so it's a plain button, never a checkbox.
  it("renders an actionable step as a plain navigation button, not a checkbox", () => {
    renderChecklist(<ModuleChecklist moduleId="finyk" />);

    expect(
      screen.queryByRole("checkbox", { name: "Встановити бюджет" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Встановити бюджет" }),
    ).toBeInTheDocument();
  });

  it("ticks steps proven by real data without any tap, and latches them permanently", async () => {
    // A user with a monthly plan and today's spending recorded: both the
    // first two steps are facts, not something to ask them to click.
    localStorage.setItem(
      STORAGE_KEYS.FINYK_QUICK_STATS,
      JSON.stringify({ todaySpent: 340, budgetLeft: 5200 }),
    );

    renderChecklist(<ModuleChecklist moduleId="finyk" />);

    expect(screen.getByText("Додати першу витрату")).toBeInTheDocument();
    expect(screen.getByText("2/4 виконано")).toBeInTheDocument();
    // A done step has nothing left to tap, so it renders as a static row
    // (no `checkbox` OR `button` role) — reachable by its visible text.
    expect(
      screen.queryByRole("button", { name: "Додати першу витрату" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Додати першу витрату" }),
    ).not.toBeInTheDocument();
    // Owner decision (F3, 2026-09-11): a step latches the moment data
    // proves it — permanently, so it survives the proving record being
    // deleted later. Unlike the pre-fix behaviour ("nothing was tapped,
    // so nothing is recorded"), the auto-latch effect DOES persist it.
    // The write happens a microtask after mount (`ModuleChecklist.tsx`'s
    // `react-hooks/set-state-in-effect` workaround), hence `waitFor`.
    await waitFor(() => {
      expect(
        JSON.parse(localStorage.getItem("finyk_checklist_v1") ?? "{}")
          .completedSteps,
      ).toEqual(expect.arrayContaining(["add_expense", "set_budget"]));
    });
  });

  // F3 audit (2026-09-11), defect (г): "Переглянути аналітику" has no
  // quick-stats trace of its own — `markFinykAnalyticsViewed` (called by
  // `HubHeroBlock` right before the navigation dispatch) is the signal.
  it("shows 'Переглянути аналітику' as done once the navigation-dispatch signal is recorded", () => {
    markFinykAnalyticsViewed();

    renderChecklist(<ModuleChecklist moduleId="finyk" />);

    expect(
      screen.queryByRole("button", { name: "Переглянути аналітику" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Переглянути аналітику")).toBeInTheDocument();
    expect(screen.getByText("1/4 виконано")).toBeInTheDocument();
  });

  it("does not render at all for an account older than the FTUX window", () => {
    // The reported bug: reinstalling the PWA wipes localStorage, so every
    // device-local term of the old gate looked "new" again.
    const { container } = renderChecklist(
      <ModuleChecklist moduleId="finyk" accountCreatedAt={isoDaysAgo(200)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("still renders for a genuinely fresh account", () => {
    renderChecklist(
      <ModuleChecklist moduleId="finyk" accountCreatedAt={isoDaysAgo(2)} />,
    );
    expect(screen.getByText("Фінік: Перші кроки")).toBeInTheDocument();
  });
});
