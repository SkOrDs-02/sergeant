/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SkeletonCard, SkeletonList } from "./SkeletonCard";

afterEach(cleanup);

describe("SkeletonCard", () => {
  it("is aria-hidden and renders a header bar by default", () => {
    const { container } = render(<SkeletonCard />);
    const wrapper = container.querySelector('[aria-hidden="true"]')!;
    expect(wrapper).not.toBeNull();
    // header + 3 default lines
    expect(wrapper.querySelectorAll("div.space-y-2\\.5 > *").length).toBe(3);
  });

  it("omits the header bar when header=false", () => {
    const { container } = render(<SkeletonCard header={false} lines={2} />);
    const wrapper = container.querySelector('[aria-hidden="true"]')!;
    // Only the lines container remains as the sole child.
    expect(wrapper.children.length).toBe(1);
  });

  it("renders the requested number of lines, last one narrower", () => {
    const { container } = render(<SkeletonCard lines={4} />);
    const lineWrapper = container.querySelector("div.space-y-2\\.5")!;
    const lines = lineWrapper.children;
    expect(lines.length).toBe(4);
    expect(lines[3]!.className).toContain("w-3/5");
    expect(lines[0]!.className).toContain("w-full");
  });

  it("merges a custom className", () => {
    const { container } = render(<SkeletonCard className="my-card" />);
    expect(
      container.querySelector('[aria-hidden="true"]')!.className,
    ).toContain("my-card");
  });
});

describe("SkeletonList", () => {
  it("renders 4 rows with avatars by default", () => {
    const { container } = render(<SkeletonList />);
    const wrapper = container.querySelector('[aria-hidden="true"]')!;
    expect(wrapper.children.length).toBe(4);
    const firstRow = wrapper.children[0]!;
    expect(firstRow.children.length).toBe(2); // avatar + text stack
  });

  it("omits the avatar circle when avatar=false", () => {
    const { container } = render(<SkeletonList count={2} avatar={false} />);
    const wrapper = container.querySelector('[aria-hidden="true"]')!;
    const firstRow = wrapper.children[0]!;
    expect(firstRow.children.length).toBe(1); // only the text stack
  });

  it("renders a custom row count", () => {
    const { container } = render(<SkeletonList count={7} />);
    const wrapper = container.querySelector('[aria-hidden="true"]')!;
    expect(wrapper.children.length).toBe(7);
  });
});
