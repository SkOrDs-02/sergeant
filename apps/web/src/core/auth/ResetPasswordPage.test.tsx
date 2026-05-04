// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Тести для `ResetPasswordPage` після міграції на `useApiForm` + zod.
 * Покривають:
 *
 * - відсутній `?token=` → показується error-state з кнопкою "На сторінку входу"
 * - порожні поля → inline zod-помилки, `resetPassword` не викликається
 * - короткий пароль (<10) → "Пароль має бути мінімум 10 символів."
 * - неспівпадіння паролів → "Паролі не збігаються."
 * - happy path → `resetPassword({ token, newPassword })`, toast,
 *   `navigate("/sign-in")` через 1.5 s
 * - serverError від Better Auth (`result.error.message`) → відображається
 *   через `serverError` з `useApiForm` як `role="alert"`
 *
 * Реальний `authClient` мокаємо — це швидше і дозволяє контролювати
 * Better-Auth відповіді.
 */

const resetPasswordMock = vi.fn();
vi.mock("./authClient", () => ({
  resetPassword: (args: { token: string; newPassword: string }) =>
    resetPasswordMock(args),
}));

const toastSuccessMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { ResetPasswordPage } from "./ResetPasswordPage";

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetPasswordMock.mockReset();
  toastSuccessMock.mockReset();
  navigateMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ResetPasswordPage — missing token", () => {
  it("renders error-state when ?token= is missing", () => {
    renderAt("/reset-password");

    expect(
      screen.getByText(/Посилання на скидання пароля неповне/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "На сторінку входу" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Встановити новий пароль" }),
    ).toBeNull();
  });

  it("navigates to /sign-in when 'На сторінку входу' is clicked", () => {
    renderAt("/reset-password");

    fireEvent.click(screen.getByRole("button", { name: "На сторінку входу" }));
    expect(navigateMock).toHaveBeenCalledWith("/sign-in", { replace: true });
  });
});

describe("ResetPasswordPage — client-side validation", () => {
  it("shows zod errors for empty fields and does not call resetPassword", async () => {
    renderAt("/reset-password?token=abc");

    fireEvent.click(
      screen.getByRole("button", { name: "Встановити новий пароль" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Пароль має бути мінімум 10 символів."),
      ).toBeTruthy();
    });
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects passwords shorter than 10 chars", async () => {
    renderAt("/reset-password?token=abc");

    fireEvent.change(screen.getByLabelText("Новий пароль"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("Підтвердження"), {
      target: { value: "short" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Встановити новий пароль" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Пароль має бути мінімум 10 символів."),
      ).toBeTruthy();
    });
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects when password and confirm differ", async () => {
    renderAt("/reset-password?token=abc");

    fireEvent.change(screen.getByLabelText("Новий пароль"), {
      target: { value: "valid-password-1" },
    });
    fireEvent.change(screen.getByLabelText("Підтвердження"), {
      target: { value: "valid-password-2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Встановити новий пароль" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Паролі не збігаються.")).toBeTruthy();
    });
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });
});

describe("ResetPasswordPage — submit flow", () => {
  it("calls resetPassword on valid submit and navigates after 1.5 s", async () => {
    resetPasswordMock.mockResolvedValue({ data: { ok: true } });
    renderAt("/reset-password?token=magic-link-token");

    fireEvent.change(screen.getByLabelText("Новий пароль"), {
      target: { value: "valid-password-1" },
    });
    fireEvent.change(screen.getByLabelText("Підтвердження"), {
      target: { value: "valid-password-1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Встановити новий пароль" }),
    );

    await waitFor(() => {
      expect(resetPasswordMock).toHaveBeenCalledWith({
        token: "magic-link-token",
        newPassword: "valid-password-1",
      });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Пароль оновлено");
    });

    // `setTimeout(navigate, 1500)` живий — після 1.5s маємо перехід.
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(navigateMock).toHaveBeenCalledWith("/sign-in", { replace: true });
  });

  it("displays serverError when Better Auth returns result.error.message", async () => {
    resetPasswordMock.mockResolvedValue({
      error: { message: "Посилання вже використане." },
    });
    renderAt("/reset-password?token=expired-token");

    fireEvent.change(screen.getByLabelText("Новий пароль"), {
      target: { value: "valid-password-1" },
    });
    fireEvent.change(screen.getByLabelText("Підтвердження"), {
      target: { value: "valid-password-1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Встановити новий пароль" }),
    );

    await waitFor(() => {
      expect(resetPasswordMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("alert")
          .some((el) => el.textContent?.includes("Посилання вже використане.")),
      ).toBe(true);
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
