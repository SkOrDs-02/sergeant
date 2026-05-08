// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AssistantCataloguePage } from "./AssistantCataloguePage";

// Stub the detail modal — it pulls in chat plumbing we don't need to
// exercise the per-group collapse contract.
vi.mock("./components/CapabilityDetailModal", () => ({
  CapabilityDetailModal: () => null,
}));

const COLLAPSED_LS_KEY = "assistant_catalogue_collapsed_v1";

describe("AssistantCataloguePage — group collapsing", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it("groups are expanded by default and a representative row is visible", () => {
    render(<AssistantCataloguePage onClose={() => {}} />);
    expect(
      screen.getByTestId("catalogue-capability-create_transaction"),
    ).toBeTruthy();
    const finykToggle = screen.getByTestId("catalogue-module-finyk-toggle");
    expect(finykToggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("clicking a module header collapses just that group and persists to localStorage", () => {
    render(<AssistantCataloguePage onClose={() => {}} />);
    const finykToggle = screen.getByTestId("catalogue-module-finyk-toggle");
    fireEvent.click(finykToggle);

    expect(finykToggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByTestId("catalogue-capability-create_transaction"),
    ).toBeNull();
    // Other groups stay expanded.
    expect(
      screen
        .getByTestId("catalogue-module-fizruk-toggle")
        .getAttribute("aria-expanded"),
    ).toBe("true");

    const stored = JSON.parse(
      localStorage.getItem(COLLAPSED_LS_KEY) ?? "[]",
    ) as string[];
    expect(stored).toEqual(["finyk"]);
  });

  it("rehydrates collapsed groups from localStorage on mount", () => {
    localStorage.setItem(COLLAPSED_LS_KEY, JSON.stringify(["finyk", "fizruk"]));
    render(<AssistantCataloguePage onClose={() => {}} />);

    expect(
      screen
        .getByTestId("catalogue-module-finyk-toggle")
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      screen
        .getByTestId("catalogue-module-fizruk-toggle")
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      screen.queryByTestId("catalogue-capability-create_transaction"),
    ).toBeNull();
    // routine/nutrition headers stay expanded → at least one of their rows
    // is rendered.
    expect(
      screen
        .getByTestId("catalogue-module-routine-toggle")
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("`Згорнути все` collapses every group, second click re-expands", () => {
    render(<AssistantCataloguePage onClose={() => {}} />);
    const toggleAll = screen.getByTestId("catalogue-toggle-all");

    fireEvent.click(toggleAll);
    expect(
      screen.queryByTestId("catalogue-capability-create_transaction"),
    ).toBeNull();
    expect(
      screen
        .getByTestId("catalogue-module-finyk-toggle")
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(toggleAll.textContent).toMatch(/Розгорнути все/);

    fireEvent.click(toggleAll);
    expect(
      screen.getByTestId("catalogue-capability-create_transaction"),
    ).toBeTruthy();
    expect(toggleAll.textContent).toMatch(/Згорнути все/);
  });

  it("collapsed groups expand automatically while searching, persisted state is preserved", () => {
    localStorage.setItem(COLLAPSED_LS_KEY, JSON.stringify(["fizruk"]));
    render(<AssistantCataloguePage onClose={() => {}} />);

    const search = screen.getByLabelText("Пошук можливостей");
    fireEvent.change(search, { target: { value: "тренування" } });

    // Search hides the toggle-all row.
    expect(screen.queryByTestId("catalogue-toggle-all")).toBeNull();
    // start_workout (fizruk) row is now visible despite fizruk being
    // persisted as collapsed.
    expect(
      screen.getByTestId("catalogue-capability-start_workout"),
    ).toBeTruthy();

    fireEvent.change(search, { target: { value: "" } });
    // Persisted state restored: fizruk back to collapsed.
    expect(
      screen
        .getByTestId("catalogue-module-fizruk-toggle")
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(JSON.parse(localStorage.getItem(COLLAPSED_LS_KEY) ?? "[]")).toEqual([
      "fizruk",
    ]);
  });

  it("renders the legend explaining Чіп / Ризик / Новинка badges", () => {
    render(<AssistantCataloguePage onClose={() => {}} />);
    const legend = screen.getByTestId("catalogue-legend");
    // BadgeChip renders sentence-case labels ("Чіп", "Ризик", "Новинка");
    // any visual UPPERCASE comes from CSS `text-transform`, which jsdom
    // does not apply to `textContent`. Match against the rendered text.
    expect(legend.textContent).toMatch(/Позначки/);
    expect(legend.textContent).toMatch(/Чіп/);
    expect(legend.textContent).toMatch(/швидкий сценарій/);
    expect(legend.textContent).toMatch(/Ризик/);
    expect(legend.textContent).toMatch(/критична дія/);
    expect(legend.textContent).toMatch(/Новинка/);
    expect(legend.textContent).toMatch(/нещодавно додано/);
  });

  it("renders the Новинка badge on capabilities flagged with isNew", () => {
    render(<AssistantCataloguePage onClose={() => {}} />);
    // compare_weeks is flagged isNew in the registry; its row renders the
    // badge alongside the label.
    const row = screen.getByTestId("catalogue-capability-compare_weeks");
    expect(row.textContent).toMatch(/Новинка/);
    // Non-new capability has no Новинка text.
    const plainRow = screen.getByTestId(
      "catalogue-capability-create_transaction",
    );
    expect(plainRow.textContent).not.toMatch(/Новинка/);
  });

  it("ignores corrupt persisted shapes (non-array, unknown module ids)", () => {
    localStorage.setItem(COLLAPSED_LS_KEY, JSON.stringify({ bad: true }));
    render(<AssistantCataloguePage onClose={() => {}} />);
    expect(
      screen
        .getByTestId("catalogue-module-finyk-toggle")
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });
});
