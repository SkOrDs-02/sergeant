/** @vitest-environment jsdom */
/**
 * Render + interaction tests for FizrukDayPlanSheet.
 *
 * The component delegates all state to three fizruk hooks
 * (useMonthlyPlan / useWorkoutTemplates / useExerciseCatalog).
 * We mock those at the module boundary and drive every branch
 * (sheet closed, empty-template list, no assignment, assigned template
 * with exercises, assign / unassign interaction) through props.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// ─── hook mocks (hoisted so vi.mock factories can close over them) ─────────
const getTemplateForDate = vi.fn<(dateKey: string) => string | null>(
  () => null,
);
const setDayTemplate = vi.fn();

vi.mock("../../fizruk/hooks/useMonthlyPlan", () => ({
  useMonthlyPlan: () => ({ getTemplateForDate, setDayTemplate }),
}));

const mockTemplates = vi.fn<
  () => { id: string; name: string; exerciseIds: string[] }[]
>(() => []);

vi.mock("../../fizruk/hooks/useWorkoutTemplates", () => ({
  useWorkoutTemplates: () => ({ templates: mockTemplates() }),
}));

const mockExercises = vi.fn<
  () => {
    id: string;
    name?: { uk?: string; en?: string };
    primaryGroup?: string;
    primaryGroupUk?: string;
  }[]
>(() => []);

vi.mock("../../fizruk/hooks/useExerciseCatalog", () => ({
  useExerciseCatalog: () => ({ exercises: mockExercises() }),
}));

import { FizrukDayPlanSheet } from "./FizrukDayPlanSheet";

beforeEach(() => {
  getTemplateForDate.mockReturnValue(null);
  mockTemplates.mockReturnValue([]);
  mockExercises.mockReturnValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FizrukDayPlanSheet", () => {
  it("renders nothing when dateKey is null (sheet closed)", () => {
    const { container } = render(
      <FizrukDayPlanSheet dateKey={null} onClose={() => {}} />,
    );
    // Sheet returns null when open={false}
    expect(container.firstChild).toBeNull();
  });

  it("shows the empty-state message when no template is assigned to the selected date", () => {
    getTemplateForDate.mockReturnValue(null);
    mockTemplates.mockReturnValue([
      { id: "tpl-1", name: "Ранкове", exerciseIds: [] },
    ]);
    render(<FizrukDayPlanSheet dateKey="2026-06-23" onClose={() => {}} />);
    expect(screen.getByText("Тренування не призначено")).toBeInTheDocument();
  });

  it("shows 'Шаблонів поки немає' when the templates list is empty", () => {
    mockTemplates.mockReturnValue([]);
    render(<FizrukDayPlanSheet dateKey="2026-06-23" onClose={() => {}} />);
    expect(screen.getByText(/Шаблонів поки немає/)).toBeInTheDocument();
  });

  it("renders template selector buttons for each template", () => {
    mockTemplates.mockReturnValue([
      { id: "tpl-1", name: "Силове", exerciseIds: [] },
      { id: "tpl-2", name: "Кардіо", exerciseIds: [] },
    ]);
    render(<FizrukDayPlanSheet dateKey="2026-06-23" onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /Силове/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Кардіо/ })).toBeInTheDocument();
  });

  it("assigns a template when an inactive template button is clicked", () => {
    getTemplateForDate.mockReturnValue(null);
    mockTemplates.mockReturnValue([
      { id: "tpl-1", name: "Силове", exerciseIds: [] },
    ]);
    render(<FizrukDayPlanSheet dateKey="2026-06-23" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Силове/ }));
    expect(setDayTemplate).toHaveBeenCalledWith("2026-06-23", "tpl-1");
  });

  it("does NOT call setDayTemplate when the already-active template is clicked", () => {
    getTemplateForDate.mockReturnValue("tpl-1");
    mockTemplates.mockReturnValue([
      { id: "tpl-1", name: "Силове", exerciseIds: [] },
    ]);
    render(<FizrukDayPlanSheet dateKey="2026-06-23" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Силове/ }));
    expect(setDayTemplate).not.toHaveBeenCalled();
  });

  it("shows the assigned template name and a 'Зняти' button", () => {
    getTemplateForDate.mockReturnValue("tpl-1");
    mockTemplates.mockReturnValue([
      { id: "tpl-1", name: "Силове тренування", exerciseIds: [] },
    ]);
    render(<FizrukDayPlanSheet dateKey="2026-06-23" onClose={() => {}} />);
    // Template name appears twice: once as the assigned label and once in the selector list.
    expect(
      screen.getAllByText("Силове тренування").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Зняти" })).toBeInTheDocument();
    // The "Призначений шаблон" label confirms the assigned-state branch.
    expect(screen.getByText("Призначений шаблон")).toBeInTheDocument();
  });

  it("calls setDayTemplate(dateKey, null) when 'Зняти' is clicked", () => {
    getTemplateForDate.mockReturnValue("tpl-1");
    mockTemplates.mockReturnValue([
      { id: "tpl-1", name: "Силове тренування", exerciseIds: [] },
    ]);
    render(<FizrukDayPlanSheet dateKey="2026-06-23" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Зняти" }));
    expect(setDayTemplate).toHaveBeenCalledWith("2026-06-23", null);
  });

  it("shows exercise names (uk > en > id fallback) when a template with exercises is assigned", () => {
    getTemplateForDate.mockReturnValue("tpl-1");
    mockTemplates.mockReturnValue([
      { id: "tpl-1", name: "Силове", exerciseIds: ["ex-1", "ex-2", "ex-3"] },
    ]);
    mockExercises.mockReturnValue([
      {
        id: "ex-1",
        name: { uk: "Присідання", en: "Squat" },
        primaryGroup: "legs",
        primaryGroupUk: "ноги",
      },
      { id: "ex-2", name: { en: "Push-up" } },
      { id: "ex-3" },
    ]);
    render(<FizrukDayPlanSheet dateKey="2026-06-23" onClose={() => {}} />);
    expect(screen.getByText("Присідання")).toBeInTheDocument();
    expect(screen.getByText("Push-up")).toBeInTheDocument();
    expect(screen.getByText("ex-3")).toBeInTheDocument();
    expect(screen.getByText("ноги")).toBeInTheDocument();
  });

  it("shows 'Змінити шаблон' heading when a template is already assigned", () => {
    getTemplateForDate.mockReturnValue("tpl-1");
    mockTemplates.mockReturnValue([
      { id: "tpl-1", name: "Силове", exerciseIds: [] },
      { id: "tpl-2", name: "Кардіо", exerciseIds: [] },
    ]);
    render(<FizrukDayPlanSheet dateKey="2026-06-23" onClose={() => {}} />);
    expect(screen.getByText("Змінити шаблон")).toBeInTheDocument();
  });

  it("shows 'Обрати шаблон' heading when no template is assigned", () => {
    getTemplateForDate.mockReturnValue(null);
    mockTemplates.mockReturnValue([
      { id: "tpl-1", name: "Ранкове", exerciseIds: [] },
    ]);
    render(<FizrukDayPlanSheet dateKey="2026-06-23" onClose={() => {}} />);
    expect(screen.getByText("Обрати шаблон")).toBeInTheDocument();
  });

  it("calls onClose when the 'Закрити' footer button is clicked", () => {
    const onClose = vi.fn();
    mockTemplates.mockReturnValue([]);
    render(<FizrukDayPlanSheet dateKey="2026-06-23" onClose={onClose} />);
    // The Sheet has three "Закрити" affordances: overlay, header-close-icon, footer-button.
    // Use the footer's visible text (not aria-label) to target it specifically.
    const allClose = screen.getAllByRole("button", { name: "Закрити" });
    // The footer button is the last one (overlay → header icon → footer text)
    const footerBtn = allClose[allClose.length - 1]!;
    fireEvent.click(footerBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
