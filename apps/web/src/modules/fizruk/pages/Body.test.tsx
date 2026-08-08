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
const recentWith = vi.fn((_field: string, _n?: number) => [] as unknown[]);

// Mutable entries backing `useDailyLog` — reassigned per-test (e.g. the
// deltaDirection wiring test below) so `buildBodyWeightSeries` gets ≥2
// weight points. Left empty for every other test, matching prior behaviour.
let mockDailyLogEntries: unknown[] = [];

vi.mock("../hooks/useDailyLog", () => ({
  useDailyLog: () => ({
    get entries() {
      return mockDailyLogEntries;
    },
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

// Captures every render's props so tests can assert on `deltaDirection`
// wiring without re-implementing the chart/card itself (page-audit
// regression: rising sleep/energy/mood used to inherit the weight-loss
// "up = warning" colouring — see CollapsibleTrendCard/MiniLineChart's own
// test files for the colour assertions; this file only checks the
// *wiring* from Body.tsx). `CollapsibleTrendCard` is mocked to always
// render its children regardless of the real collapsed-by-default
// localStorage state, so the nested `MiniLineChart` mock actually mounts.
const { collapsibleTrendCardCalls, miniLineChartCalls } = vi.hoisted(() => ({
  collapsibleTrendCardCalls: [] as Array<Record<string, unknown>>,
  miniLineChartCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("./Body/CollapsibleTrendCard", () => ({
  CollapsibleTrendCard: (
    props: Record<string, unknown> & { children?: unknown },
  ) => {
    collapsibleTrendCardCalls.push(props);
    return props.children;
  },
}));

vi.mock("../components/MiniLineChart", () => ({
  MiniLineChart: (props: Record<string, unknown>) => {
    miniLineChartCalls.push(props);
    return <div data-testid="mini-line-chart" />;
  },
}));

vi.mock("../components/InjuryManager", () => ({
  InjuryManager: () => <div data-testid="injury-manager" />,
}));

import { Body } from "./Body";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  recentWith.mockReturnValue([]);
  mockDailyLogEntries = [];
  collapsibleTrendCardCalls.length = 0;
  miniLineChartCalls.length = 0;
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

  it("disables the submit button and shows a hint when every field is empty (Z1)", () => {
    render(<Body />);
    expect(screen.getByRole("button", { name: "Записати" })).toBeDisabled();
    expect(
      screen.getByText("Заповни хоч одне поле, щоб зберегти запис"),
    ).toBeInTheDocument();
  });

  it("enables the submit button once any single field is filled (Z1)", () => {
    render(<Body />);
    fireEvent.change(screen.getByLabelText(/Вага \(кг\)/), {
      target: { value: "70" },
    });
    expect(screen.getByRole("button", { name: "Записати" })).toBeEnabled();
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

  it("wires deltaDirection per metric: neutral for weight, up-is-good for sleep/energy/mood", () => {
    mockDailyLogEntries = [
      { id: "dl1", at: "2026-06-18T08:00:00Z", weightKg: 84 },
      { id: "dl2", at: "2026-06-19T08:00:00Z", weightKg: 82 },
    ];
    recentWith.mockImplementation((field: string) => {
      if (field === "sleepHours") {
        return [
          { at: "2026-06-19T08:00:00Z", sleepHours: 8 },
          { at: "2026-06-18T08:00:00Z", sleepHours: 6 },
        ];
      }
      if (field === "energyLevel") {
        return [
          { at: "2026-06-19T08:00:00Z", energyLevel: 4 },
          { at: "2026-06-18T08:00:00Z", energyLevel: 3 },
        ];
      }
      if (field === "moodScore") {
        return [
          { at: "2026-06-19T08:00:00Z", moodScore: 5 },
          { at: "2026-06-18T08:00:00Z", moodScore: 4 },
        ];
      }
      return [];
    });

    render(<Body />);

    const chartByLabel = (label: string) =>
      miniLineChartCalls.find((c) => c["metricLabel"] === label);
    const cardByStorageKey = (storageKey: string) =>
      collapsibleTrendCardCalls.find((c) => c["storageKey"] === storageKey);

    expect(chartByLabel("вагу")?.["deltaDirection"]).toBe("neutral");
    expect(chartByLabel("сон")?.["deltaDirection"]).toBe("up-is-good");
    expect(chartByLabel("рівень енергії")?.["deltaDirection"]).toBe(
      "up-is-good",
    );
    expect(chartByLabel("настрій")?.["deltaDirection"]).toBe("up-is-good");

    expect(cardByStorageKey("weight")?.["deltaDirection"]).toBe("neutral");
    expect(cardByStorageKey("sleep")?.["deltaDirection"]).toBe("up-is-good");
    expect(cardByStorageKey("energy")?.["deltaDirection"]).toBe("up-is-good");
    expect(cardByStorageKey("mood")?.["deltaDirection"]).toBe("up-is-good");
  });
});
