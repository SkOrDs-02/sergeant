// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const registerMock = vi.fn();
let authErrorState: string | null = null;

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    register: registerMock,
    authError: authErrorState,
  }),
}));

import { RegisterForm } from "./RegisterForm";

afterEach(() => cleanup());

beforeEach(() => {
  registerMock.mockReset();
  authErrorState = null;
});

describe("RegisterForm", () => {
  it("enforces 10-char password minimum", async () => {
    render(<RegisterForm onCheckEmail={vi.fn()} />);

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

  it("falls back to email prefix when name is empty", async () => {
    registerMock.mockResolvedValue(true);
    render(<RegisterForm onCheckEmail={vi.fn()} />);

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
  });

  it("uses trimmed name when provided", async () => {
    registerMock.mockResolvedValue(true);
    render(<RegisterForm onCheckEmail={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Імʼя"), {
      target: { value: "  Боб  " },
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

  it("sec-46: без сесії викликає onCheckEmail з адресою, помилки не показує", async () => {
    const onCheckEmail = vi.fn();
    // Та сама відповідь і для нової, і для зайнятої адреси: окремої гілки
    // «вже зареєстровано» у формі більше немає.
    registerMock.mockResolvedValue("check-email");

    render(<RegisterForm onCheckEmail={onCheckEmail} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "dup@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "longenoughpw" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Зареєструватися$/ }));

    await waitFor(() => {
      expect(onCheckEmail).toHaveBeenCalledWith("dup@example.com");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("успішна реєстрація з сесією не веде на «Перевір пошту»", async () => {
    const onCheckEmail = vi.fn();
    registerMock.mockResolvedValue(true);
    render(<RegisterForm onCheckEmail={onCheckEmail} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "longenoughpw" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Зареєструватися$/ }));

    await waitFor(() => expect(registerMock).toHaveBeenCalled());
    expect(onCheckEmail).not.toHaveBeenCalled();
  });

  it("shows authError alert on server failure", async () => {
    registerMock.mockResolvedValue(false);
    authErrorState = "Щось пішло не так";
    render(<RegisterForm onCheckEmail={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "longenoughpw" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Зареєструватися$/ }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalled();
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "Щось пішло не так",
    );
  });

  it("shows password strength bar while typing", () => {
    render(<RegisterForm onCheckEmail={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "Aa1!Aa1!Aa1!" },
    });
    expect(screen.getByText("Надійний")).toBeTruthy();
  });

  it("після невдалої реєстрації фокус не губиться на body, поля не disabled", async () => {
    registerMock.mockResolvedValue("error");
    render(<RegisterForm onCheckEmail={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "bob@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "longenoughpw" },
    });
    const submit = screen.getByRole("button", { name: /^Зареєструватися$/ });
    submit.focus();
    fireEvent.click(submit);

    await waitFor(() => expect(registerMock).toHaveBeenCalled());
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(email));
    expect(email.disabled).toBe(false);
    expect((screen.getByLabelText("Пароль") as HTMLInputElement).disabled).toBe(
      false,
    );
  });
});
