// @vitest-environment jsdom
/**
 * §6 аудиту (2026-08-08): «видалення акаунта (мок `deleteUser` заведено й
 * жодного разу не перевірений)» — `ProfilePage.test.tsx` мокав `deleteUser`
 * від самого початку, але жоден тест його не викликав. Це найнезворотніша
 * дія продукту, тож тут перевіряємо повний контракт: щасливий шлях,
 * скасування, серверну помилку і гейт підтвердження — усе через РЕАЛЬНИЙ
 * `DeleteAccountDialog` (не мок), щоб гейт «без пароля не видалити» був
 * доведений на тому самому DOM, який бачить людина.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastContainer } from "@shared/components/ui/Toast";
import { ToastProvider } from "@shared/hooks/useToast";
import { DangerZoneSection } from "./DangerZoneSection";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigateMock };
});

type DeleteUserResult =
  { error: null } | { error: { code?: string; message?: string } };

const deleteUserMock = vi.fn<(d: unknown) => Promise<DeleteUserResult>>();
const signOutMock = vi.fn<() => Promise<void>>();
vi.mock("../auth/authClient", () => ({
  deleteUser: (data: unknown) => deleteUserMock(data),
  signOut: () => signOutMock(),
}));

function renderSection(
  onLogout: () => Promise<void> = vi.fn(async () => undefined),
  online = true,
) {
  const utils = render(
    <MemoryRouter>
      <ToastProvider>
        <DangerZoneSection online={online} onLogout={onLogout} />
        <ToastContainer />
      </ToastProvider>
    </MemoryRouter>,
  );
  return { ...utils, onLogout };
}

function openDialog(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Видалити акаунт" }));
  return screen.getByRole("dialog", { name: "Видалити акаунт назавжди?" });
}

beforeEach(() => {
  deleteUserMock.mockReset().mockResolvedValue({ error: null });
  signOutMock.mockReset().mockResolvedValue(undefined);
  navigateMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("DangerZoneSection", () => {
  it("disables the trigger button while offline — matches ProfilePage's offline gate", () => {
    renderSection(
      vi.fn(async () => undefined),
      false,
    );
    expect(
      screen.getByRole("button", { name: "Видалити акаунт" }),
    ).toBeDisabled();
  });

  // §6 п.1, гейт підтвердження: не можна видалити акаунт без пароля.
  it("gates the confirm button behind a non-empty password field", () => {
    renderSection();
    const dialog = openDialog();
    const confirmBtn = within(dialog).getByRole("button", {
      name: "Видалити",
    });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Пароль"), {
      target: { value: "secret123" },
    });
    expect(confirmBtn).not.toBeDisabled();
  });

  // §6 п.1, скасування: deleteUser НЕ викликається.
  it("does NOT call deleteUser when the dialog is cancelled", () => {
    renderSection();
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText("Пароль"), {
      target: { value: "secret123" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Скасувати" }));

    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // §6 п.1, щасливий шлях: підтвердження → deleteUser викликано → сесія
  // закривається (signOut + onLogout) → редирект на "/". Фактична
  // поведінка запінена дослівно з `DangerZoneSection.tsx:32-64`.
  it("happy path: confirming with a password deletes the account, signs out, tears down the session and redirects to /", async () => {
    const onLogout = vi.fn(async () => undefined);
    renderSection(onLogout);
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText("Пароль"), {
      target: { value: "secret123" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Видалити" }));

    await waitFor(() =>
      expect(deleteUserMock).toHaveBeenCalledWith({ password: "secret123" }),
    );
    expect(await screen.findByText("Акаунт видалено")).toBeInTheDocument();
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // §6 п.1, помилка сервера: людина бачить помилку, а не мовчазне нічого —
  // діалог лишається відкритим (з уже введеним паролем), і сесія НЕ
  // закривається.
  it("server error: shows a human-readable error toast, keeps the dialog open, and does not sign out or redirect", async () => {
    deleteUserMock.mockResolvedValueOnce({
      error: { code: "INVALID_PASSWORD" },
    });
    const onLogout = vi.fn(async () => undefined);
    renderSection(onLogout);
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText("Пароль"), {
      target: { value: "wrong-pass" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Видалити" }));

    expect(
      await screen.findByText("Невірний поточний пароль."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Видалити акаунт назавжди?" }),
    ).toBeInTheDocument();
    expect(signOutMock).not.toHaveBeenCalled();
    expect(onLogout).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("server error without a mappable code falls back to the generic delete-failure copy", async () => {
    deleteUserMock.mockResolvedValueOnce({ error: {} });
    renderSection();
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText("Пароль"), {
      target: { value: "secret123" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Видалити" }));

    expect(
      await screen.findByText("Не вдалося видалити акаунт"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Видалити акаунт назавжди?" }),
    ).toBeInTheDocument();
  });
});
