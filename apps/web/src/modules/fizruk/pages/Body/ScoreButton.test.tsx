// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ScoreButton, SelectedLevelLabel, ENERGY_LABELS } from "./ScoreButton";

describe("ScoreButton", () => {
  afterEach(cleanup);

  it("renders value and label with selected styling", () => {
    render(
      <ScoreButton
        value={3}
        selected={true}
        onClick={vi.fn()}
        label="Нормально"
        tabbable={true}
      />,
    );

    const btn = screen.getByRole("radio", { name: "Нормально" });
    expect(btn).toHaveAttribute("aria-checked", "true");
    expect(btn).toHaveAttribute("tabIndex", "0");
    expect(btn).toHaveTextContent("3");
  });

  it("calls onClick with value and skips tab stop when not tabbable", () => {
    const onClick = vi.fn();
    render(
      <ScoreButton
        value={5}
        selected={false}
        onClick={onClick}
        label="Відмінно"
        tabbable={false}
      />,
    );

    const btn = screen.getByRole("radio", { name: "Відмінно" });
    expect(btn).toHaveAttribute("tabIndex", "-1");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledWith(5);
  });
});

describe("SelectedLevelLabel — live region (defect #4)", () => {
  afterEach(cleanup);

  // The region used to mount ONLY once a value existed (`return null`
  // beforehand) — so the very first selection appeared together with its
  // own live region, and `aria-live` only announces MUTATIONS of an
  // already-present node, not text that arrives with the node itself. The
  // fix keeps the `<p>` mounted from the start.
  it("keeps the aria-live region mounted even before any value is selected", () => {
    const { container } = render(
      <SelectedLevelLabel
        shortLabel="Енергія"
        value={null}
        labels={ENERGY_LABELS}
      />,
    );
    const region = container.querySelector('p[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region?.textContent?.trim()).toBe("");
  });

  it("fills the already-mounted region once a value is selected", () => {
    const { rerender } = render(
      <SelectedLevelLabel
        shortLabel="Енергія"
        value={null}
        labels={ENERGY_LABELS}
      />,
    );
    rerender(
      <SelectedLevelLabel
        shortLabel="Енергія"
        value={4}
        labels={ENERGY_LABELS}
      />,
    );
    expect(screen.getByText("Енергія: Добре")).toBeInTheDocument();
  });
});
