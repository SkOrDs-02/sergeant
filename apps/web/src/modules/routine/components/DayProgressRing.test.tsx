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

  it("показує тире замість «0/0», коли нічого не заплановано", () => {
    // «0/0» подає порожній день як результат (критика екранів 2026-09-23).
    // Без запланованих звичок кільцю нема що лічити.
    render(<DayProgressRing completed={0} scheduled={0} />);
    expect(screen.queryByText("0/0")).toBeNull();
    expect(screen.getByText("–")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /нічого не заплановано/i }),
    ).toBeInTheDocument();
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

    // Ширина рахується з ФАКТИЧНОГО кегля, який обрав компонент, а не
    // звіряється з другим літералом — інакше це тавтологія, що виглядає як
    // гейт. Метрики гліфів заміряні рендером (Manrope 700, `tabular-nums`) і
    // продубльовані тут навмисно: саме вони роблять перевірку незалежною.
    const DIGIT_EM = 0.6;
    const SLASH_EM = 0.4131;
    const APERTURE_PX = 78;
    const widthAt = (value: string, fontPx: number) =>
      ((value.length - 1) * DIGIT_EM + SLASH_EM) * fontPx;

    // Округлення саме ВНИЗ: `Math.round` давав «1000/1000» 15.0px → 78.2px,
    // тобто за кліпер, хоч значення вище підлоги й мало вміститись формулою.
    // Діапазонна перевірка («менше за стелю») цього не бачила.
    it.each([
      [100, 100, "19.4px"],
      [1000, 1000, "14.9px"],
      [12345, 12345, "12.1px"],
    ])("«%s/%s» → %s, і ширина лишається під просвітом", (c, s, fontSize) => {
      const el = ringLabel(c, s);
      expect(el.style.fontSize).toBe(fontSize);
      expect(
        widthAt(`${c}/${s}`, Number.parseFloat(el.style.fontSize)),
      ).toBeLessThan(APERTURE_PX);
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
