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

const achievementMock = vi.fn();
vi.mock("@shared/components/ui/CelebrationModal", () => ({
  useCelebration: () => ({
    achievement: achievementMock,
    CelebrationComponent: null,
  }),
  CelebrationModal: () => null,
}));

import { RegisterForm } from "./RegisterForm";

afterEach(() => cleanup());

beforeEach(() => {
  registerMock.mockReset();
  achievementMock.mockReset();
  authErrorState = null;
});

describe("RegisterForm", () => {
  it("enforces 10-char password minimum", async () => {
    render(<RegisterForm onAlreadyRegistered={vi.fn()} />);

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
    render(<RegisterForm onAlreadyRegistered={vi.fn()} />);

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

  it("uses trimmed name when provided", async () => {
    registerMock.mockResolvedValue(true);
    render(<RegisterForm onAlreadyRegistered={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Ім'я"), {
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

  it("calls onAlreadyRegistered when email is already registered", async () => {
    const onAlreadyRegistered = vi.fn();
    registerMock.mockResolvedValue(false);
    authErrorState = "Цей email вже зареєстровано";

    render(<RegisterForm onAlreadyRegistered={onAlreadyRegistered} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "dup@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "longenoughpw" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Зареєструватися$/ }));

    await waitFor(() => {
      expect(onAlreadyRegistered).toHaveBeenCalled();
    });
    expect(achievementMock).not.toHaveBeenCalled();
  });

  it("shows authError alert on server failure", async () => {
    registerMock.mockResolvedValue(false);
    authErrorState = "Щось пішло не так";
    render(<RegisterForm onAlreadyRegistered={vi.fn()} />);

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
    render(<RegisterForm onAlreadyRegistered={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "Aa1!Aa1!Aa1!" },
    });
    expect(screen.getByText("Надійний")).toBeTruthy();
  });
});
