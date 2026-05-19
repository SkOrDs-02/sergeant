/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ModuleBottomNav } from "./ModuleBottomNav";

const items = [
  {
    id: "overview",
    label: "Overview",
    icon: <span aria-hidden>O</span>,
  },
  {
    id: "stats",
    label: "Stats",
    icon: <span aria-hidden>S</span>,
  },
] as const;

describe("ModuleBottomNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the PWA nav edge-to-edge with bottom-aligned controls", () => {
    render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={vi.fn()}
        module="finyk"
        ariaLabel="Module sections"
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Module sections" });
    const statsTab = screen.getByRole("button", { name: "Stats" });

    expect(nav.className).toContain("safe-area-pb");
    expect(nav.className).not.toContain("mx-3");
    expect(nav.className).not.toContain("mb-3");
    expect(nav.className).not.toContain("rounded");
    expect(nav.className).not.toContain("shadow-nav");
    expect(statsTab.className).toContain("justify-end");
    expect(statsTab.className).toContain("pb-1.5");
  });
});
