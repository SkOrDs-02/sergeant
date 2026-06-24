/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProgressCircle } from "./ProgressCircle";

afterEach(cleanup);

describe("ProgressCircle — determinate", () => {
  it("exposes progressbar role with value attributes", () => {
    render(<ProgressCircle value={40} max={100} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
  });

  it("renders a default percent label", () => {
    render(<ProgressCircle value={75} max={100} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("computes a count-style aria-label when max is not 100", () => {
    render(<ProgressCircle value={3} max={5} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-label")).toBe("3 з 5");
  });

  it("clamps value above max and reflects it in aria-valuenow", () => {
    render(<ProgressCircle value={150} max={100} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100",
    );
  });

  it("clamps negative value to 0", () => {
    render(<ProgressCircle value={-20} max={100} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0",
    );
  });

  it("hideLabel suppresses the visible percent text", () => {
    render(<ProgressCircle value={50} hideLabel />);
    expect(screen.queryByText("50%")).toBeNull();
  });

  it("renders a custom label node when provided", () => {
    render(<ProgressCircle value={50} label="½" />);
    expect(screen.getByText("½")).toBeInTheDocument();
  });

  it("guards against max <= 0 (treats as 1)", () => {
    render(<ProgressCircle value={1} max={0} />);
    const bar = screen.getByRole("progressbar");
    // safeMax becomes 1 → value clamps to 1 → 100%.
    expect(bar.getAttribute("aria-valuemax")).toBe("1");
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});

describe("ProgressCircle — indeterminate", () => {
  it("drops value attributes and marks aria-busy", () => {
    render(<ProgressCircle indeterminate />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-busy")).toBe("true");
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(bar.getAttribute("aria-valuemax")).toBeNull();
    expect(bar.getAttribute("aria-label")).toBe("Завантаження…");
  });

  it("does not render a visible label in indeterminate mode", () => {
    const { container } = render(<ProgressCircle indeterminate value={50} />);
    expect(container.textContent).toBe("");
  });
});

describe("ProgressCircle — variants & sizing", () => {
  it("applies the variant strong-companion text token", () => {
    render(<ProgressCircle value={10} variant="danger" />);
    expect(screen.getByRole("progressbar").className).toContain(
      "text-danger-strong",
    );
  });

  it("respects an explicit aria-label override", () => {
    render(<ProgressCircle value={50} aria-label="Завантаження профілю" />);
    expect(
      screen.getByRole("progressbar", { name: "Завантаження профілю" }),
    ).toBeInTheDocument();
  });

  it("sizes the container from the size tier", () => {
    render(<ProgressCircle value={50} size="lg" />);
    const bar = screen.getByRole("progressbar") as HTMLElement;
    expect(bar.style.width).toBe("96px");
    expect(bar.style.height).toBe("96px");
  });
});
