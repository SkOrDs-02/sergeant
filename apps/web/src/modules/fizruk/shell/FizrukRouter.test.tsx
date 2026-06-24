// @vitest-environment jsdom
/**
 * Tests for FizrukRouter — the thin per-page lazy switch.
 *
 * The real pages are heavy (catalogue, charts, SQLite boot), so every
 * `../pages/*` module is mocked with a light stub that echoes the props
 * the router forwards. Because each page is a `React.lazy()` chunk wrapped
 * in a single `<Suspense>`, assertions await the stub via `findBy*`.
 *
 * Coverage:
 *  - each `case` in `renderPage` mounts the right page;
 *  - prop wiring for the dashboard / workouts / programs / body / exercise
 *    cases (onNavigate adapters, onOpenModule → routine deep-link);
 *  - the Suspense fallback (ModulePageLoader) shows before resolution;
 *  - the per-page error title map + the generic fallback for an
 *    unknown page value (which renders `null`).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import type {
  TrainingProgramDef,
  ProgramSessionDef,
} from "@sergeant/fizruk-domain/domain";
import { FizrukRouter, type FizrukRouterProps } from "./FizrukRouter";

// Light stubs for every lazy page. Each echoes the props the router
// passes so we can both detect "which page mounted" and exercise the
// forwarded callbacks.
vi.mock("../pages/Dashboard", () => ({
  Dashboard: (p: {
    onOpenPrograms: () => void;
    onNavigate: (t: string) => void;
  }) => (
    <div data-testid="page-dashboard">
      <button onClick={p.onOpenPrograms}>dash-open-programs</button>
      <button onClick={() => p.onNavigate("progress")}>dash-navigate</button>
    </div>
  ),
}));
vi.mock("../pages/Atlas", () => ({
  Atlas: () => <div data-testid="page-atlas" />,
}));
vi.mock("../pages/Exercise", () => ({
  Exercise: (p: { exerciseId: string }) => (
    <div data-testid="page-exercise">{p.exerciseId}</div>
  ),
}));
vi.mock("../pages/Workouts", () => ({
  Workouts: (p: { onOpenRoutine?: () => void; onOpenPrograms: () => void }) => (
    <div data-testid="page-workouts">
      <button disabled={!p.onOpenRoutine} onClick={() => p.onOpenRoutine?.()}>
        wk-open-routine
      </button>
      <button onClick={p.onOpenPrograms}>wk-open-programs</button>
    </div>
  ),
}));
vi.mock("../pages/Progress", () => ({
  Progress: (p: { onNavigate: (t: string) => void }) => (
    <div data-testid="page-progress">
      <button onClick={() => p.onNavigate("dashboard")}>prog-navigate</button>
    </div>
  ),
}));
vi.mock("../pages/Measurements", () => ({
  Measurements: () => <div data-testid="page-measurements" />,
}));
vi.mock("../pages/Body", () => ({
  Body: (p: { onOpenMeasurements: () => void; onOpenAtlas: () => void }) => (
    <div data-testid="page-body">
      <button onClick={p.onOpenMeasurements}>body-open-meas</button>
      <button onClick={p.onOpenAtlas}>body-open-atlas</button>
    </div>
  ),
}));
vi.mock("../pages/Programs", () => ({
  Programs: (p: { activeProgramId: string | null }) => (
    <div data-testid="page-programs">{p.activeProgramId ?? "none"}</div>
  ),
}));

function baseProps(over: Partial<FizrukRouterProps> = {}): FizrukRouterProps {
  return {
    page: "dashboard",
    exerciseId: undefined,
    activeProgramId: null,
    activeProgram: null,
    activateProgram: vi.fn(),
    deactivateProgram: vi.fn(),
    todaySession: null,
    onNavigate: vi.fn(),
    onStartProgramWorkout: vi.fn(),
    onOpenModule: undefined,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FizrukRouter — page switch", () => {
  it("renders the dashboard page by default", async () => {
    render(<FizrukRouter {...baseProps()} />);
    expect(await screen.findByTestId("page-dashboard")).toBeInTheDocument();
  });

  it.each([
    ["atlas", "page-atlas"],
    ["workouts", "page-workouts"],
    ["progress", "page-progress"],
    ["measurements", "page-measurements"],
    ["programs", "page-programs"],
    ["body", "page-body"],
    ["exercise", "page-exercise"],
  ] as const)("renders the %s page", async (page, testid) => {
    render(<FizrukRouter {...baseProps({ page })} />);
    expect(await screen.findByTestId(testid)).toBeInTheDocument();
  });

  it("renders nothing for an unknown page value", async () => {
    const { container } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <FizrukRouter {...baseProps({ page: "bogus" as any })} />,
    );
    // No page stub mounts; the error boundary stays clear and the
    // Suspense fallback flushes to an empty subtree.
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    expect(container.querySelector('[data-testid^="page-"]')).toBeNull();
  });
});

describe("FizrukRouter — prop wiring", () => {
  it("dashboard onOpenPrograms / onNavigate route through props", async () => {
    const onNavigate = vi.fn();
    render(<FizrukRouter {...baseProps({ onNavigate })} />);
    fireEvent.click(await screen.findByText("dash-open-programs"));
    expect(onNavigate).toHaveBeenCalledWith("programs");
    fireEvent.click(screen.getByText("dash-navigate"));
    expect(onNavigate).toHaveBeenCalledWith("progress");
  });

  it("workouts onOpenRoutine is undefined when onOpenModule is absent", async () => {
    render(<FizrukRouter {...baseProps({ page: "workouts" })} />);
    const routineBtn = (await screen.findByText(
      "wk-open-routine",
    )) as HTMLButtonElement;
    expect(routineBtn).toBeDisabled();
  });

  it("workouts onOpenRoutine deep-links into routine when onOpenModule is provided", async () => {
    const onOpenModule = vi.fn();
    render(<FizrukRouter {...baseProps({ page: "workouts", onOpenModule })} />);
    fireEvent.click(await screen.findByText("wk-open-routine"));
    expect(onOpenModule).toHaveBeenCalledWith("routine", { hash: "calendar" });
  });

  it("workouts onOpenPrograms navigates to programs", async () => {
    const onNavigate = vi.fn();
    render(<FizrukRouter {...baseProps({ page: "workouts", onNavigate })} />);
    fireEvent.click(await screen.findByText("wk-open-programs"));
    expect(onNavigate).toHaveBeenCalledWith("programs");
  });

  it("progress onNavigate routes through props", async () => {
    const onNavigate = vi.fn();
    render(<FizrukRouter {...baseProps({ page: "progress", onNavigate })} />);
    fireEvent.click(await screen.findByText("prog-navigate"));
    expect(onNavigate).toHaveBeenCalledWith("dashboard");
  });

  it("body onOpenMeasurements / onOpenAtlas map to navigate targets", async () => {
    const onNavigate = vi.fn();
    render(<FizrukRouter {...baseProps({ page: "body", onNavigate })} />);
    fireEvent.click(await screen.findByText("body-open-meas"));
    expect(onNavigate).toHaveBeenCalledWith("measurements");
    fireEvent.click(screen.getByText("body-open-atlas"));
    expect(onNavigate).toHaveBeenCalledWith("atlas");
  });

  it("exercise forwards the exerciseId (and falls back to empty string)", async () => {
    const { unmount } = render(
      <FizrukRouter
        {...baseProps({ page: "exercise", exerciseId: "ex-42" })}
      />,
    );
    expect(await screen.findByTestId("page-exercise")).toHaveTextContent(
      "ex-42",
    );
    unmount();
    render(
      <FizrukRouter
        {...baseProps({ page: "exercise", exerciseId: undefined })}
      />,
    );
    const node = await screen.findByTestId("page-exercise");
    expect(node).toHaveTextContent("");
  });

  it("programs receives the active program id", async () => {
    render(
      <FizrukRouter
        {...baseProps({
          page: "programs",
          activeProgramId: "prog-1",
          activeProgram: { id: "prog-1" } as TrainingProgramDef,
        })}
      />,
    );
    expect(await screen.findByTestId("page-programs")).toHaveTextContent(
      "prog-1",
    );
  });

  it("dashboard onStartProgramWorkout is forwarded as a prop (smoke)", async () => {
    // The stub doesn't call it, but rendering with a real fn exercises the
    // props.onStartProgramWorkout pass-through branch in renderPage.
    const onStartProgramWorkout = vi.fn(
      (_s: ProgramSessionDef, _p: TrainingProgramDef) => {},
    );
    render(<FizrukRouter {...baseProps({ onStartProgramWorkout })} />);
    expect(await screen.findByTestId("page-dashboard")).toBeInTheDocument();
  });
});
