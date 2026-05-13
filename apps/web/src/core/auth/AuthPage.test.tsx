// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

/**
 * Тести для AuthPage після міграції на `useApiForm`. Покривають:
 *
 * - client-side zod валідація (порожні / невалідні поля → inline помилки)
 * - happy path login → toast "Вхід виконано"
 * - happy path register → celebration achievement
 * - server-помилка через `authError` (не дублюється form.serverError)
 * - перемикач режиму (login ↔ register) скидає поля
 *
 * Реальний `AuthContext` тут НЕ потрібен — мокаємо `useAuth` цілком.
 * Це швидше і дозволяє контролювати `authError`/`login` поведінку.
 */

const loginMock = vi.fn();
const registerMock = vi.fn();
const loginWithGoogleMock = vi.fn();
const requestPasswordResetMock = vi.fn();
const setAuthErrorMock = vi.fn();

let authErrorState: string | null = null;

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    user: null,
    status: "unauthenticated",
    isLoading: false,
    login: loginMock,
    register: registerMock,
    loginWithGoogle: loginWithGoogleMock,
    requestPasswordReset: requestPasswordResetMock,
    authError: authErrorState,
    setAuthError: setAuthErrorMock,
    logout: vi.fn(),
  }),
}));

const toastSuccessMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

const achievementMock = vi.fn();
vi.mock("@shared/components/ui/CelebrationModal", () => ({
  useCelebration: () => ({
    achievement: achievementMock,
    CelebrationComponent: null,
  }),
  CelebrationModal: () => null,
}));

import { AuthPage } from "./AuthPage";

beforeEach(() => {
  loginMock.mockReset();
  registerMock.mockReset();
  loginWithGoogleMock.mockReset();
  requestPasswordResetMock.mockReset();
  setAuthErrorMock.mockReset();
  toastSuccessMock.mockReset();
  achievementMock.mockReset();
  authErrorState = null;
});

afterEach(() => {
  // `apps/web/src/test/setup.ts` не реєструє глобальний `cleanup`,
  // тому викликаємо його тут явно — інакше попередні рендери
  // залишаються в DOM і `getByLabelText` ловить дублікати.
  cleanup();
});

describe("AuthPage — login mode", () => {
  it("shows zod validation errors for empty / invalid fields", async () => {
    render(<AuthPage />);

    const submit = screen.getByRole("button", { name: /^Увійти$/ });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByText("Введи email")).toBeTruthy();
      expect(screen.getByText("Введи пароль")).toBeTruthy();
    });
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("rejects malformed email", async () => {
    render(<AuthPage />);

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    const password = screen.getByLabelText("Пароль") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.change(password, { target: { value: "x" } });

    fireEvent.click(screen.getByRole("button", { name: /^Увійти$/ }));

    await waitFor(() => {
      expect(screen.getByText("Некоректний формат email")).toBeTruthy();
    });
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("calls login() on valid submit and shows success toast", async () => {
    loginMock.mockResolvedValue(true);
    render(<AuthPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Увійти$/ }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith("alice@example.com", "secret123");
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Вхід виконано");
    });
  });

  it("does NOT toast success when login() returns false", async () => {
    loginMock.mockResolvedValue(false);
    authErrorState = "Невірний пароль";
    render(<AuthPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Увійти$/ }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalled();
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
    // `authError` рендериться як `role="alert"` блок над кнопкою.
    expect(
      screen
        .getAllByRole("alert")
        .some((el) => el.textContent?.includes("Невірний пароль")),
    ).toBe(true);
  });
});

describe("AuthPage — register mode", () => {
  it("enforces 10-char password minimum", async () => {
    render(<AuthPage />);

    fireEvent.click(screen.getByRole("button", { name: /Немає акаунту/ }));

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "short" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Зареєструватися$/ }));

    await waitFor(() => {
      expect(screen.getByText("Мінімум 10 символів")).toBeTruthy();
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("falls back to email-prefix when name is empty", async () => {
    registerMock.mockResolvedValue(true);
    render(<AuthPage />);

    fireEvent.click(screen.getByRole("button", { name: /Немає акаунту/ }));

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "bob@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "longenoughpw" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Зареєструватися$/ }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith(
        "bob@example.com",
        "longenoughpw",
        "bob",
      );
    });
    await waitFor(() => {
      expect(achievementMock).toHaveBeenCalled();
    });
  });

  it("uses provided name when filled", async () => {
    registerMock.mockResolvedValue(true);
    render(<AuthPage />);

    fireEvent.click(screen.getByRole("button", { name: /Немає акаунту/ }));

    fireEvent.change(screen.getByLabelText("Ім'я"), {
      target: { value: "Боб" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "bob@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "longenoughpw" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Зареєструватися$/ }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith(
        "bob@example.com",
        "longenoughpw",
        "Боб",
      );
    });
  });
});

