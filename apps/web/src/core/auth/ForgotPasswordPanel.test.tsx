// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { UseForgotPasswordResult } from "./useForgotPassword";
import { ForgotPasswordPanel } from "./ForgotPasswordPanel";

afterEach(() => cleanup());

function makeState(
  overrides: Partial<UseForgotPasswordResult> = {},
): UseForgotPasswordResult {
  return {
    showForgot: true,
    forgotState: "idle",
    forgotEmail: "",
    setForgotEmail: vi.fn(),
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    submit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ForgotPasswordPanel", () => {
  it("renders idle form with email input and submit button", () => {
    const state = makeState({ forgotEmail: "user@example.com" });
    render(<ForgotPasswordPanel state={state} authError={null} />);

    expect(screen.getByRole("group", { name: /Скидання пароля/ })).toBeTruthy();
    const email = screen.getByLabelText(
      "Email для скидання",
    ) as HTMLInputElement;
    expect(email.value).toBe("user@example.com");
    expect(screen.getByRole("button", { name: /Надіслати лист/ })).toBeTruthy();
  });

  it("calls setForgotEmail on input change", () => {
    const setForgotEmail = vi.fn();
    const state = makeState({ setForgotEmail });
    render(<ForgotPasswordPanel state={state} authError={null} />);

    fireEvent.change(screen.getByLabelText("Email для скидання"), {
      target: { value: "new@example.com" },
    });
    expect(setForgotEmail).toHaveBeenCalled();
  });

  it("shows authError linked via aria-describedby", () => {
    const state = makeState();
    render(
      <ForgotPasswordPanel
        state={state}
        authError="Введи email, на який відправити лист."
      />,
    );

    const email = screen.getByLabelText("Email для скидання");
    expect(email.getAttribute("aria-describedby")).toBe(
      "auth-forgot-email-error",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Введи email, на який відправити лист.",
    );
  });

  it("invokes submit on send click", () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const state = makeState({ submit });
    render(<ForgotPasswordPanel state={state} authError={null} />);

    fireEvent.click(screen.getByRole("button", { name: /Надіслати лист/ }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("shows loading state and disables email while sending", () => {
    const state = makeState({ forgotState: "sending" });
    render(<ForgotPasswordPanel state={state} authError={null} />);

    expect(screen.getByRole("button", { name: /Завантаження/ })).toBeTruthy();
    expect(
      (screen.getByLabelText("Email для скидання") as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });

  it("renders sent confirmation and closePanel on back", () => {
    const closePanel = vi.fn();
    const state = makeState({ forgotState: "sent", closePanel });
    render(<ForgotPasswordPanel state={state} authError={null} />);

    expect(screen.getByText(/якщо такий email зареєстровано/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Назад до входу/ }));
    expect(closePanel).toHaveBeenCalledTimes(1);
  });
});
