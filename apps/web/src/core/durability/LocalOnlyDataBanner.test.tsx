/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * AI-CONTEXT: асерти цілять у два симетричні провали, і другий не менш
 * серйозний за перший:
 *   * банер НЕ показався тому, чиї дані справді під загрозою (мовчазна
 *     втрата ручного світу — те, що канон §6.2 називає неприйнятним);
 *   * банер показався тому, чиї дані на сервері — тобто продукт бреше, і
 *     користувач вчиться ігнорувати банери взагалі.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { useLocalUserIdMock } = vi.hoisted(() => ({
  useLocalUserIdMock: vi.fn(),
}));

vi.mock("../auth/useLocalUserId", () => ({
  useLocalUserId: useLocalUserIdMock,
}));

import { messagesEn } from "@shared/i18n/en";
import { LocalOnlyDataBanner } from "./LocalOnlyDataBanner";
import { NON_SYNCABLE_USER_IDS } from "../syncEngine/syncableUserId";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("LocalOnlyDataBanner", () => {
  it.each([...NON_SYNCABLE_USER_IDS])(
    "показується для несинхронізованого id %s",
    (id) => {
      // `it.each` по РЕАЛЬНОМУ списку, а не по двох захардкоджених рядках:
      // якщо зʼявиться третій синтетичний id, він автоматично потрапить у
      // покриття. Хардкод тут старів би тихо — рівно та форма, через яку в
      // цьому репо вже жив набір із чотирьох розбіжних копій.
      useLocalUserIdMock.mockReturnValue(id);
      render(<LocalOnlyDataBanner onSignIn={vi.fn()} />);
      expect(screen.getByText(/Дані лише на цьому пристрої/)).toBeTruthy();
    },
  );

  it("показує англійські рядки в EN-локалі", () => {
    localStorage.setItem("sergeant:locale", "en");
    useLocalUserIdMock.mockReturnValue([...NON_SYNCABLE_USER_IDS][0]);
    render(<LocalOnlyDataBanner onSignIn={vi.fn()} />);
    const enM = messagesEn.durability?.localOnly;
    expect(enM).toBeTruthy();
    expect(screen.getByText(enM!.title)).toBeTruthy();
    expect(screen.queryByText(/Дані лише на цьому пристрої/)).toBeNull();
  });

  it("НЕ показується залогіненому — для нього твердження просто неправдиве", () => {
    useLocalUserIdMock.mockReturnValue("usr_abc123");
    const { container } = render(<LocalOnlyDataBanner onSignIn={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("НЕ мигає, поки сесія вантажиться", () => {
    // `useLocalUserId` віддає `null` у стані `loading`. Показати тривожний
    // банер і прибрати його через 200 мс — гірше, ніж не показати: людина
    // запамʼятає тривогу, а не факт.
    useLocalUserIdMock.mockReturnValue(null);
    const { container } = render(<LocalOnlyDataBanner onSignIn={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("банер - один рядок факту без абзацу пояснення (redesign v3.1, Е2)", () => {
    useLocalUserIdMock.mockReturnValue("local-anon");
    render(<LocalOnlyDataBanner onSignIn={vi.fn()} />);
    expect(screen.getByText("Дані лише на цьому пристрої")).toBeTruthy();
    expect(screen.queryByText(/Витрати готівкою/)).toBeNull();
  });

  it("кнопка входу викликає onSignIn", () => {
    useLocalUserIdMock.mockReturnValue("local-anon");
    const onSignIn = vi.fn();
    render(<LocalOnlyDataBanner onSignIn={onSignIn} />);
    fireEvent.click(screen.getByRole("button", { name: "Увійти" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("«Увійти» тиха текст-кнопка, без рамки й заливки", () => {
    useLocalUserIdMock.mockReturnValue("local-anon");
    render(<LocalOnlyDataBanner onSignIn={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Увійти" });
    expect(button.className).toContain("bg-transparent");
    expect(button.className).not.toContain("border-border-strong");
  });

  it("кнопка бекапу зʼявляється лише коли є куди її повісити", () => {
    useLocalUserIdMock.mockReturnValue("local-anon");
    const { rerender } = render(<LocalOnlyDataBanner onSignIn={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /Завантажити копію/ }),
    ).toBeNull();

    const onBackup = vi.fn();
    rerender(<LocalOnlyDataBanner onSignIn={vi.fn()} onBackup={onBackup} />);
    fireEvent.click(screen.getByRole("button", { name: /Завантажити копію/ }));
    expect(onBackup).toHaveBeenCalledTimes(1);
  });
});
