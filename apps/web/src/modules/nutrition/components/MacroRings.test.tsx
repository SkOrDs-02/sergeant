// @vitest-environment jsdom
/**
 * Last validated: 2026-08-07
 * Status: Active
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MacroRings } from "./MacroRings";

const MACROS = [
  {
    label: "Білки",
    consumed: 82,
    goal: 150,
    variant: "nutrition" as const,
    outcome: "68 г до цілі",
  },
];

describe("MacroRings", () => {
  it("onHero paints the ring arc with the -on-hero chart tier", () => {
    const { container } = render(
      <MacroRings aria-label="Макроси" macros={MACROS} onHero />,
    );
    const arc = container.querySelectorAll("circle")[1];
    expect(arc!.getAttribute("stroke")).toBe(
      "rgb(var(--c-chart-nutrition-on-hero))",
    );
  });

  it("onHero moves the caption stack onto the hero-ink scale", () => {
    render(<MacroRings aria-label="Макроси" macros={MACROS} onHero />);
    expect(screen.getByText("Білки").className).toContain("text-hero-ink");
    expect(screen.getByText("68 г до цілі").className).toContain(
      "text-hero-ink/75",
    );
    expect(screen.getByText("82").className).toContain("text-hero-ink");
  });

  it("off a hero it keeps the body-surface tokens", () => {
    render(<MacroRings aria-label="Макроси" macros={MACROS} />);
    expect(screen.getByText("Білки").className).toContain("text-text");
    expect(screen.getByText("68 г до цілі").className).toContain("text-subtle");
  });
});
