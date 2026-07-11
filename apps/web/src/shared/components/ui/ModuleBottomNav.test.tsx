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

  it("renders as a bottom-nav-shell — inset, rounded, framed", () => {
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

    expect(nav.className).toContain("bottom-nav-shell");
    expect(nav.className).toContain("bg-panel");
    expect(nav.className).toContain("border");
    expect(statsTab.className).toContain("justify-end");
    expect(statsTab.className).toContain("pb-1.5");
  });

  it("active tab gets a solid accent fill + ink foreground in both themes (fix spec v2 § 1)", () => {
    render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={vi.fn()}
        module="finyk"
        ariaLabel="Module sections"
      />,
    );

    const activeTab = screen.getByRole("button", { name: "Overview" });
    const inactiveTab = screen.getByRole("button", { name: "Stats" });

    // Light: strong-tier solid fill. Dark: luminescent tier-400 solid
    // fill. `text-bg` is theme-aware (cream in light, ink in dark), so
    // one bare class covers the foreground in both themes.
    expect(activeTab.className).toContain("bg-finyk-strong");
    expect(activeTab.className).toContain("dark:bg-brand-400");
    expect(activeTab.className).toContain("text-bg");
    expect(activeTab.className).toContain("border-transparent");
    expect(inactiveTab.className).not.toContain("dark:bg-brand-400");
  });
});
