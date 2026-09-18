// @vitest-environment jsdom
/**
 * `DeleteAccountDialog` не мала власного тестового файлу (аудит §6,
 * 2026-08-08: «найнебезпечніші дії без тестів»). Це чиста презентаційна
 * компонента — уся мережева логіка живе в `DangerZoneSection` (окремий
 * файл), тут перевіряємо лише контракт: що бачить і чим керує людина, поки
 * відповідає на «Видалити акаунт назавжди?».
 *
 * Ключовий кейс — гейт підтвердження (§6 п.1, останній буллет завдання):
 * кнопка «Видалити» вимкнена, доки поле пароля порожнє. Без цього гейта
 * акаунт можна було б видалити одним кліком без жодного підтвердження.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

afterEach(() => {
  cleanup();
});

function renderDialog(
  overrides: Partial<{
    open: boolean;
    password: string;
    deleting: boolean;
    onPasswordChange: (value: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
  }> = {},
) {
  const props = {
    open: true,
    password: "",
    deleting: false,
    onPasswordChange: vi.fn(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  const utils = render(<DeleteAccountDialog {...props} />);
  return { ...utils, props };
}

describe("DeleteAccountDialog", () => {
  it("renders nothing when open=false", () => {
    const { container } = renderDialog({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the confirmation dialog with an accessible name and a password field when open", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", {
      name: "Видалити акаунт назавжди?",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByLabelText("Пароль")).toBeInTheDocument();
  });

  // §6 п.1: гейт підтвердження — без пароля видалити неможливо.
  it("disables the confirm button while the password field is empty", () => {
    renderDialog({ password: "" });
    expect(screen.getByRole("button", { name: "Видалити" })).toBeDisabled();
  });

  it("enables the confirm button once a password is entered", () => {
    renderDialog({ password: "secret123" });
    expect(screen.getByRole("button", { name: "Видалити" })).not.toBeDisabled();
  });

  it("keeps the confirm button disabled while a delete request is in flight, even with a password present", () => {
    renderDialog({ password: "secret123", deleting: true });
    // `Button`'s `loading` state swaps the accessible name to the sr-only
    // "Завантаження…" live-region text — "Видалити" itself becomes
    // `aria-hidden`, so this query intentionally targets the loading name.
    expect(
      screen.getByRole("button", { name: "Завантаження…" }),
    ).toBeDisabled();
  });

  it("forwards typed input to onPasswordChange", () => {
    const onPasswordChange = vi.fn();
    renderDialog({ onPasswordChange });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "abc" },
    });
    expect(onPasswordChange).toHaveBeenCalledWith("abc");
  });

  it("calls onConfirm exactly once when Видалити is clicked with a password present", () => {
    const onConfirm = vi.fn();
    renderDialog({ password: "secret123", onConfirm });
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Скасувати is clicked", () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the scrim overlay is clicked", () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    fireEvent.click(screen.getByLabelText("Закрити"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on Escape", () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
