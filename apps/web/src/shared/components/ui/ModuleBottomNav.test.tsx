/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("calls onChange when a nav item is clicked", () => {
    const onChange = vi.fn();
    render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={onChange}
        module="fizruk"
        ariaLabel="Module sections"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(onChange).toHaveBeenCalledWith("stats");
  });

  it("renders tablist semantics with aria-selected and panel controls", () => {
    const tabItems = items.map((item) => ({
      ...item,
      panelId: `${item.id}-panel`,
    }));
    render(
      <ModuleBottomNav
        items={tabItems}
        activeId="stats"
        onChange={vi.fn()}
        module="routine"
        role="tablist"
        ariaLabel="Module tabs"
      />,
    );

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const activeTab = screen.getByRole("tab", { name: "Stats" });
    expect(activeTab).toHaveAttribute("aria-selected", "true");
    expect(activeTab).toHaveAttribute("aria-controls", "stats-panel");
    expect(activeTab).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("shows the unread badge only on inactive items", () => {
    render(
      <ModuleBottomNav
        items={[
          { ...items[0], badge: true },
          { ...items[1], badge: true },
        ]}
        activeId="overview"
        onChange={vi.fn()}
        module="nutrition"
        ariaLabel="Module sections"
      />,
    );

    const inactiveIcon = screen.getByRole("button", { name: "Stats" })
      .firstElementChild as HTMLElement;
    expect(inactiveIcon.querySelector(".bg-nutrition")).toBeInTheDocument();
    const activeIcon = screen.getByRole("button", { name: "Overview" })
      .firstElementChild as HTMLElement;
    expect(activeIcon.querySelector(".bg-nutrition")).toBeNull();
  });
});
