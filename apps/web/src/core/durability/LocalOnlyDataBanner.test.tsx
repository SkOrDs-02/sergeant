/** @vitest-environment jsdom */
/**
 * Last validated: 2026-07-25
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

import { LocalOnlyDataBanner } from "./LocalOnlyDataBanner";
import { NON_SYNCABLE_USER_IDS } from "../syncEngine/syncableUserId";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

  it("копія називає саме те, що НЕ відновлюється з банку", () => {
    // Робить неможливим «помʼякшення» тексту до абстрактного «увійди, щоб
    // синхронізувати». Цінність попередження саме в предметності: людина
    // має впізнати свою готівку, борги й категорії, а не прочитати
    // маркетинговий заклик.
    useLocalUserIdMock.mockReturnValue("local-anon");
    render(<LocalOnlyDataBanner onSignIn={vi.fn()} />);
    const body = screen.getByText(/Витрати готівкою/);
    expect(body.textContent).toMatch(/активи/);
    expect(body.textContent).toMatch(/борги/);
    expect(body.textContent).toMatch(/категорії/);
    expect(body.textContent).toMatch(/банк їх не поверне/);
  });

  it("кнопка входу викликає onSignIn", () => {
    useLocalUserIdMock.mockReturnValue("local-anon");
    const onSignIn = vi.fn();
    render(<LocalOnlyDataBanner onSignIn={onSignIn} />);
    fireEvent.click(screen.getByRole("button", { name: "Увійти" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
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
