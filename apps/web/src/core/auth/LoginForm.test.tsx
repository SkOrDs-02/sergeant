// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const loginMock = vi.fn();
let authErrorState: string | null = null;

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    login: loginMock,
    authError: authErrorState,
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

import { LoginForm } from "./LoginForm";

afterEach(() => cleanup());

beforeEach(() => {
  loginMock.mockReset();
  toastSuccessMock.mockReset();
  authErrorState = null;
});

describe("LoginForm", () => {
  it("validates empty fields client-side", async () => {
    const onForgotPassword = vi.fn();
    render(
      <LoginForm onForgotPassword={onForgotPassword} showForgot={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Увійти$/ }));

    await waitFor(() => {
      expect(screen.getByText("Введи email")).toBeTruthy();
      expect(screen.getByText("Введи пароль")).toBeTruthy();
    });
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("calls login and shows success toast on valid submit", async () => {
    loginMock.mockResolvedValue(true);
    render(<LoginForm onForgotPassword={vi.fn()} showForgot={false} />);

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

  it("renders authError alert when login fails", async () => {
    loginMock.mockResolvedValue(false);
    authErrorState = "Невірний пароль";
    render(<LoginForm onForgotPassword={vi.fn()} showForgot={false} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Увійти$/ }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalled();
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Невірний пароль");
  });

  it("hides authError while forgot panel is open", () => {
    authErrorState = "Stale error";
    render(<LoginForm onForgotPassword={vi.fn()} showForgot />);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("passes live email to onForgotPassword", () => {
    const onForgotPassword = vi.fn();
    render(
      <LoginForm onForgotPassword={onForgotPassword} showForgot={false} />,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Забули пароль/ }));

    expect(onForgotPassword).toHaveBeenCalledWith("user@example.com");
  });

  it("toggles password visibility", () => {
    render(<LoginForm onForgotPassword={vi.fn()} showForgot={false} />);

    const password = screen.getByLabelText("Пароль") as HTMLInputElement;
    expect(password.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Показати пароль" }));
    expect(password.type).toBe("text");
  });
});
