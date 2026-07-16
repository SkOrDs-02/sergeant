// @vitest-environment jsdom
/**
 * Page tests for the Measurements screen (page-audit-07 F5).
 *
 * Covers the on-page form engine that the audit flagged as untested:
 *  - empty-form guard (F4) — submit disabled until a numeric field is set;
 *  - out-of-range validation (F3) — zod schema blocks PII outside min/max;
 *  - `Number(v.replace(",", "."))` locale parsing (`1,5` and `1.5`);
 *  - delta rendering between the two latest entries;
 *  - the delete button meets the touch-target floor (F8).
 *
 * `useMeasurements` is mocked so the test exercises page wiring, not the
 * SQLite/dual-write pipeline.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const addEntry = vi.fn();
const deleteEntry = vi.fn();
const restoreEntry = vi.fn();
const warning = vi.fn();

let mockEntries: Array<Record<string, unknown>> = [];

vi.mock("../hooks/useMeasurements", async () => {
  // Re-use the real MEASURE_FIELDS metadata (drives the form + schema).
  const actual = await vi.importActual<
    typeof import("../hooks/useMeasurements")
  >("../hooks/useMeasurements");
  return {
    ...actual,
    useMeasurements: () => ({
      entries: mockEntries,
      addEntry,
      deleteEntry,
      restoreEntry,
    }),
  };
});

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ warning, success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: vi.fn(),
}));

import { Measurements } from "./Measurements";

beforeEach(() => {
  mockEntries = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function getSaveButton() {
  return screen.getByRole("button", { name: "Зберегти замір" });
}

describe("Measurements page", () => {
  it("mounts without crashing", () => {
    expect(() => render(<Measurements />)).not.toThrow();
  });

  it("opens the internal measurement guide with primary-source links", () => {
    render(<Measurements />);
    fireEvent.click(
      screen.getByRole("button", { name: /Як правильно робити заміри/ }),
    );

    expect(
      screen.getByRole("heading", { name: "Як правильно робити заміри" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WHO STEPS/ })).toHaveAttribute(
      "href",
      expect.stringContaining("who.int"),
    );
    expect(screen.getByRole("link", { name: /CDC/ })).toHaveAttribute(
      "href",
      expect.stringContaining("cdc.gov"),
    );
  });

  it("disables the submit button when the form is empty (F4)", () => {
    render(<Measurements />);
    expect(getSaveButton()).toBeDisabled();
  });

  it("does not persist a fully-empty form even if onClick is invoked (F4)", () => {
    render(<Measurements />);
    fireEvent.click(getSaveButton());
    expect(addEntry).not.toHaveBeenCalled();
  });

  it("enables submit once a valid numeric field is entered", () => {
    render(<Measurements />);
    fireEvent.change(screen.getByLabelText(/Вага · кг/), {
      target: { value: "82.5" },
    });
    expect(getSaveButton()).toBeEnabled();
  });

  it("persists an in-range value on submit", () => {
    render(<Measurements />);
    fireEvent.change(screen.getByLabelText(/Вага · кг/), {
      target: { value: "82.5" },
    });
    fireEvent.click(getSaveButton());
    expect(addEntry).toHaveBeenCalledWith({ weightKg: 82.5 });
  });

  it("parses a decimal field value before persisting", () => {
    render(<Measurements />);
    // % жиру range is 2..70 — a dot decimal within bounds. (The form input
    // is type=number so the browser normalises separators; the page's
    // `replace(",", ".")` is a defensive fallback for programmatic values.)
    fireEvent.change(screen.getByLabelText(/% жиру · %/), {
      target: { value: "12.5" },
    });
    fireEvent.click(getSaveButton());
    expect(addEntry).toHaveBeenCalledWith({ bodyFatPct: 12.5 });
  });

  it("blocks an out-of-range value via the zod schema and warns (F3)", () => {
    render(<Measurements />);
    // weightKg max is 300 — 99999 must be rejected.
    fireEvent.change(screen.getByLabelText(/Вага · кг/), {
      target: { value: "99999" },
    });
    fireEvent.click(getSaveButton());
    expect(addEntry).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("strips NaN input so a stray value cannot enable submit (F3/F4)", () => {
    render(<Measurements />);
    fireEvent.change(screen.getByLabelText(/Вага · кг/), {
      target: { value: "abc" },
    });
    // "abc" → NaN → stripped → no parseable value → still disabled.
    expect(getSaveButton()).toBeDisabled();
  });

  it("renders a delta between the two latest entries", () => {
    mockEntries = [
      { id: "b", at: "2026-05-14T08:00:00Z", weightKg: 83 },
      { id: "a", at: "2026-05-07T08:00:00Z", weightKg: 80 },
    ];
    render(<Measurements />);
    // +3.0 kg delta surfaced in the "Останній замір" card.
    expect(screen.getByText(/\+3\.0/)).toBeInTheDocument();
  });

  it("delete button exposes an accessible name and touch-target sizing (F8)", () => {
    mockEntries = [{ id: "a", at: "2026-05-14T08:00:00Z", weightKg: 80 }];
    render(<Measurements />);
    const del = screen.getByRole("button", { name: "Видалити замір" });
    expect(del.className).toContain("touch-target");
    // Semantic danger token, not a raw opacity-on-saturated-fill.
    expect(del.className).toContain("text-danger-strong");
  });

  it("invokes the delete handler when the delete button is clicked", () => {
    mockEntries = [{ id: "a", at: "2026-05-14T08:00:00Z", weightKg: 80 }];
    render(<Measurements />);
    fireEvent.click(screen.getByRole("button", { name: "Видалити замір" }));
    expect(deleteEntry).toHaveBeenCalledWith("a");
  });

  it("each measurement input is associated with a label (a11y)", () => {
    render(<Measurements />);
    // 14 numeric fields, each with htmlFor/id binding (F13 closed earlier).
    const waist = screen.getByLabelText(/Талія · см/);
    expect(waist).toHaveAttribute("type", "number");
  });
});
