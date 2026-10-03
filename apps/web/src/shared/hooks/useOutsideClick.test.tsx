// @vitest-environment jsdom
/**
 * Юніт-тести useOutsideClick: контракт «зовні/всередині», опції events /
 * capture / enabled / closeOnNullRef і стабільність слухачів при inline
 * колбеках. Компонентні контракти окремих сайтів (Popover, DropdownMenu…)
 * лишаються в їхніх власних тестах — тут перевіряється сам хук.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import {
  useOutsideClick,
  type UseOutsideClickOptions,
} from "./useOutsideClick";

function Harness({
  onOutside,
  options,
  withSecondRef = false,
  attachRefs = true,
}: {
  onOutside: (e: Event) => void;
  options?: UseOutsideClickOptions;
  withSecondRef?: boolean;
  attachRefs?: boolean;
}) {
  const firstRef = useRef<HTMLDivElement | null>(null);
  const secondRef = useRef<HTMLDivElement | null>(null);
  useOutsideClick(
    withSecondRef ? [firstRef, secondRef] : firstRef,
    onOutside,
    options,
  );
  return (
    <div>
      <div ref={attachRefs ? firstRef : undefined} data-testid="first">
        first
      </div>
      {withSecondRef ? (
        <div ref={attachRefs ? secondRef : undefined} data-testid="second">
          second
        </div>
      ) : null}
      <div data-testid="outside">outside</div>
    </div>
  );
}

describe("useOutsideClick", () => {
  it("calls onOutside on mousedown outside the ref", () => {
    const onOutside = vi.fn();
    render(<Harness onOutside={onOutside} />);
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it("does not call onOutside on mousedown inside any of the refs", () => {
    const onOutside = vi.fn();
    render(<Harness onOutside={onOutside} withSecondRef />);
    fireEvent.mouseDown(screen.getByTestId("first"));
    fireEvent.mouseDown(screen.getByTestId("second"));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it("is inert when enabled=false", () => {
    const onOutside = vi.fn();
    render(<Harness onOutside={onOutside} options={{ enabled: false }} />);
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it("ignores the default mousedown when a custom events list is given", () => {
    const onOutside = vi.fn();
    render(
      <Harness onOutside={onOutside} options={{ events: ["pointerdown"] }} />,
    );
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onOutside).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it("supports multiple events (mousedown + touchstart)", () => {
    const onOutside = vi.fn();
    render(
      <Harness
        onOutside={onOutside}
        options={{ events: ["mousedown", "touchstart"] }}
      />,
    );
    fireEvent.touchStart(screen.getByTestId("outside"));
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onOutside).toHaveBeenCalledTimes(2);
  });

  it("closeOnNullRef=true (default): fires when no ref is attached", () => {
    const onOutside = vi.fn();
    render(<Harness onOutside={onOutside} attachRefs={false} />);
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it("closeOnNullRef=false: bails out when no ref is attached", () => {
    const onOutside = vi.fn();
    render(
      <Harness
        onOutside={onOutside}
        attachRefs={false}
        options={{ closeOnNullRef: false }}
      />,
    );
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it("does not re-bind listeners on re-render with inline callback and array", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const onOutside = vi.fn();
    const { rerender } = render(<Harness onOutside={onOutside} />);
    const bindsAfterMount = addSpy.mock.calls.filter(
      ([name]) => name === "mousedown",
    ).length;
    rerender(<Harness onOutside={onOutside} />);
    const bindsAfterRerender = addSpy.mock.calls.filter(
      ([name]) => name === "mousedown",
    ).length;
    expect(bindsAfterRerender).toBe(bindsAfterMount);
    addSpy.mockRestore();
  });

  it("latest onOutside callback is used without re-binding", () => {
    const firstCb = vi.fn();
    const secondCb = vi.fn();
    const { rerender } = render(<Harness onOutside={firstCb} />);
    rerender(<Harness onOutside={secondCb} />);
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(firstCb).not.toHaveBeenCalled();
    expect(secondCb).toHaveBeenCalledTimes(1);
  });

  it("removes listeners on unmount", () => {
    const onOutside = vi.fn();
    const { unmount } = render(<Harness onOutside={onOutside} />);
    unmount();
    fireEvent.mouseDown(document.body);
    expect(onOutside).not.toHaveBeenCalled();
  });
});
