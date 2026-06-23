// @vitest-environment jsdom
/**
 * Tests for `CelebrationModal`, the `useCelebration` controller hook, and
 * the `MiniSuccess` toast.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  fireEvent,
  act,
  renderHook,
  screen,
} from "@testing-library/react";
import {
  CelebrationModal,
  MiniSuccess,
  useCelebration,
} from "./CelebrationModal";

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CelebrationModal", () => {
  it("renders nothing when closed", () => {
    render(
      <CelebrationModal
        type="success"
        open={false}
        onClose={vi.fn()}
        title="x"
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a labelled dialog with title and description when open", () => {
    render(
      <CelebrationModal
        type="success"
        open
        onClose={vi.fn()}
        title="Готово!"
        description="Все вийшло"
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Готово!")).toBeInTheDocument();
    expect(screen.getByText("Все вийшло")).toBeInTheDocument();
  });

  it("fires haptic vibration on open", () => {
    render(
      <CelebrationModal
        type="confetti"
        open
        onClose={vi.fn()}
        title="Перемога"
      />,
    );
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it("renders value + unit", () => {
    render(
      <CelebrationModal
        type="streak"
        open
        onClose={vi.fn()}
        title="Стрік"
        value={7}
        unit="днів"
      />,
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("днів")).toBeInTheDocument();
  });

  it("renders a progress bar with current/max", () => {
    render(
      <CelebrationModal
        type="levelUp"
        open
        onClose={vi.fn()}
        title="Рівень"
        progress={{ current: 3, max: 5 }}
      />,
    );
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
  });

  it("renders rewards", () => {
    render(
      <CelebrationModal
        type="achievement"
        open
        onClose={vi.fn()}
        title="Досягнення"
        rewards={[{ icon: "🎖", label: "Медаль" }]}
      />,
    );
    expect(screen.getByText("Медаль")).toBeInTheDocument();
  });

  it("invokes onAction then onClose when the action button is pressed", () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(
      <CelebrationModal
        type="success"
        open
        onClose={onClose}
        onAction={onAction}
        title="x"
        actionLabel="Далі"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Далі" }));
    act(() => vi.advanceTimersByTime(250)); // close animation delay
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the backdrop button", () => {
    const onClose = vi.fn();
    render(
      <CelebrationModal type="goal" open onClose={onClose} title="Ціль" />,
    );
    const backdrop = screen.getAllByRole("button")[0]!; // backdrop is tabindex -1
    fireEvent.click(backdrop);
    act(() => vi.advanceTimersByTime(250));
    expect(onClose).toHaveBeenCalled();
  });

  it("auto-closes after autoCloseMs", () => {
    const onClose = vi.fn();
    render(
      <CelebrationModal
        type="success"
        open
        onClose={onClose}
        title="x"
        autoCloseMs={3000}
      />,
    );
    act(() => vi.advanceTimersByTime(3000));
    act(() => vi.advanceTimersByTime(250));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders a custom icon when supplied", () => {
    render(
      <CelebrationModal
        type="success"
        open
        onClose={vi.fn()}
        title="x"
        icon={<span data-testid="custom-icon">★</span>}
      />,
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });
});

describe("useCelebration", () => {
  it("starts with no component", () => {
    const { result } = renderHook(() => useCelebration());
    expect(result.current.CelebrationComponent).toBeNull();
  });

  it("celebrate() produces a renderable component", () => {
    const { result } = renderHook(() => useCelebration());
    act(() => result.current.success("Готово", "опис"));
    expect(result.current.CelebrationComponent).not.toBeNull();
  });

  it("dismiss() clears the component", () => {
    const { result } = renderHook(() => useCelebration());
    act(() => result.current.streak(10));
    expect(result.current.CelebrationComponent).not.toBeNull();
    act(() => result.current.dismiss());
    expect(result.current.CelebrationComponent).toBeNull();
  });

  it("shorthand helpers configure the right type", () => {
    const { result } = renderHook(() => useCelebration());
    act(() => result.current.levelUp(5, { current: 1, max: 2 }));
    expect(result.current.CelebrationComponent).not.toBeNull();
    act(() => result.current.dismiss());
    act(() => result.current.confetti("Bravo"));
    expect(result.current.CelebrationComponent).not.toBeNull();
    act(() => result.current.dismiss());
    act(() => result.current.goalCompleted("Done", 100, "грн"));
    expect(result.current.CelebrationComponent).not.toBeNull();
    act(() => result.current.dismiss());
    act(() => result.current.achievement("Win"));
    expect(result.current.CelebrationComponent).not.toBeNull();
  });
});

describe("MiniSuccess", () => {
  it("renders nothing when show is false", () => {
    const { container } = render(<MiniSuccess show={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the message when show is true", () => {
    render(<MiniSuccess show message="Збережено" />);
    expect(screen.getByText("Збережено")).toBeInTheDocument();
  });

  it("hides and calls onComplete after the duration", () => {
    const onComplete = vi.fn();
    render(
      <MiniSuccess show message="x" duration={1500} onComplete={onComplete} />,
    );
    expect(screen.getByText("x")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1500));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("x")).toBeNull();
  });
});
