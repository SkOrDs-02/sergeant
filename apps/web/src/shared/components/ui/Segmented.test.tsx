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

  it("style='solid' + variant='fizruk' paints the active tab with fizruk-solid palette", () => {
    const { getAllByRole } = render(
      <Segmented
        items={ITEMS}
        value="day"
        onChange={() => {}}
        style="solid"
        variant="fizruk"
      />,
    );
    const active = getAllByRole("tab")[0];
    // `bg-fizruk-strong` (= teal-700) clears 5.47:1 against text-white.
    // The previous `bg-fizruk` (= teal-500) only cleared ~2.5:1.
    expect(active!.className!).toContain("bg-fizruk-strong");
    expect(active!.className!).toContain("text-white");
  });

  it("style='soft' (default) + variant='routine' paints the active tab with routine-soft palette", () => {
    const { getAllByRole } = render(
      <Segmented
        items={ITEMS}
        value="day"
        onChange={() => {}}
        variant="routine"
      />,
    );
    const active = getAllByRole("tab")[0];
    expect(active!.className!).toContain("bg-routine-surface");
    expect(active!.className!).toContain("text-routine-strong");
  });
});
