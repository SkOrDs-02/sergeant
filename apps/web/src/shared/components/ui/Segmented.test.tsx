/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { Segmented } from "./Segmented";

afterEach(cleanup);

const ITEMS = [
  { value: "day", label: "День" },
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
] as const;

/**
 * Contract tests for the DS Segmented primitive. Locks role=tablist,
 * aria-selected wiring, onChange dispatch, and the variant × style
 * matrix for the active chip.
 */
describe("Segmented", () => {
  it("renders role='tablist' with a role='tab' per item", () => {
    const { getByRole, getAllByRole } = render(
      <Segmented items={ITEMS} value="day" onChange={() => {}} />,
    );
    expect(getByRole("tablist")).not.toBeNull();
    expect(getAllByRole("tab")).toHaveLength(ITEMS.length);
  });

  it("marks only the active item with aria-selected='true'", () => {
    const { getAllByRole } = render(
      <Segmented items={ITEMS} value="week" onChange={() => {}} />,
    );
    const tabs = getAllByRole("tab");
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("false");
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(tabs[2]!.getAttribute("aria-selected")).toBe("false");
  });

  it("invokes onChange with the clicked item's value", () => {
    const onChange = vi.fn();
    const { getAllByRole } = render(
      <Segmented items={ITEMS} value="day" onChange={onChange} />,
    );
    fireEvent.click(getAllByRole("tab")[2]!);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("month");
  });

  it("supports roving tabindex: only the active tab is a tab stop", () => {
    const { getAllByRole } = render(
      <Segmented items={ITEMS} value="week" onChange={() => {}} />,
    );
    const tabs = getAllByRole("tab");
    expect(tabs[0]!.tabIndex).toBe(-1);
    expect(tabs[1]!.tabIndex).toBe(0);
    expect(tabs[2]!.tabIndex).toBe(-1);
  });

  it("ArrowRight moves focus + selection to the next tab, wrapping at the end", () => {
    const onChange = vi.fn();
    const { getAllByRole } = render(
      <Segmented items={ITEMS} value="month" onChange={onChange} />,
    );
    const tabs = getAllByRole("tab");
    tabs[2]!.focus();
    fireEvent.keyDown(tabs[2]!, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("day");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("Home/End jump to the first/last tab", () => {
    const onChange = vi.fn();
    const { getAllByRole } = render(
      <Segmented items={ITEMS} value="week" onChange={onChange} />,
    );
    const tabs = getAllByRole("tab");
    tabs[1]!.focus();
    fireEvent.keyDown(tabs[1]!, { key: "End" });
    expect(onChange).toHaveBeenCalledWith("month");
    expect(document.activeElement).toBe(tabs[2]);

    fireEvent.keyDown(tabs[2]!, { key: "Home" });
    expect(onChange).toHaveBeenCalledWith("day");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("мова H: доріжка track, активний сегмент segment із тінню, без hue модуля", () => {
    const { getByRole, getAllByRole } = render(
      <Segmented
        items={ITEMS}
        value="week"
        variant="routine"
        onChange={() => {}}
      />,
    );
    const track = getByRole("tablist").className;
    expect(track).toContain("bg-track");
    expect(track).toContain("rounded-[10px]");
    const [inactive, active] = getAllByRole("tab");
    expect(active!.className).toContain("bg-segment");
    expect(active!.className).toContain("shadow-segment");
    expect(active!.className).toContain("rounded-lg");
    expect(active!.className).not.toMatch(/routine|border/);
    expect(inactive!.className).toContain("text-muted");
  });

  it("layout='bar' розтягує доріжку й ділить сегменти порівну", () => {
    const { getByRole, getAllByRole } = render(
      <Segmented items={ITEMS} value="day" layout="bar" onChange={() => {}} />,
    );
    expect(getByRole("tablist").className).toContain("w-full");
    for (const tab of getAllByRole("tab")) {
      expect(tab.className).toContain("flex-1");
    }
  });
});
