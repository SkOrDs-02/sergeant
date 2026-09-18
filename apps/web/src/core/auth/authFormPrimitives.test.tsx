// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  FieldError,
  PasswordStrengthBar,
  PasswordVisibilityToggle,
} from "./authFormPrimitives";

afterEach(() => cleanup());

describe("FieldError", () => {
  it("renders nothing when message is undefined", () => {
    const { container } = render(<FieldError message={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders alert with id when message is provided", () => {
    render(<FieldError id="field-err" message="Помилка" />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Помилка");
    expect(alert.id).toBe("field-err");
  });
});

describe("PasswordStrengthBar", () => {
  it("renders nothing for empty password", () => {
    const { container } = render(<PasswordStrengthBar password="" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows weak label for single-class password", () => {
    render(<PasswordStrengthBar password="aaaaaaaaaa" />);
    expect(screen.getByText("Слабкий")).toBeTruthy();
  });

  it("shows strong label for mixed-class password", () => {
    render(<PasswordStrengthBar password="Aa1!Aa1!Aa1!" />);
    expect(screen.getByText("Надійний")).toBeTruthy();
  });
});

describe("PasswordVisibilityToggle", () => {
  it("toggles via onToggle and exposes aria-pressed", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <PasswordVisibilityToggle visible={false} onToggle={onToggle} />,
    );

    const showBtn = screen.getByRole("button", { name: "Показати пароль" });
    expect(showBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(showBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<PasswordVisibilityToggle visible onToggle={onToggle} />);
    const hideBtn = screen.getByRole("button", { name: "Сховати пароль" });
    expect(hideBtn.getAttribute("aria-pressed")).toBe("true");
  });
});
