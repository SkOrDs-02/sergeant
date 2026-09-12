/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  resetVisualKeyboardInsetAdapter,
  setVisualKeyboardInsetAdapter,
} from "@sergeant/shared";
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
    resetVisualKeyboardInsetAdapter();
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
    expect(statsTab.className).toContain("justify-center");
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
    expect(activeTab.firstElementChild?.className).toContain("bg-finyk-strong");
    expect(activeTab.firstElementChild?.className).toContain(
      "dark:bg-brand-400",
    );
    expect(activeTab.className).toContain("text-bg");
    expect(activeTab.className).toContain("border-transparent");
    expect(inactiveTab.firstElementChild?.className).not.toContain(
      "dark:bg-brand-400",
    );
  });

  it("shows the label only for the active item, matching Hub navigation", () => {
    render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={vi.fn()}
        module="finyk"
        ariaLabel="Module sections"
      />,
    );

    const activeVisualLabel = screen.getByText("Overview", {
      selector: "span:not(.sr-only)",
    });
    const inactiveVisualLabel = screen.getByText("Stats", {
      selector: "span:not(.sr-only)",
    });
    expect(activeVisualLabel.className).toContain("max-w-full");
    expect(inactiveVisualLabel.className).toContain("max-w-0");
  });

  // Founder-аудит R1 (2026-09-11): grid-колонки вже рівні
  // (`repeat(N, minmax(0,1fr))`), але видима "пілюля" — внутрішній
  // `<span>` — мала різну ширину для активного (`w-full`) і неактивного
  // (`px-2`, ≈38px) стану. Через це зазор МІЖ ПІЛЮЛЯМИ стрибав залежно
  // від того, який таб активний (≈90.7px між двома неактивними проти
  // ≈47.3px між активною і сусідньою на 390px/3-табовому наві — Рутина).
  // Єдиний спосіб тримати зазор постійним — дати пілюлі ОДНАКОВИЙ бокс
  // в обох станах, тож і в тесті ми звіряємо саме бокс, а не колір.
  it("gives the active and inactive pill the identical box, so the gap between pills can't shift with the active tab (R1 fix, 2026-09-11)", () => {
    render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={vi.fn()}
        module="finyk"
        ariaLabel="Module sections"
      />,
    );

    const activePill = screen.getByRole("button", { name: "Overview" })
      .firstElementChild as HTMLElement;
    const inactivePill = screen.getByRole("button", { name: "Stats" })
      .firstElementChild as HTMLElement;

    // Regression guard: both pills must claim the FULL column box —
    // `w-full`/`h-full` — regardless of active state. Before the fix the
    // inactive pill was `px-2` sized to content instead, which is exactly
    // the class this assertion would catch (verified by reverting the
    // inactive branch back to `px-2` locally: this assertion goes red).
    expect(activePill.className).toContain("w-full");
    expect(activePill.className).toContain("h-full");
    expect(inactivePill.className).toContain("w-full");
    expect(inactivePill.className).toContain("h-full");
  });

  // Стеля вище — реальна межа, тож підпис, який у неї не вліз, мусить
  // обриватись трьома крапками, а не посеред слова: саме так виглядав
  // «Прогрес і замір» у Фізруку (QA-аудит 2026-08-04 «кліп лейбла без
  // ellipsis»). Сам той підпис уже вкорочено, але запобіжник лишається.
  it("truncates an over-long label with an ellipsis instead of cutting mid-word", () => {
    render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={vi.fn()}
        module="finyk"
        ariaLabel="Module sections"
      />,
    );

    const activeVisualLabel = screen.getByText("Overview", {
      selector: "span:not(.sr-only)",
    });
    expect(activeVisualLabel.className).toContain("text-ellipsis");
    expect(activeVisualLabel.className).toContain("overflow-hidden");
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

  it("supports Arrow, Home and End navigation for tablists", () => {
    const onChange = vi.fn();
    render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={onChange}
        module="routine"
        role="tablist"
        ariaLabel="Module tabs"
      />,
    );

    const overview = screen.getByRole("tab", { name: "Overview" });
    const stats = screen.getByRole("tab", { name: "Stats" });

    overview.focus();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(stats).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("stats");

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Home" });
    expect(overview).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("overview");

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(stats).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("stats");
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

  it("slides out of view and drops out of the tab order while the keyboard is open (spec § design decision 2)", () => {
    setVisualKeyboardInsetAdapter((active) => (active ? 320 : 0));
    render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={vi.fn()}
        module="finyk"
        ariaLabel="Module sections"
      />,
    );

    // `aria-hidden` removes the whole subtree from the accessibility
    // tree — the standard `getByRole` queries can no longer see it, so
    // this is itself proof the hide worked. `{ hidden: true }` opts
    // back in to assert on the underlying DOM state; the accessible
    // *name* also zeroes out on an aria-hidden element (dom-accessibility-api
    // follows the element's own hidden state even with `hidden: true`),
    // so this query drops the `name` filter — there's only one `<nav>`.
    const nav = screen.getByRole("navigation", { hidden: true });
    expect(nav).toHaveAttribute("aria-label", "Module sections");
    expect(nav).toHaveAttribute("aria-hidden", "true");
    expect(nav.className).toContain("translate-y-full");
    expect(nav.className).toContain("pointer-events-none");
    expect(
      screen.getByRole("button", { name: "Overview", hidden: true }),
    ).toHaveAttribute("tabindex", "-1");
    expect(
      screen.getByRole("button", { name: "Stats", hidden: true }),
    ).toHaveAttribute("tabindex", "-1");
  });

  it("stays visible and reachable when the keyboard is closed", () => {
    setVisualKeyboardInsetAdapter(() => 0);
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
    expect(nav).not.toHaveAttribute("aria-hidden");
    expect(nav.className).not.toContain("translate-y-full");
  });
});

