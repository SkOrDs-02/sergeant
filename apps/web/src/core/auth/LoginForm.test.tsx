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
    authErrorState = "Неправильний пароль";
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
    expect(screen.getByRole("alert").textContent).toContain(
      "Неправильний пароль",
    );
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

  it("після невдалого входу фокус повертається в поле пароля, а не на body", async () => {
    loginMock.mockImplementation(async () => {
      authErrorState = "Неправильний email або пароль.";
      return false;
    });
    const { rerender } = render(
      <LoginForm onForgotPassword={vi.fn()} showForgot={false} />,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "wrong" },
    });
    // Людина натиснула кнопку мишею/тапом: фокус на кнопці, яка на час
    // запиту стає disabled.
    const submit = screen.getByRole("button", { name: /^Увійти$/ });
    submit.focus();
    fireEvent.click(submit);

    await waitFor(() => expect(loginMock).toHaveBeenCalled());
    rerender(<LoginForm onForgotPassword={vi.fn()} showForgot={false} />);

    const password = screen.getByLabelText("Пароль") as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(password));
    expect(password.disabled).toBe(false);
    expect(password.readOnly).toBe(false);
  });

  it("поля лише readOnly (не disabled) на час запиту, щоб не губити фокус", async () => {
    let resolveLogin: (ok: boolean) => void = () => {};
    loginMock.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    render(<LoginForm onForgotPassword={vi.fn()} showForgot={false} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    const password = screen.getByLabelText("Пароль") as HTMLInputElement;
    fireEvent.change(password, { target: { value: "secret123" } });
    password.focus();
    fireEvent.submit(password.closest("form") as HTMLFormElement);

    await waitFor(() => expect(password.readOnly).toBe(true));
    expect(password.disabled).toBe(false);
    expect((screen.getByLabelText("Email") as HTMLInputElement).disabled).toBe(
      false,
    );
    expect(document.activeElement).toBe(password);

    resolveLogin(true);
    await waitFor(() => expect(password.readOnly).toBe(false));
  });

  it("помилка входу: пароль aria-invalid і описаний текстом role=alert", () => {
    authErrorState = "Неправильний email або пароль.";
    render(<LoginForm onForgotPassword={vi.fn()} showForgot={false} />);

    const password = screen.getByLabelText("Пароль");
    const alert = screen.getByRole("alert");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(alert.id).toBeTruthy();
    expect(password.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("без помилки входу пароль не позначений невалідним", () => {
    render(<LoginForm onForgotPassword={vi.fn()} showForgot={false} />);
    const password = screen.getByLabelText("Пароль");
    expect(password.getAttribute("aria-invalid")).toBe("false");
    expect(password.getAttribute("aria-describedby")).toBeNull();
  });
});
