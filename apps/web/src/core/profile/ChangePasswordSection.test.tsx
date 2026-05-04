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
 * Тести для `ChangePasswordSection` після міграції на `useApiForm` + zod.
 * Покривають:
 *
 * - порожні поля → inline zod-помилки, `changePassword` не викликається
 * - короткий новий пароль (<10) → "Мінімум 10 символів"
 * - неспівпадіння next/confirm → "Паролі не збігаються"
 * - happy path → `changePassword({ currentPassword, newPassword })`,
 *   toast.success, поля очищено
 * - serverError від Better Auth (`result.error.message`) → відображається
 *   через `serverError` з `useApiForm` як `role="alert"`
 * - `online=false` → submit-кнопка disabled, `changePassword` не викликається
 *
 * Better Auth `changePassword` мокаємо напряму — це швидше і дозволяє
 * контролювати відповідь у форматі `{ data | error }`.
 */

const changePasswordMock = vi.fn();
vi.mock("../auth/authClient", () => ({
  changePassword: (args: { currentPassword: string; newPassword: string }) =>
    changePasswordMock(args),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: toastErrorMock,
    info: vi.fn(),
  }),
}));

import { ChangePasswordSection } from "./ChangePasswordSection";

beforeEach(() => {
  changePasswordMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  cleanup();
});

function fillForm(current: string, next: string, confirm: string = next): void {
  fireEvent.change(screen.getByLabelText("Поточний пароль"), {
    target: { value: current },
  });
  fireEvent.change(screen.getByLabelText("Новий пароль"), {
    target: { value: next },
  });
  fireEvent.change(screen.getByLabelText("Підтвердити пароль"), {
    target: { value: confirm },
  });
}

describe("ChangePasswordSection — client-side validation", () => {
  it("показує zod-помилки для порожніх полів і не викликає changePassword", async () => {
    render(<ChangePasswordSection online={true} />);

    fireEvent.click(screen.getByRole("button", { name: "Змінити пароль" }));

    await waitFor(() => {
      expect(screen.getByText("Введи поточний пароль")).toBeTruthy();
    });
    expect(screen.getByText("Мінімум 10 символів")).toBeTruthy();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("відхиляє новий пароль коротший за 10 символів", async () => {
    render(<ChangePasswordSection online={true} />);

    fillForm("oldpw", "short", "short");
    fireEvent.click(screen.getByRole("button", { name: "Змінити пароль" }));

    await waitFor(() => {
      expect(screen.getByText("Мінімум 10 символів")).toBeTruthy();
    });
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("відхиляє коли новий пароль і підтвердження різні", async () => {
    render(<ChangePasswordSection online={true} />);

    fillForm("old-password", "valid-password-1", "valid-password-2");
    fireEvent.click(screen.getByRole("button", { name: "Змінити пароль" }));

    await waitFor(() => {
      expect(screen.getByText("Паролі не збігаються")).toBeTruthy();
    });
    expect(changePasswordMock).not.toHaveBeenCalled();
  });
});

describe("ChangePasswordSection — submit flow", () => {
  it("викликає changePassword + toast.success і очищає поля на happy path", async () => {
    changePasswordMock.mockResolvedValue({ data: { ok: true } });

    render(<ChangePasswordSection online={true} />);

    fillForm("old-password", "valid-password-1");
    fireEvent.click(screen.getByRole("button", { name: "Змінити пароль" }));

    await waitFor(() => {
      expect(changePasswordMock).toHaveBeenCalledWith({
        currentPassword: "old-password",
        newPassword: "valid-password-1",
      });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Пароль змінено");
    });

    // Після успішного submit reset({}) очищає поля.
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Поточний пароль") as HTMLInputElement).value,
      ).toBe("");
      expect(
        (screen.getByLabelText("Новий пароль") as HTMLInputElement).value,
      ).toBe("");
      expect(
        (screen.getByLabelText("Підтвердити пароль") as HTMLInputElement).value,
      ).toBe("");
    });
  });

  it("показує serverError, коли Better Auth повертає result.error.message", async () => {
    changePasswordMock.mockResolvedValue({
      error: { message: "Поточний пароль невірний" },
    });

    render(<ChangePasswordSection online={true} />);

    fillForm("wrong-old", "valid-password-1");
    fireEvent.click(screen.getByRole("button", { name: "Змінити пароль" }));

    await waitFor(() => {
      expect(changePasswordMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("alert")
          .some((el) => el.textContent?.includes("Поточний пароль невірний")),
      ).toBe(true);
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("підпадає під `disabled` коли online=false і не викликає changePassword", async () => {
    render(<ChangePasswordSection online={false} />);

    const submitButton = screen.getByRole("button", { name: "Змінити пароль" });
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    fillForm("old-password", "valid-password-1");
    fireEvent.click(submitButton);

    // Кнопка disabled, але навіть якщо клікнули — submit не повинен пройти.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(changePasswordMock).not.toHaveBeenCalled();
  });
});
