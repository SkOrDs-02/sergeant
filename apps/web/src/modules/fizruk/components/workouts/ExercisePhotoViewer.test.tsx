/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-01
 * Status: Active
 * Tests for ExercisePhotoViewer: phase switching, tap-to-advance,
 * autoplay start/stop, and the single-frame degradation.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { ExercisePhotoViewer } from "./ExercisePhotoViewer";

afterEach(cleanup);

// Portal-free Modal stub: the real one traps focus and portals to body,
// neither of which this component's own logic depends on.
vi.mock("@shared/components/ui/Modal", () => ({
  Modal: ({
    open,
    children,
    title,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="modal" aria-label={String(title)}>
        {children}
      </div>
    ) : null,
}));

const TWO = [
  "/exercises/bench_press_barbell/0.webp",
  "/exercises/bench_press_barbell/1.webp",
];

function open(images = TWO) {
  return render(
    <ExercisePhotoViewer
      open
      onClose={vi.fn()}
      images={images}
      title="Жим лежачи"
    />,
  );
}

describe("ExercisePhotoViewer", () => {
  it("renders nothing when there are no images", () => {
    const { container } = render(
      <ExercisePhotoViewer open onClose={vi.fn()} images={[]} title="Жим" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the start frame first", () => {
    open();
    expect(screen.getByRole("img")).toHaveAttribute("src", TWO[0]);
  });

  it("advances to the next frame on tap", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Наступний кадр/ }));
    expect(screen.getByRole("img")).toHaveAttribute("src", TWO[1]);
  });

  it("wraps back to the first frame", () => {
    open();
    const tap = screen.getByRole("button", { name: /Наступний кадр/ });
    fireEvent.click(tap);
    fireEvent.click(tap);
    expect(screen.getByRole("img")).toHaveAttribute("src", TWO[0]);
  });

  it("hides alternation controls for a single frame", () => {
    open([TWO[0] as string]);
    expect(
      screen.queryByRole("button", { name: "Рух" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/лише один кадр/)).toBeInTheDocument();
  });

  describe("autoplay", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("does not move until explicitly started (WCAG 2.2.2)", () => {
      open();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByRole("img")).toHaveAttribute("src", TWO[0]);
    });

    it("alternates frames once started and stops on the second press", () => {
      open();
      const play = screen.getByRole("button", { name: "Рух" });
      fireEvent.click(play);

      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(screen.getByRole("img")).toHaveAttribute("src", TWO[1]);

      fireEvent.click(screen.getByRole("button", { name: "Стоп" }));
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByRole("img")).toHaveAttribute("src", TWO[1]);
    });
  });
});
