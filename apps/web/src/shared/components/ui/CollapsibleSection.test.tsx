/** @vitest-environment jsdom */
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { CollapsibleSection } from "./CollapsibleSection";

describe("CollapsibleSection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders an expanded heading and its children by default", () => {
    render(
      <CollapsibleSection storageKey="sergeant.test.expanded" title="Підказки">
        <p>payload</p>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button", { name: /Підказки/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("payload")).toBeInTheDocument();
  });

  it("shows a collapsed pill with icon, title, and subtitle when collapsed", () => {
    render(
      <CollapsibleSection
        storageKey="sergeant.test.collapsed"
        title="Аналітика"
        defaultOpen={false}
        collapsedIcon="bar-chart"
        collapsedSubtitle="3 інсайти"
      >
        <p>payload</p>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button", { name: /Аналітика/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Subtitle is rendered in the collapsed pill.
    expect(screen.getByText("3 інсайти")).toBeInTheDocument();
  });

  it("toggles open/closed on click and persists the state", () => {
    render(
      <CollapsibleSection storageKey="sergeant.test.persist" title="Підказки">
        <p>payload</p>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button", { name: /Підказки/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(localStorage.getItem("sergeant.test.persist")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(localStorage.getItem("sergeant.test.persist")).toBe("true");
  });
  // L-7: вміст ховається лише візуально (`grid-rows-[0fr] overflow-hidden`),
  // без цього тесту DOM-підтерево лишалось у tab-порядку й дереві
  // доступності при defaultOpen={false} — Tab від заголовка провалювався
  // у приховані інтерактивні елементи (наживо: поля пароля, «Відкликати
  // сесію», destructive «Видалити акаунт»). `inert` (+ `aria-hidden` для
  // рушіїв, що не знають `inert`) прибирає підтерево з фокуса й a11y-дерева,
  // лишаючи його видимим для CSS-анімації розкриття (на відміну від
  // `hidden`, який ламає grid-template-rows).
  //
  // Round-trip навмисно в ОДНОМУ тесті: перевірка "після кліку inert знято"
  // сама по собі нічого не доводить, якщо inert ніколи не виставлявся
  // взагалі (напр. видалили весь `useLayoutEffect`) — `not.toHaveAttribute`
  // була б зеленою і без фікса. Ловимо регресію, лише зафіксувавши
  // "виставлено" ДО кліку в тому самому рендері, що й "знято" після нього.
  it("ставить inert+aria-hidden на вміст, коли секція монтується згорнутою, і знімає обидва синхронно з кліком на розкриття", () => {
    render(
      <CollapsibleSection
        storageKey="sergeant.test.inert-collapsed"
        title="Небезпечна зона"
        defaultOpen={false}
      >
        <button type="button">Видалити акаунт</button>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button", { name: /Небезпечна зона/ });
    // Контентний grid-вузол — прямий сусід toggle-кнопки в <section>.
    const contentGrid = toggle.nextElementSibling;
    expect(contentGrid).not.toBeNull();
    expect(contentGrid).toHaveAttribute("inert");
    expect(contentGrid).toHaveAttribute("aria-hidden", "true");

    // Регресія, яку явно попереджає завдання: якщо знімати `inert` лише по
    // `transitionend` (а не синхронно з рендером, що вмикає розкриття),
    // перший Tab одразу після кліку «розгорнути» провалюється у ще-inert
    // підтерево, бо подія переходу приходить із затримкою ~200ms. Клік
    // нижче НЕ емітить `transitionend` — якщо fix чекає на цю подію,
    // атрибути лишаться і перевірка впаде.
    fireEvent.click(toggle);
    expect(contentGrid).not.toHaveAttribute("inert");
    expect(contentGrid).not.toHaveAttribute("aria-hidden");
  });

  it("не ставить inert/aria-hidden на вміст, коли секція монтується розгорнутою за замовчуванням, і ставить обидва при згортанні", () => {
    render(
      <CollapsibleSection
        storageKey="sergeant.test.inert-expanded"
        title="Особиста інформація"
        defaultOpen
      >
        <button type="button">Зберегти</button>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button", {
      name: /Особиста інформація/,
    });
    const contentGrid = toggle.nextElementSibling;
    expect(contentGrid).not.toBeNull();
    expect(contentGrid).not.toHaveAttribute("inert");
    expect(contentGrid).not.toHaveAttribute("aria-hidden");

    fireEvent.click(toggle);
    expect(contentGrid).toHaveAttribute("inert");
    expect(contentGrid).toHaveAttribute("aria-hidden", "true");
  });

  // `onOpenChange` існує тому, що секція тримає дітей у DOM і згорнутою
  // (`grid-rows-[0fr] overflow-hidden`): «змонтовано» ≠ «видно». Діти, які
  // емітять impression-телеметрію, мусять знати РЕАЛЬНИЙ стан видимості.
  it("повідомляє про стан розгорнутості на монтуванні і після кожного перемикання", () => {
    const onOpenChange = vi.fn();
    localStorage.setItem("sergeant.test.notify", "false");

    render(
      <CollapsibleSection
        storageKey="sergeant.test.notify"
        title="Інсайти"
        onOpenChange={onOpenChange}
      >
        <p>payload</p>
      </CollapsibleSection>,
    );

    // Початкове значення приходить зі сховища, а не з `defaultOpen`.
    expect(onOpenChange.mock.calls.map((c) => c[0])).toEqual([false]);

    fireEvent.click(screen.getByRole("button", { name: /Інсайти/ }));
    expect(onOpenChange.mock.calls.map((c) => c[0])).toEqual([false, true]);
  });

  // `openSignal` / `revealRef`: діп-лінк з картки в іншому місці сторінки
  // («Відкрити звіт тижня», рішення власника 2026-10-01). Клік по заголовку
  // тут нічого не знає про те, ЩО саме людина хоче побачити всередині.
  describe("запит «покажи» ззовні (openSignal + revealRef)", () => {
    const scrollIntoView = vi.fn();

    function Host({
      signal,
      defaultOpen = false,
    }: {
      signal?: number;
      defaultOpen?: boolean;
    }) {
      const target = useRef<HTMLElement>(null);
      return (
        <CollapsibleSection
          storageKey="sergeant.test.signal"
          title="Звіт"
          defaultOpen={defaultOpen}
          {...(signal === undefined ? {} : { openSignal: signal })}
          revealRef={target}
        >
          <section ref={target} tabIndex={-1} aria-label="Тиждень у цифрах">
            payload
          </section>
        </CollapsibleSection>
      );
    }

    beforeEach(() => {
      scrollIntoView.mockClear();
      // jsdom не має scrollIntoView.
      Element.prototype.scrollIntoView = scrollIntoView;
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    });

    it("згорнута секція розгортається, стан пишеться у сховище, а ціль отримує фокус і скрол", () => {
      const { rerender } = render(<Host signal={0} />);
      const toggle = screen.getByRole("button", { name: /Звіт/ });
      expect(toggle).toHaveAttribute("aria-expanded", "false");

      rerender(<Host signal={1} />);
      expect(screen.getByRole("button", { name: /Звіт/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(localStorage.getItem("sergeant.test.signal")).toBe("true");

      // `transitionend` у jsdom не буває: спрацьовує запасний таймер.
      act(() => {
        vi.advanceTimersByTime(800);
      });
      const target = screen.getByRole("region", { name: "Тиждень у цифрах" });
      expect(document.activeElement).toBe(target);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(target);
    });

    it("уже розгорнута секція показує ціль одразу, без очікування переходу", () => {
      const { rerender } = render(<Host signal={0} defaultOpen />);
      rerender(<Host signal={1} defaultOpen />);
      const target = screen.getByRole("region", { name: "Тиждень у цифрах" });
      expect(document.activeElement).toBe(target);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it("значення на монтуванні нічого не розгортає: реагує лише зміна", () => {
      render(<Host signal={5} />);
      expect(screen.getByRole("button", { name: /Звіт/ })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("повторний рендер із тим самим значенням не показує ціль вдруге", () => {
      const { rerender } = render(<Host signal={0} defaultOpen />);
      rerender(<Host signal={1} defaultOpen />);
      rerender(<Host signal={1} defaultOpen />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it("без сигналу секція поводиться як і раніше", () => {
      render(<Host />);
      fireEvent.click(screen.getByRole("button", { name: /Звіт/ }));
      expect(screen.getByRole("button", { name: /Звіт/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });
  });
});
