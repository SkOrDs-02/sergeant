// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useVirtualizer } = vi.hoisted(() => ({
  useVirtualizer: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: unknown) => useVirtualizer(options),
}));

import { VirtualList } from "./VirtualList";

describe("VirtualList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders virtual rows with internal scrolling and fixed height", () => {
    useVirtualizer.mockReturnValue({
      getVirtualItems: () => [
        { index: 0, key: "row-a", start: 0 },
        { index: 2, key: "row-c", start: 88 },
      ],
      getTotalSize: () => 132,
      measureElement: vi.fn(),
    });

    const { container } = render(
      <VirtualList
        items={["alpha", "bravo", "charlie"]}
        estimateSize={44}
        height={220}
        className="custom-list"
      >
        {(item, index) => (
          <span>
            {index}:{item}
          </span>
        )}
      </VirtualList>,
    );

    const scroller = container.firstElementChild as HTMLElement;
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.className).toContain("custom-list");
    expect(scroller.style.height).toBe("220px");
    expect(screen.getByText("0:alpha")).toBeInTheDocument();
    expect(screen.getByText("2:charlie")).toBeInTheDocument();
    expect(container.querySelector('[data-index="2"]')).toHaveStyle({
      transform: "translateY(88px)",
    });
  });

  it("passes optional virtualizer settings and uses an external scroll parent", () => {
    const externalScroller = document.createElement("div");
    const measureElement = vi.fn();
    useVirtualizer.mockReturnValue({
      getVirtualItems: () => [
        { index: 0, key: "custom-a", start: 0 },
        { index: 99, key: "missing", start: 50 },
      ],
      getTotalSize: () => 100,
      measureElement,
    });

    const getItemKey = vi.fn((_index: number, item: { id: string }) => item.id);
    const estimateSize = vi.fn((index: number) => 30 + index);
    const { container } = render(
      <VirtualList
        items={[{ id: "a", label: "Alpha" }]}
        estimateSize={estimateSize}
        scrollElement={externalScroller}
        overscan={3}
        getItemKey={getItemKey}
        style={{ paddingTop: 4 }}
      >
        {(item) => <span>{item.label}</span>}
      </VirtualList>,
    );

    const options = useVirtualizer.mock.calls[0]?.[0] as {
      count: number;
      getScrollElement: () => HTMLElement | null;
      estimateSize: (index: number) => number;
      overscan: number;
      getItemKey: (index: number) => string | number;
    };
    expect(options.count).toBe(1);
    expect(options.getScrollElement()).toBe(externalScroller);
    expect(options.estimateSize(2)).toBe(32);
    expect(options.overscan).toBe(3);
    expect(options.getItemKey(0)).toBe("a");
    expect(options.getItemKey(99)).toBe(99);

    const scroller = container.firstElementChild as HTMLElement;
    expect(scroller.style.height).toBe("");
    expect(scroller.style.paddingTop).toBe("4px");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(container.querySelector('[data-index="99"]')).toBeNull();
  });
});
