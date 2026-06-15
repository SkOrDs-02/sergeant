// @vitest-environment jsdom
/**
 * Page tests for the Body screen (page-audit-07 F5).
 *
 * Covers the page wiring the audit flagged as untested:
 *  - the daily-log entry form mounts with weight / sleep / note inputs;
 *  - energy & mood scores are exposed as ARIA radiogroups (F14);
 *  - out-of-range weight is rejected by the zod schema (boundary 20..300);
 *  - the trend cards stay hidden until ≥2 data points exist.
 *
 * `useDailyLog` is mocked; the real `useApiForm` (react-hook-form) is kept
 * so the validation path is exercised end-to-end. `RecoveryFocusCard` is not
 * rendered because `onOpenAtlas` is omitted, so its hook stack is untouched.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

const addEntry = vi.fn();
const recentWith = vi.fn(() => [] as unknown[]);

vi.mock("../hooks/useDailyLog", () => ({
  useDailyLog: () => ({
    entries: [],
    latest: null,
    addEntry,
    deleteEntry: vi.fn(),
    restoreEntry: vi.fn(),
    recentWith,
  }),
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ warning: vi.fn(), success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@shared/lib/ui/undoToast", () => ({ showUndoToast: vi.fn() }));

vi.mock("../components/MiniLineChart", () => ({
  MiniLineChart: () => <div data-testid="mini-line-chart" />,
}));

import { Body } from "./Body";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  recentWith.mockReturnValue([]);
});

describe("Body page", () => {
  it("mounts without crashing", () => {
    expect(() => render(<Body />)).not.toThrow();
  });

  it("renders the daily-log form inputs", () => {
    render(<Body />);
    expect(screen.getByLabelText(/Вага \(кг\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Сон \(год\)/)).toBeInTheDocument();
  });

  it("exposes energy and mood as ARIA radiogroups (F14)", () => {
    render(<Body />);
    expect(
      screen.getByRole("radiogroup", { name: "Рівень енергії" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Настрій" }),
    ).toBeInTheDocument();
  });

  it("rejects an out-of-range weight via the zod schema (boundary 300)", async () => {
    render(<Body />);
    fireEvent.change(screen.getByLabelText(/Вага \(кг\)/), {
      target: { value: "999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Записати" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(addEntry).not.toHaveBeenCalled();
  });

  it("submits a valid entry", async () => {
    render(<Body />);
    fireEvent.change(screen.getByLabelText(/Вага \(кг\)/), {
      target: { value: "82.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Записати" }));
    await waitFor(() => {
      expect(addEntry).toHaveBeenCalledTimes(1);
    });
    expect(addEntry.mock.calls[0]![0]).toMatchObject({ weightKg: 82.5 });
  });

  it("shows the trends-collecting placeholder when there are <2 points", () => {
    render(<Body />);
    expect(screen.getByText("Тренди ще збираються")).toBeInTheDocument();
  });
});
