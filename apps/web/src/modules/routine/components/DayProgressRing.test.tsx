// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DayProgressRing } from "./DayProgressRing";

describe("DayProgressRing", () => {
  afterEach(cleanup);

  it("shows completed/scheduled ratio and calls onClick", () => {
    const onClick = vi.fn();
    render(<DayProgressRing completed={2} scheduled={5} onClick={onClick} />);

    expect(screen.getByText("2/5")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Прогрес дня: 2 з 5/i,
      }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("handles zero scheduled habits without division errors", () => {
    render(<DayProgressRing completed={0} scheduled={0} />);
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });

  // Просвіт кільця 82px, робочий — 78 (`SIZE − 2×STROKE − 4`). `fitRingFontPx`
  // тримає рядок у цій межі, поки кегль не впреться в підлогу 12px; далі
  // формула вже не рятує, і межу тримає кліпер. Обидві половини гейтяться
  // тут, бо jsdom не робить лейауту — перевіряємо контракт, не пікселі.
  describe("кегль під довжину значення", () => {
    const ringLabel = (completed: number, scheduled: number) => {
      render(<DayProgressRing completed={completed} scheduled={scheduled} />);
      return screen.getByText(`${completed}/${scheduled}`);
    };

    it("коротке значення лишається на стелі ролі — інлайнового кегля немає", () => {
      const el = ringLabel(0, 3);
      expect(el).toHaveClass("text-style-headline-fixed");
      expect(el.style.fontSize).toBe("");
    });

    it("довше значення дістає обчислений кегль, менший за стелю", () => {
      const el = ringLabel(100, 100);
      const px = Number.parseFloat(el.style.fontSize);
      expect(px).toBeGreaterThan(12);
      expect(px).toBeLessThan(26);
    });

    it("шестизначне значення сідає рівно на підлогу 12px", () => {
      expect(ringLabel(123456, 123456).style.fontSize).toBe("12px");
    });

    // Регресія: до цього гейта `<span>` не мав ні межі ширини, ні `overflow`,
    // тож на підлозі рядок налазив на обведення кільця замість обрізатись.
    it("кліпер стоїть на просвіті кільця при будь-якій довжині", () => {
      for (const [c, s] of [
        [0, 3],
        [1000, 1000],
        [123456, 123456],
      ] as const) {
        cleanup();
        const el = ringLabel(c, s);
        expect(el.style.maxWidth).toBe("78px");
        expect(el).toHaveClass("overflow-hidden");
      }
    });

    it("повне значення лишається в доступному імені кнопки навіть при обрізці", () => {
      ringLabel(123456, 123456);
      expect(
        screen.getByRole("button", { name: /Прогрес дня: 123456 з 123456/i }),
      ).toBeInTheDocument();
    });
  });
});
