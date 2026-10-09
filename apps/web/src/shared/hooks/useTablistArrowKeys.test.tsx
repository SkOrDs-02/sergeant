// @vitest-environment jsdom
/**
 * Status: Active
 *
 * Тести {@link useTablistArrowKeys}. Перевіряємо саме те, що обіцяє роль
 * `tablist`: стрілки ходять по вкладках із загортанням, Home/End стрибають
 * на краї, вибір їде разом із фокусом.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  useTablistArrowKeys,
  type TablistActivation,
} from "./useTablistArrowKeys";

const onSelect = vi.fn();

function Harness({
  enabled = true,
  disabledIds = [],
  selected = "a",
  activation,
}: {
  enabled?: boolean;
  disabledIds?: string[];
  selected?: string;
  activation?: TablistActivation;
}) {
  const onTabKeyDown = useTablistArrowKeys(enabled, activation);
  return (
    <div role="tablist" aria-label="Проба">
      {["a", "b", "c"].map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === selected}
          tabIndex={id === selected ? 0 : -1}
          disabled={disabledIds.includes(id)}
          onKeyDown={onTabKeyDown}
          onClick={() => onSelect(id)}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });
/** Клавіша йде на кнопку — саме там тепер живе обробник. */
const press = (from: string, key: string) =>
  fireEvent.keyDown(tab(from), { key });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useTablistArrowKeys", () => {
  it("ArrowRight переводить фокус і вибір на наступну вкладку", () => {
    render(<Harness />);
    tab("a").focus();
    press("a", "ArrowRight");
    expect(document.activeElement).toBe(tab("b"));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("ArrowLeft іде назад", () => {
    render(<Harness selected="c" />);
    tab("c").focus();
    press("c", "ArrowLeft");
    expect(document.activeElement).toBe(tab("b"));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("край ряду загортається в обидва боки", () => {
    // Загортання — не косметика: без нього остання вкладка стає глухим
    // кутом, і людина мусить вертатись стрілкою через увесь ряд.
    render(<Harness selected="c" />);
    tab("c").focus();
    press("c", "ArrowRight");
    expect(document.activeElement).toBe(tab("a"));

    tab("a").focus();
    press("a", "ArrowLeft");
    expect(document.activeElement).toBe(tab("c"));
  });

  it("Home і End стрибають на краї", () => {
    render(<Harness selected="b" />);
    tab("b").focus();
    press("b", "End");
    expect(document.activeElement).toBe(tab("c"));

    press("c", "Home");
    expect(document.activeElement).toBe(tab("a"));
  });

  it("вимкнені вкладки пропускаються", () => {
    // `ManualExpenseKindTabs` вимикає вкладки на час сабміту; фокус на
    // вимкненій кнопці нічого не дає і виглядає як зависання.
    render(<Harness disabledIds={["b"]} />);
    tab("a").focus();
    press("a", "ArrowRight");
    expect(document.activeElement).toBe(tab("c"));
  });

  it("вимкнена вкладка як точка відліку віддає хід вибраній", () => {
    // Кнопка може отримати keydown і бувши вимкненою в деяких браузерах;
    // її немає в списку, тож відлік іде від `aria-selected`.
    render(<Harness selected="c" disabledIds={["a"]} />);
    press("a", "ArrowRight");
    // Список без «a» — це [b, c]; вибрана «c» остання, тож ArrowRight
    // загортається на «b».
    expect(document.activeElement).toBe(tab("b"));
  });

  it("сторонні клавіші не перехоплюються", () => {
    // preventDefault на Tab або пробілі зламав би звичайну навігацію.
    render(<Harness />);
    tab("a").focus();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    tab("a").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each([
    ["altKey", { altKey: true }],
    ["ctrlKey", { ctrlKey: true }],
    ["metaKey", { metaKey: true }],
  ])("модифікована стрілка (%s) належить браузеру, не нам", (_label, mods) => {
    // Alt+← це «Назад» на Windows/Linux, Cmd+← — на macOS. Перехопивши їх,
    // ми зʼїли б навігацію (preventDefault) і ще й перемкнули вкладку.
    render(<Harness selected="b" />);
    tab("b").focus();
    const event = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
      ...mods,
    });
    tab("b").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(tab("b"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("немодифікована стрілка працює як і раніше", () => {
    // Пара до тесту вище: гвардія модифікаторів не сміє гасити звичайний хід.
    render(<Harness selected="b" />);
    tab("b").focus();
    press("b", "ArrowLeft");
    expect(document.activeElement).toBe(tab("a"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("enabled=false вимикає обробку повністю", () => {
    render(<Harness enabled={false} />);
    tab("a").focus();
    press("a", "ArrowRight");
    expect(document.activeElement).toBe(tab("a"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  describe("activation: 'manual'", () => {
    it("ArrowRight переносить фокус, але не активує сусідню вкладку", () => {
      // Без режиму `manual` хук кликав `click()` на кожну стрілку: у рейку
      // модулів це була навігація, у шторці їжі — відкриття камери.
      render(<Harness activation="manual" />);
      tab("a").focus();
      press("a", "ArrowRight");
      expect(document.activeElement).toBe(tab("b"));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("ArrowLeft, Home і End теж лише переносять фокус", () => {
      render(<Harness activation="manual" selected="b" />);
      tab("b").focus();
      press("b", "ArrowLeft");
      expect(document.activeElement).toBe(tab("a"));
      press("a", "End");
      expect(document.activeElement).toBe(tab("c"));
      press("c", "Home");
      expect(document.activeElement).toBe(tab("a"));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("загортання і пропуск вимкнених працюють так само", () => {
      render(<Harness activation="manual" selected="c" disabledIds={["a"]} />);
      tab("c").focus();
      press("c", "ArrowRight");
      expect(document.activeElement).toBe(tab("b"));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("стрілка все ще гасить дефолт браузера (скрол)", () => {
      render(<Harness activation="manual" />);
      tab("a").focus();
      const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      });
      tab("a").dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it("явне activation='auto' поводиться як дефолт", () => {
      render(<Harness activation="auto" />);
      tab("a").focus();
      press("a", "ArrowRight");
      expect(onSelect).toHaveBeenCalledWith("b");
    });
  });
});
