/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * `useOpenSignIn` — єдиний спосіб відкрити `/sign-in` (аудит A1,
 * 2026-09-11 хвиля 2). Мутаційна перевірка: підмінити `navigate(SIGN_IN_PATH)`
 * на `window.location.assign(...)` (повне перезавантаження) залишає
 * `MemoryRouter`-локацію на місці — тест нижче про SPA-перехід
 * почервоніє, бо `MemoryRouter` веде власний стек історії, незалежний
 * від `window.location`.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

import { useOpenSignIn } from "./useOpenSignIn";

function OpenSignInProbe() {
  const openSignIn = useOpenSignIn();
  const location = useLocation();
  return (
    <>
      <button type="button" onClick={openSignIn}>
        відкрити вхід
      </button>
      <span data-testid="probe-location">{location.pathname}</span>
    </>
  );
}

describe("useOpenSignIn", () => {
  it("переходить на /sign-in SPA-переходом, не перезавантаженням", () => {
    render(
      <MemoryRouter initialEntries={["/finyk"]}>
        <OpenSignInProbe />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("probe-location")).toHaveTextContent("/finyk");

    fireEvent.click(screen.getByRole("button", { name: "відкрити вхід" }));

    // MemoryRouter не знає про window.location — якщо колбек змінив би
    // адресу через повне перезавантаження (`<a href>`/`window.location`),
    // цей рядок лишився б на "/finyk".
    expect(screen.getByTestId("probe-location")).toHaveTextContent("/sign-in");
  });

  it("повертає стабільний колбек між рендерами того самого маршруту", () => {
    const refs: Array<() => void> = [];
    function RefProbe() {
      refs.push(useOpenSignIn());
      return null;
    }
    const { rerender } = render(
      <MemoryRouter>
        <RefProbe />
      </MemoryRouter>,
    );
    rerender(
      <MemoryRouter>
        <RefProbe />
      </MemoryRouter>,
    );
    expect(refs).toHaveLength(2);
    expect(refs[0]).toBe(refs[1]);
  });
});