// Regression: founder report 2026-07-31 — «в модулях іноді не спрацьовують
// кнопки в навбарі: клікаються, але не перемикається сторінка». react-router
// v7 navigates inside `React.startTransition`, which deliberately keeps the
// current screen mounted instead of revealing a new Suspense fallback — so a
// tab whose lazy chunk is still cold produced zero feedback for the whole
// download. The nav now paints the tap immediately and warms the chunk on
// pointer-down.
describe("ModuleBottomNav — tap feedback while the route is still committing", () => {
  afterEach(() => {
    cleanup();
    resetVisualKeyboardInsetAdapter();
  });

  it("highlights the tapped tab before the host commits activeId", () => {
    render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={vi.fn()}
        module="finyk"
        ariaLabel="Module sections"
      />,
    );

    const stats = screen.getByRole("button", { name: "Stats" });
    expect(stats).not.toHaveAttribute("aria-current", "page");

    // `activeId` intentionally stays "overview" — the host has not committed.
    fireEvent.click(stats);

    expect(stats).toHaveAttribute("aria-current", "page");
    expect(stats).toHaveAttribute("data-pending", "true");
    expect(
      screen.getByRole("button", { name: "Overview" }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  it("drops the optimistic highlight once the route commits", () => {
    const { rerender } = render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={vi.fn()}
        module="finyk"
        ariaLabel="Module sections"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    rerender(
      <ModuleBottomNav
        items={items}
        activeId="stats"
        onChange={vi.fn()}
        module="finyk"
        ariaLabel="Module sections"
      />,
    );

    const stats = screen.getByRole("button", { name: "Stats" });
    expect(stats).toHaveAttribute("aria-current", "page");
    expect(stats).not.toHaveAttribute("data-pending");
  });

  it("does not mark the already-active tab as pending", () => {
    render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={vi.fn()}
        module="finyk"
        ariaLabel="Module sections"
      />,
    );

    const overview = screen.getByRole("button", { name: "Overview" });
    fireEvent.click(overview);
    expect(overview).not.toHaveAttribute("data-pending");
  });

  it("warms the target page on pointer-down, ahead of the click", () => {
    const onPrefetch = vi.fn();
    const onChange = vi.fn();
    render(
      <ModuleBottomNav
        items={items}
        activeId="overview"
        onChange={onChange}
        onPrefetch={onPrefetch}
        module="finyk"
        ariaLabel="Module sections"
      />,
    );

    const stats = screen.getByRole("button", { name: "Stats" });
    fireEvent.pointerDown(stats);
    expect(onPrefetch).toHaveBeenCalledWith("stats");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(stats);
    expect(onChange).toHaveBeenCalledWith("stats");
  });
});
