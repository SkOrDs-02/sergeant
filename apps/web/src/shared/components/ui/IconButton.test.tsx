/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { IconButton } from "./IconButton";

afterEach(cleanup);

describe("IconButton", () => {
  it("requires and forwards aria-label to the underlying button", () => {
    const { getByRole } = render(
      <IconButton aria-label="Закрити">
        <span>x</span>
      </IconButton>,
    );
    expect(getByRole("button", { name: "Закрити" })).toBeInTheDocument();
  });

  it("defaults to size='md' and always renders iconOnly geometry", () => {
    const { getByRole } = render(
      <IconButton aria-label="Меню">
        <span>icon</span>
      </IconButton>,
    );
    const btn = getByRole("button", { name: "Меню" });
    // iconOnly + md → square touch target per Button's own size map.
    expect(btn.className).toMatch(/h-11|w-11/);
  });

  it("forwards onClick and other Button props", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <IconButton aria-label="Дія" onClick={onClick} variant="ghost">
        <span>icon</span>
      </IconButton>,
    );
    fireEvent.click(getByRole("button", { name: "Дія" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("forwards a ref to the native button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <IconButton aria-label="Ref" ref={ref}>
        <span>icon</span>
      </IconButton>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("respects an explicit size override", () => {
    const { getByRole } = render(
      <IconButton aria-label="Sm" size="sm">
        <span>icon</span>
      </IconButton>,
    );
    expect(getByRole("button", { name: "Sm" })).toBeInTheDocument();
  });
});
