/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { MonoStalenessBanner } from "./MonoStalenessBanner";

describe("MonoStalenessBanner", () => {
  it("називає кількість днів із правильним відмінком", () => {
    // 7/2/1 — три різні гілки українського плюралізатора. Без цього
    // асерту «21 днів» проходив би непоміченим.
    const cases: [number, string][] = [
      [7, "Дані не оновлювались 7 днів."],
      [22, "Дані не оновлювались 22 дні."],
      [21, "Дані не оновлювались 21 день."],
    ];
    for (const [days, expected] of cases) {
      const { unmount } = render(<MonoStalenessBanner days={days} />);
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it("не звинувачує банк — тримає обидві причини як можливі", () => {
    // Робить неможливим дрейф копії у впевнене «Monobank не працює».
    // Канон §6.3: тиша webhook-а ззовні ідентична тиші користувача, тож
    // однозначний діагноз тут був би вигадкою в половині випадків.
    render(<MonoStalenessBanner days={9} />);
    const hint = screen.getByText(/Можливо, витрат справді не було/);
    expect(hint).toBeInTheDocument();
    expect(hint.textContent).toMatch(/можливо, звʼязок із банком обірвався/);
  });

  it("оголошується асистивним технологіям як статус", () => {
    render(<MonoStalenessBanner days={8} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("показує CTA і кличе onReconnect", () => {
    const onReconnect = vi.fn();
    render(<MonoStalenessBanner days={8} onReconnect={onReconnect} />);
    fireEvent.click(screen.getByRole("button", { name: /Перевірити/ }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("без onReconnect не рендерить мертву кнопку", () => {
    render(<MonoStalenessBanner days={8} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
