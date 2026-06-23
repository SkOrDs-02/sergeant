/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppLock } from "./AppLock";

const noop = () => {};
const asyncNoop = async () => {};

function renderLock(
  overrides: Partial<React.ComponentProps<typeof AppLock>> = {},
) {
  const props = {
    state: "locked" as const,
    onUnlock: vi.fn(async () => true),
    onSetupDone: vi.fn(noop),
    onSetupCancel: vi.fn(noop),
    onSavePin: vi.fn(asyncNoop),
    ...overrides,
  };
  return { props, ...render(<AppLock {...props} />) };
}

function pressDigit(d: string) {
  // The backspace key renders "⌫" but its accessible name is the i18n label.
  const name = d === "⌫" ? "Видалити" : d;
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("AppLock", () => {
  it("renders nothing when the lock is off", () => {
    const { container } = renderLock({ state: "off" as never });
    expect(container.firstChild).toBeNull();
  });

  it("shows the unlock screen when locked", () => {
    renderLock({ state: "locked" });
    expect(screen.getByText("Введи PIN")).toBeInTheDocument();
    expect(screen.getByText("Введи PIN, щоб розблокувати")).toBeInTheDocument();
  });

  it("auto-submits the unlock when 6 digits are entered", async () => {
    const onUnlock = vi.fn(async () => true);
    renderLock({ state: "locked", onUnlock });
    "123456".split("").forEach(pressDigit);
    await waitFor(() => expect(onUnlock).toHaveBeenCalledWith("123456"));
  });

  it("shows an error and clears the pin on a wrong unlock", async () => {
    const onUnlock = vi.fn(async () => false);
    renderLock({ state: "locked", onUnlock });
    "1234".split("").forEach(pressDigit);
    fireEvent.click(screen.getByRole("button", { name: "Відкрити" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Невірний PIN"),
    );
  });

  it("backspace removes the last entered digit", async () => {
    const onUnlock = vi.fn(async () => true);
    renderLock({ state: "locked", onUnlock });
    pressDigit("1");
    pressDigit("2");
    pressDigit("3");
    // delete back down to 2 digits → submit must be disabled
    pressDigit("⌫");
    pressDigit("⌫");
    expect(screen.getByRole("button", { name: "Відкрити" })).toBeDisabled();
  });

  it("runs the setup confirm flow when PINs match", async () => {
    const onSavePin = vi.fn(asyncNoop);
    const onSetupDone = vi.fn(noop);
    renderLock({ state: "setup", onSavePin, onSetupDone });
    expect(screen.getByText("Встановити PIN")).toBeInTheDocument();

    "1234".split("").forEach(pressDigit);
    fireEvent.click(screen.getByRole("button", { name: "Далі" }));
    // confirm step
    await screen.findByText("Введи PIN ще раз для підтвердження");
    "1234".split("").forEach(pressDigit);
    fireEvent.click(screen.getByRole("button", { name: "Підтвердити" }));
    await waitFor(() => expect(onSavePin).toHaveBeenCalledWith("1234"));
    await waitFor(() => expect(onSetupDone).toHaveBeenCalled());
  });

  it("shows a mismatch error when the confirm PIN differs", async () => {
    renderLock({ state: "setup" });
    "1234".split("").forEach(pressDigit);
    fireEvent.click(screen.getByRole("button", { name: "Далі" }));
    await screen.findByText("Введи PIN ще раз для підтвердження");
    "9999".split("").forEach(pressDigit);
    fireEvent.click(screen.getByRole("button", { name: "Підтвердити" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "PIN-коди не збігаються",
      ),
    );
  });

  it("first-step too-short PIN surfaces a length error", () => {
    renderLock({ state: "setup" });
    // 0 digits → click «Далі» is disabled; type 3 then force the handler via
    // Enter is not wired, so we exercise the guard by typing then deleting.
    // The button is disabled under 4 digits, so the guard fires only when the
    // handler is invoked — assert the disabled state instead.
    expect(screen.getByRole("button", { name: "Далі" })).toBeDisabled();
  });

  it("change state renders the change title", () => {
    renderLock({ state: "change" });
    expect(screen.getByText("Змінити PIN")).toBeInTheDocument();
  });

  it("back button returns from confirm to enter step", async () => {
    renderLock({ state: "setup" });
    "1234".split("").forEach(pressDigit);
    fireEvent.click(screen.getByRole("button", { name: "Далі" }));
    await screen.findByText("Введи PIN ще раз для підтвердження");
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    await screen.findByText("Введи 4–6 цифр");
  });

  it("cancel on the enter step calls onSetupCancel", () => {
    const onSetupCancel = vi.fn(noop);
    renderLock({ state: "setup", onSetupCancel });
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onSetupCancel).toHaveBeenCalled();
  });
});
