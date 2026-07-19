/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

afterEach(cleanup);

describe("ProgressBar", () => {
  it("defaults to value=0, max=100 and a computed percentage aria-label", () => {
    const { getByRole } = render(<ProgressBar />);
    const bar = getByRole("progressbar");
    expect(bar.getAttribute("aria-label")).toBe("0%");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });

  it("clamps value below 0 and above max", () => {
    const { getByRole, rerender } = render(<ProgressBar value={-10} />);
    expect(getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");

    rerender(<ProgressBar value={150} max={100} />);
    expect(getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("uses a 'x з y' label when max is not 100", () => {
    const { getByRole } = render(<ProgressBar value={3} max={5} />);
    expect(getByRole("progressbar").getAttribute("aria-label")).toBe("3 з 5");
  });

  it("falls back max<=0 to a safe denominator of 1", () => {
    const { getByRole } = render(<ProgressBar value={5} max={0} />);
    const bar = getByRole("progressbar");
    expect(bar.getAttribute("aria-valuemax")).toBe("1");
  });

  it("indeterminate mode sets aria-busy and drops valuenow/valuemax", () => {
    const { getByRole } = render(<ProgressBar indeterminate />);
    const bar = getByRole("progressbar");
    expect(bar.getAttribute("aria-busy")).toBe("true");
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.hasAttribute("aria-valuemax")).toBe(false);
    expect(bar.getAttribute("aria-label")).toBe("Завантаження…");
  });

  it("accepts an explicit aria-label override", () => {
    const { getByRole } = render(
      <ProgressBar value={1} max={2} aria-label="Custom" />,
    );
    expect(getByRole("progressbar").getAttribute("aria-label")).toBe("Custom");
  });

  it("renders the label inside the fill when size='lg' (default inside placement)", () => {
    const { getByText } = render(
      <ProgressBar value={50} label="50%" size="lg" />,
    );
    expect(getByText("50%")).toBeInTheDocument();
  });

  it("renders the label outside the track for non-lg sizes by default", () => {
    const { container, getByText } = render(
      <ProgressBar value={50} label="50%" size="md" />,
    );
    expect(getByText("50%")).toBeInTheDocument();
    // outside label sits in a sibling div, not inside the fill bar.
    const fill = container.querySelector('[role="progressbar"] > div')!;
    expect(fill.textContent).toBe("");
  });

  it("respects an explicit labelPlacement override", () => {
    const { container } = render(
      <ProgressBar value={50} label="X" size="md" labelPlacement="inside" />,
    );
    const fill = container.querySelector('[role="progressbar"] > div')!;
    expect(fill.textContent).toBe("X");
  });

  it("does not render an outside label while indeterminate", () => {
    const { queryByText } = render(
      <ProgressBar indeterminate label="Should not show" />,
    );
    expect(queryByText("Should not show")).toBeNull();
  });

  it("applies the variant fill class", () => {
    const { container } = render(<ProgressBar value={10} variant="danger" />);
    const fill = container.querySelector('[role="progressbar"] > div')!;
    expect(fill.className).toContain("bg-danger-strong");
  });
});
