/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ToastProvider } from "@shared/hooks/useToast";
import { STORAGE_KEYS } from "@sergeant/shared";
import { ModuleChecklist } from "./ModuleChecklist";

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

  it("keeps earlier checklist steps checked when another checkbox is selected", () => {
    renderChecklist(<ModuleChecklist moduleId="finyk" />);

    const addExpense = screen.getByRole("checkbox", {
      name: "Додати першу витрату",
    });
    const setBudget = screen.getByRole("checkbox", {
      name: "Встановити бюджет",
    });

    fireEvent.click(addExpense);
    fireEvent.click(setBudget);

    expect(addExpense).toHaveAttribute("aria-checked", "true");
    expect(setBudget).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("2/4 виконано")).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem("finyk_checklist_v1") ?? "{}"),
    ).toMatchObject({
      completedSteps: ["add_expense", "set_budget"],
    });
  });

  it("ticks steps proven by real data without any tap", () => {
    // A user with a monthly plan and today's spending recorded: both the
    // first two steps are facts, not something to ask them to click.
    localStorage.setItem(
      STORAGE_KEYS.FINYK_QUICK_STATS,
      JSON.stringify({ todaySpent: 340, budgetLeft: 5200 }),
    );

    renderChecklist(<ModuleChecklist moduleId="finyk" />);

    expect(
      screen.getByRole("checkbox", { name: "Додати першу витрату" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("checkbox", { name: "Встановити бюджет" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("2/4 виконано")).toBeInTheDocument();
    // Nothing was tapped, so nothing is recorded as a tap — the ticks come
    // purely from the data. (`firstSeenAt` is still stamped on mount.)
    expect(
      JSON.parse(localStorage.getItem("finyk_checklist_v1") ?? "{}"),
    ).toMatchObject({ completedSteps: [] });
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
