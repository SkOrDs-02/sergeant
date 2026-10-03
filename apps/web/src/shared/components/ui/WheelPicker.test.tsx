// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WheelPicker } from "./WheelPicker";

const VALUES = [0, 25, 50, 75, 100, 125, 150];

// jsdom lacks matchMedia; WheelPicker reads it via useReducedMotion.
beforeEach(() => {
  // Колесо комітить через `setTimeout` (settle 120 мс) і звільняє гард
  // через страхувальний таймер — обидва треба проганяти вручну.
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WheelPicker", () => {
  it("exposes spinbutton semantics with current value", () => {
    render(
      <WheelPicker
        values={VALUES}
        value={50}
        onChange={() => {}}
        aria-label="Порція"
      />,
    );
    const spin = screen.getByRole("spinbutton", { name: "Порція" });
    expect(spin).toHaveAttribute("aria-valuenow", "50");
    expect(spin).toHaveAttribute("aria-valuemin", "0");
    expect(spin).toHaveAttribute("aria-valuemax", "150");
  });

  it("ArrowUp selects the next-larger value", () => {
    const onChange = vi.fn();
    render(
      <WheelPicker
        values={VALUES}
        value={50}
        onChange={onChange}
        aria-label="v"
      />,
    );
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it("ArrowDown selects the next-smaller value", () => {
    const onChange = vi.fn();
    render(
      <WheelPicker
        values={VALUES}
        value={50}
        onChange={onChange}
        aria-label="v"
      />,
    );
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith(25);
  });

  it("clamps at the bounds", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WheelPicker
        values={VALUES}
        value={0}
        onChange={onChange}
        aria-label="v"
      />,
    );
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowDown" });
    expect(onChange).not.toHaveBeenCalled(); // already at min

    rerender(
      <WheelPicker
        values={VALUES}
        value={150}
        onChange={onChange}
        aria-label="v"
      />,
    );
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowUp" });
    expect(onChange).not.toHaveBeenCalled(); // already at max
  });

  it("Home/End jump to first/last", () => {
    const onChange = vi.fn();
    render(
      <WheelPicker
        values={VALUES}
        value={50}
        onChange={onChange}
        aria-label="v"
      />,
    );
    const spin = screen.getByRole("spinbutton");
    fireEvent.keyDown(spin, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(150);
    fireEvent.keyDown(spin, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("PageUp/PageDown move by 5 steps (clamped)", () => {
    const onChange = vi.fn();
    render(
      <WheelPicker
        values={VALUES}
        value={50}
        onChange={onChange}
        aria-label="v"
      />,
    );
    const spin = screen.getByRole("spinbutton");
    fireEvent.keyDown(spin, { key: "PageUp" }); // index 2 + 5 = 7 → clamp 6 → 150
    expect(onChange).toHaveBeenLastCalledWith(150);
    fireEvent.keyDown(spin, { key: "PageDown" }); // index 2 - 5 → clamp 0 → 0
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  /**
   * `scrollTo` у jsdom немає, і саме він нам потрібен як заглушка: тоді
   * `scrollTop` не рухається сам, і тест керує позицією вручну — рівно як
   * це робить браузер зі snap-фізикою.
   */
  function withStubbedScrollTo(body: () => void) {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollTo",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    try {
      body();
    } finally {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", descriptor);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
      }
    }
  }

  it("does not commit intermediate rows while its own smooth sync is running", () => {
    withStubbedScrollTo(() => {
      const onChange = vi.fn();
      const { rerender } = render(
        <WheelPicker
          values={VALUES}
          value={50}
          onChange={onChange}
          aria-label="v"
        />,
      );
      // Друге позиціювання вже анімоване (перше, на монтуванні, миттєве),
      // тож саме тут гард має роботу: `scrollTo({behavior:"smooth"})`
      // сипле тими самими подіями, що й флік пальцем.
      rerender(
        <WheelPicker
          values={VALUES}
          value={125}
          onChange={onChange}
          aria-label="v"
        />,
      );

      const spin = screen.getByRole("spinbutton");
      spin.scrollTop = 120; // проміжний рядок по дорозі до цілі
      fireEvent.scroll(spin);

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it("releases its sync guard when snap settles off the exact pixel", () => {
    // Регресія: гард звільнявся лише при збігу в ±1 px. Контейнер має
    // `snap-y snap-mandatory`, тобто фінальну позицію обирає браузер, і
    // при дробовій висоті рядка (зум, DPR) вона законно розходиться з
    // ціллю більше ніж на піксель. Тоді гард не звільнявся НІКОЛИ:
    // `onScroll` вічно виходив раннім `return`, колесо переставало
    // комітити, а наступний ререндер тягнув його на старий індекс —
    // симптом власника «колесо кілька разів стрибає туди-сюди».
    withStubbedScrollTo(() => {
      const onChange = vi.fn();
      const { rerender } = render(
        <WheelPicker
          values={VALUES}
          value={50}
          onChange={onChange}
          aria-label="v"
        />,
      );
      rerender(
        <WheelPicker
          values={VALUES}
          value={125}
          onChange={onChange}
          aria-label="v"
        />,
      );

      const spin = screen.getByRole("spinbutton");
      // Ціль — 5 × 40 = 200 px. Snap став на 203: індекс той самий,
      // піксель інший.
      spin.scrollTop = 203;
      fireEvent.scroll(spin);

      // Колесо знову живе: звичайний скрол людини комітить.
      spin.scrollTop = 80;
      fireEvent.scroll(spin);
      vi.advanceTimersByTime(200);
      expect(onChange).toHaveBeenCalledWith(50);
    });
  });

  it("releases its sync guard on a timer when the target row is never reached", () => {
    // Друга половина тієї ж страховки: якщо подія «доїхали» не настане
    // взагалі (перерваний скрол, прихована вкладка), колесо однаково має
    // ожити, а не лишитись мертвим до перемонтування.
    withStubbedScrollTo(() => {
      const onChange = vi.fn();
      const { rerender } = render(
        <WheelPicker
          values={VALUES}
          value={50}
          onChange={onChange}
          aria-label="v"
        />,
      );
      rerender(
        <WheelPicker
          values={VALUES}
          value={125}
          onChange={onChange}
          aria-label="v"
        />,
      );

      vi.advanceTimersByTime(700);

      const spin = screen.getByRole("spinbutton");
      spin.scrollTop = 80;
      fireEvent.scroll(spin);
      vi.advanceTimersByTime(200);
      expect(onChange).toHaveBeenCalledWith(50);
    });
  });

  it("highlights the nearest value when value is not an exact member", () => {
    render(
      <WheelPicker
        values={VALUES}
        value={60}
        onChange={() => {}}
        aria-label="v"
      />,
    );
    // nearest to 60 is 50 (dist 10) vs 75 (dist 15)
    expect(screen.getByRole("spinbutton")).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });

  it("does not respond to keys when disabled", () => {
    const onChange = vi.fn();
    render(
      <WheelPicker
        values={VALUES}
        value={50}
        onChange={onChange}
        disabled
        aria-label="v"
      />,
    );
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowUp" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies formatValue and unit to aria-valuetext", () => {
    render(
      <WheelPicker
        values={VALUES}
        value={50}
        onChange={() => {}}
        formatValue={(v) => `${v}g`}
        aria-label="v"
      />,
    );
    expect(screen.getByRole("spinbutton")).toHaveAttribute(
      "aria-valuetext",
      "50g",
    );
  });
});