describe("AuthPage — mode switching", () => {
  it("clears authError when switching modes", () => {
    authErrorState = "Stale";
    render(<AuthPage />);

    fireEvent.click(screen.getByRole("button", { name: /Немає акаунту/ }));

    expect(setAuthErrorMock).toHaveBeenCalledWith(null);
  });
});

describe("AuthPage — UX polish (autoFocus / password toggle / a11y)", () => {
  it("autoFocus-ить email на login-режимі при mount-і", () => {
    render(<AuthPage />);

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(document.activeElement).toBe(email);
  });

  it("автокомплит атрибути виставлені на login-полях", () => {
    render(<AuthPage />);

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    const password = screen.getByLabelText("Пароль") as HTMLInputElement;

    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(password.getAttribute("autocomplete")).toBe("current-password");
  });

  it("автокомплит атрибути виставлені на register-полях", () => {
    render(<AuthPage />);

    fireEvent.click(screen.getByRole("button", { name: /Немає акаунту/ }));

    const name = screen.getByLabelText("Ім'я") as HTMLInputElement;
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    const password = screen.getByLabelText("Пароль") as HTMLInputElement;

    expect(name.getAttribute("autocomplete")).toBe("name");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(password.getAttribute("autocomplete")).toBe("new-password");
  });

  it("кнопка show-password перемикає type password ↔ text", () => {
    render(<AuthPage />);

    const password = screen.getByLabelText("Пароль") as HTMLInputElement;
    expect(password.type).toBe("password");

    const toggle = screen.getByRole("button", { name: "Показати пароль" });
    fireEvent.click(toggle);

    expect(password.type).toBe("text");
    expect(screen.getByRole("button", { name: "Сховати пароль" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Сховати пароль" }));
    expect(password.type).toBe("password");
  });

  it("aria-describedby з'являється лише після помилки валідації", async () => {
    render(<AuthPage />);

    const password = screen.getByLabelText("Пароль") as HTMLInputElement;
    expect(password.getAttribute("aria-describedby")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Увійти$/ }));

    await waitFor(() => {
      expect(password.getAttribute("aria-describedby")).toBe("auth-pw-error");
    });
    const errorEl = document.getElementById("auth-pw-error");
    expect(errorEl?.getAttribute("role")).toBe("alert");
  });

  it("forgot-email отримує autoFocus при відкритті панелі", () => {
    render(<AuthPage />);

    fireEvent.click(screen.getByRole("button", { name: /Забули пароль/ }));

    const forgotEmail = screen.getByLabelText(
      "Email для скидання",
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(forgotEmail);
  });

  it("кнопка submit стає disabled під час login (aria-busy=true)", async () => {
    let resolveLogin: ((v: boolean) => void) | undefined;
    loginMock.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    render(<AuthPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Увійти$/ }));

    // У pending-стані кнопка перемикається на варіант з лоадинг-копією
    // (`messages.loadingActions.signingIn`), отримує aria-busy і disabled.
    await waitFor(() => {
      const busyBtn = screen
        .getAllByRole("button")
        .find((b) => b.getAttribute("aria-busy") === "true");
      expect(busyBtn).toBeTruthy();
      expect((busyBtn as HTMLButtonElement).disabled).toBe(true);
    });

    resolveLogin?.(true);
  });
});

describe("AuthPage — forgot password (UX roast 2026-Q2 A14)", () => {
  it("після успіху показує кнопку «Назад до входу», що згортає панель", async () => {
    requestPasswordResetMock.mockResolvedValue(true);
    render(<AuthPage />);

    fireEvent.click(screen.getByRole("button", { name: /Забули пароль/ }));
    fireEvent.change(screen.getByLabelText("Email для скидання"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Надіслати лист/ }));

    const back = await screen.findByRole("button", {
      name: /Назад до входу/,
    });
    expect(back).toBeTruthy();

    fireEvent.click(back);

    await waitFor(() => {
      expect(
        screen.queryByRole("group", { name: /Скидання пароля/ }),
      ).toBeNull();
    });
  });

  it("auto-collapse forgot-панелі через 6 сек після успіху", async () => {
    vi.useFakeTimers();
    try {
      requestPasswordResetMock.mockResolvedValue(true);
      render(<AuthPage />);

      fireEvent.click(screen.getByRole("button", { name: /Забули пароль/ }));
      fireEvent.change(screen.getByLabelText("Email для скидання"), {
        target: { value: "alice@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Надіслати лист/ }));

      // Чекаємо, поки `requestPasswordResetMock.mockResolvedValue(true)`
      // зарезолвиться і forgotState стане "sent" — без цього таймер
      // ще не запущено і advanceTimersByTime нічого не зробить.
      await vi.waitFor(() => {
        expect(
          screen.queryByRole("button", { name: /Назад до входу/ }),
        ).toBeTruthy();
      });

      vi.advanceTimersByTime(6000);

      await vi.waitFor(() => {
        expect(
          screen.queryByRole("group", { name: /Скидання пароля/ }),
        ).toBeNull();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
