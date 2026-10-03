// @vitest-environment jsdom
/**
 * `Atlas.tsx` was 0%-covered — it's a thin page shell over `useRecovery`
 * + `buildAtlasData` + `BodyAtlas`. Mirrors the `useRecovery` mock
 * pattern already used in `Dashboard.test.tsx`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Atlas } from "./Atlas";

vi.mock("../hooks/useRecovery", () => ({
  useRecovery: vi.fn(() => ({
    by: {},
    list: [],
    ready: [],
    avoid: [],
    wellbeingMult: 1,
    injurySites: new Set<never>(),
  })),
}));

// jsdom doesn't implement `scrollIntoView` — `focusMuscleId` mount effect
// (BodyAtlas.tsx, fizruk-hero-recovery-bars.md рішення 4) calls it.
Element.prototype.scrollIntoView = vi.fn();

describe("Atlas page", () => {
  it("renders the hero heading and the BodyAtlas card", () => {
    render(<Atlas />);
    expect(screen.getByText("Атлас мʼязів")).toBeInTheDocument();
    expect(screen.getByText("Стан відновлення")).toBeInTheDocument();
    expect(screen.getByLabelText("Атлас мʼязів")).toBeInTheDocument();
  });

  it("forwards focusMuscleId to BodyAtlas (fizruk-hero-recovery-bars.md рішення 4)", () => {
    render(<Atlas focusMuscleId="chest" />);
    expect(screen.getByRole("button", { name: "Груди" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not reserve the 88px bottom-tabbar clearance — Atlas renders without a bottom nav", () => {
    // `FizrukApp.showBottomNav` excludes "atlas", so the 88px
    // `page-tabbar-pad` clearance meant for that chrome is dead space
    // here. Only the plain safe-area inset should remain.
    const { container } = render(<Atlas />);
    const scrollRoot = container.querySelector(".max-w-4xl");
    expect(scrollRoot).not.toBeNull();
    expect(scrollRoot).not.toHaveClass("page-tabbar-pad");
    expect(scrollRoot).toHaveClass("safe-area-pb");
  });
});
