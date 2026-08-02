// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * `/verify-email` — лендинг, куди Better Auth редиректить після
 * `GET /api/auth/verify-email`. Верифікація вже сталася на сервері; сторінка
 * відповідає за дві речі, і саме їх пінить цей сюїт:
 *
 *   1. синхронізацію клієнта — примусовий обхід 5-хвилинного cookie-кеша
 *      сесії, інакше бейдж у профілі ще довго показує «Не підтверджено»;
 *   2. читабельний результат для `?error=<CODE>`, бо це єдиний сигнал, який
 *      Better Auth лишає користувачу при протермінованому посиланні.
 */

const refreshSessionCookieCacheMock = vi.fn(async () => {});
vi.mock("./authClient", () => ({
  refreshSessionCookieCache: () => refreshSessionCookieCacheMock(),
}));

const refreshMock = vi.fn(async () => {});
let authStatus: "loading" | "authenticated" | "unauthenticated" =
  "authenticated";
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ refresh: refreshMock, status: authStatus }),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigateMock };
});

import { VerifyEmailPage } from "./VerifyEmailPage";

function renderAt(search: string) {
  render(
    <MemoryRouter initialEntries={[`/verify-email${search}`]}>
      <VerifyEmailPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  refreshSessionCookieCacheMock.mockClear();
  refreshMock.mockClear();
  navigateMock.mockClear();
  authStatus = "authenticated";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("VerifyEmailPage — успіх", () => {
  it("обходить cookie-кеш сесії і перечитує профіль", async () => {
    renderAt("");

    await waitFor(() => {
      expect(refreshSessionCookieCacheMock).toHaveBeenCalledTimes(1);
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Email підтверджено")).toBeTruthy();
  });

  /**
   * Порядок принциповий: спершу сервер переписує cookie-кеш свіжим
   * `emailVerified: true`, і лише потім ми рефетчимо `/api/v1/me`. Зворотний
   * порядок гарантовано підтягнув би протухле значення — рівно той баг, від
   * якого сторінка й рятує.
   */
  it("оновлює cookie-кеш ДО рефетчу me", async () => {
    const order: string[] = [];
    refreshSessionCookieCacheMock.mockImplementationOnce(async () => {
      order.push("cookie");
    });
    refreshMock.mockImplementationOnce(async () => {
      order.push("me");
    });

    renderAt("");

    await waitFor(() => expect(order).toEqual(["cookie", "me"]));
  });

  it("залогіненого автоматично повертає в застосунок", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt("");

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(5_000);

    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });

  /**
   * Лист відкрили в іншому браузері — сесії тут немає. Головна показала б
   * гостьовий хаб, з якого не зрозуміло, спрацювало підтвердження чи ні.
   */
  it("анонімного веде на сторінку входу", async () => {
    authStatus = "unauthenticated";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt("");

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(5_000);

    expect(navigateMock).toHaveBeenCalledWith("/sign-in", { replace: true });
  });
});

describe("VerifyEmailPage — помилки", () => {
  it("протермінований токен пояснює, що робити далі", () => {
    renderAt("?error=TOKEN_EXPIRED");

    expect(screen.getByText("Не вийшло підтвердити")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("протерміноване");
    // Нічого не «підтверджуємо» і не смикаємо сесію на помилці.
    expect(refreshSessionCookieCacheMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("невідомий код показує generic-копію замість сирого коду", () => {
    renderAt("?error=SOMETHING_NEW_UPSTREAM");

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Не вдалося підтвердити email");
    expect(alert.textContent).not.toContain("SOMETHING_NEW_UPSTREAM");
  });

  it("на помилці не редиректить автоматично", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt("?error=INVALID_TOKEN");

    await vi.advanceTimersByTimeAsync(10_000);

    expect(navigateMock).not.toHaveBeenCalled();
  });
});
