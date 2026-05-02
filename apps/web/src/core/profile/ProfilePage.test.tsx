// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ────────────────────────────────────────────────────

const updateUserMock =
  vi.fn<
    (d: unknown) => Promise<{ error: null } | { error: { message: string } }>
  >();
const changePasswordMock = vi.fn<(d: unknown) => Promise<{ error: null }>>();
const listSessionsMock = vi.fn<() => Promise<{ data: unknown[] }>>();
const revokeSessionMock = vi.fn<(d: unknown) => Promise<{ error: null }>>();
const deleteUserMock = vi.fn<(d: unknown) => Promise<{ error: null }>>();
const signOutMock = vi.fn<() => Promise<void>>();
const sendVerificationEmailMock =
  vi.fn<(d: unknown) => Promise<{ error: null }>>();
const changeEmailMock = vi.fn<(d: unknown) => Promise<{ error: null }>>();

updateUserMock.mockResolvedValue({ error: null });
changePasswordMock.mockResolvedValue({ error: null });
listSessionsMock.mockResolvedValue({ data: [] });
revokeSessionMock.mockResolvedValue({ error: null });
deleteUserMock.mockResolvedValue({ error: null });
signOutMock.mockResolvedValue(undefined);
sendVerificationEmailMock.mockResolvedValue({ error: null });
changeEmailMock.mockResolvedValue({ error: null });

vi.mock("../auth/authClient.js", () => ({
  updateUser: (data: unknown) => updateUserMock(data),
  changePassword: (data: unknown) => changePasswordMock(data),
  listSessions: () => listSessionsMock(),
  revokeSession: (data: unknown) => revokeSessionMock(data),
  deleteUser: (data: unknown) => deleteUserMock(data),
  signOut: () => signOutMock(),
  sendVerificationEmail: (data: unknown) => sendVerificationEmailMock(data),
  changeEmail: (data: unknown) => changeEmailMock(data),
}));

const useOnlineStatusMock = vi.fn(() => true);
vi.mock("@shared/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastShowMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: toastErrorMock,
    show: toastShowMock,
  }),
}));

const mockUser = {
  id: "u-1",
  email: "test@example.com",
  name: "Тест",
  image: null as string | null,
  emailVerified: true,
  createdAt: "2026-01-15T08:30:00.000Z" as string | null,
};
const refreshMock = vi.fn(async () => undefined);
const logoutMock = vi.fn(async () => undefined);

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({
    user: mockUser,
    logout: logoutMock,
    refresh: refreshMock,
    isLoading: false,
    status: "authenticated",
  }),
}));

import { ProfilePage } from "./ProfilePage";

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────

describe("ProfilePage", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
    updateUserMock.mockResolvedValue({ error: null });
    changePasswordMock.mockResolvedValue({ error: null });
    listSessionsMock.mockResolvedValue({ data: [] });
    revokeSessionMock.mockResolvedValue({ error: null });
    deleteUserMock.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue(undefined);
    sendVerificationEmailMock.mockResolvedValue({ error: null });
    changeEmailMock.mockResolvedValue({ error: null });
    useOnlineStatusMock.mockReturnValue(true);
    mockUser.image = null;
    mockUser.name = "Тест";
    mockUser.emailVerified = true;
  });

  describe("rendering", () => {
    it("shows user name and email", () => {
      renderPage();
      expect(screen.getByText("Тест")).toBeInTheDocument();
      const emails = screen.getAllByText("test@example.com");
      expect(emails.length).toBeGreaterThanOrEqual(1);
    });

    it("shows verified badge when emailVerified is true", () => {
      renderPage();
      const badges = screen.getAllByText("Підтверджено");
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it("hides verified badge when emailVerified is false", () => {
      mockUser.emailVerified = false;
      renderPage();
      expect(screen.queryByText("Підтверджено")).not.toBeInTheDocument();
    });

    it("shows initial letter when no avatar image", () => {
      renderPage();
      const avatarBtns = screen.getAllByLabelText("Змінити аватар");
      expect(within(avatarBtns[0]).getByText("Т")).toBeInTheDocument();
    });

    it("shows avatar image when user.image is set", () => {
      mockUser.image = "data:image/webp;base64,abc";
      renderPage();
      const avatarBtns = screen.getAllByLabelText("Змінити аватар");
      const img = avatarBtns[0].querySelector("img");
      expect(img).toBeTruthy();
      expect(img!.getAttribute("src")).toBe("data:image/webp;base64,abc");
    });

    it("shows remove photo link when avatar is set", () => {
      mockUser.image = "data:image/webp;base64,abc";
      renderPage();
      const links = screen.getAllByText("Видалити фото");
      expect(links.length).toBeGreaterThanOrEqual(1);
    });

    it("hides remove photo link when no avatar", () => {
      renderPage();
      expect(screen.queryByText("Видалити фото")).not.toBeInTheDocument();
    });

    it("shows email verification banner when emailVerified is false", () => {
      mockUser.emailVerified = false;
      renderPage();
      // Banner copy was extended in #1067 to include the suffix
      // "— перевірте вашу поштову скриньку"; the action button was renamed
      // from "Надіслати лист" to "Надіслати". Match the prefix via regex.
      expect(screen.getByText(/Email не підтверджено/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Надіслати" }),
      ).toBeInTheDocument();
    });

    it("hides email verification banner when emailVerified is true", () => {
      renderPage();
      expect(
        screen.queryByText(/Email не підтверджено/),
      ).not.toBeInTheDocument();
    });

    it("shows avatar removal confirm when clicking remove photo", () => {
      mockUser.image = "data:image/webp;base64,abc";
      renderPage();
      const links = screen.getAllByText("Видалити фото");
      fireEvent.click(links[0]);
      // Confirm prompt copy changed in #1067 from "Видалити?" to
      // "Видалити фото?".
      expect(screen.getByText("Видалити фото?")).toBeInTheDocument();
    });

    it("shows change email button", () => {
      renderPage();
      expect(
        screen.getByRole("button", { name: "Змінити" }),
      ).toBeInTheDocument();
    });
  });

  describe("offline UX", () => {
    it("shows offline warning banner when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      expect(
        screen.getByText(
          "Ви офлайн — редагування профілю тимчасово недоступне",
        ),
      ).toBeInTheDocument();
    });

    it("hides offline warning banner when online", () => {
      useOnlineStatusMock.mockReturnValue(true);
      renderPage();
      expect(
        screen.queryByText(
          "Ви офлайн — редагування профілю тимчасово недоступне",
        ),
      ).not.toBeInTheDocument();
    });

    it("disables save name button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      const saveBtns = screen.getAllByRole("button", { name: "Зберегти" });
      expect(saveBtns[0]).toBeDisabled();
    });

    it("disables change password button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      const changeBtn = screen.getByRole("button", {
        name: "Змінити пароль",
      });
      expect(changeBtn).toBeDisabled();
    });

    it("disables delete account button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      const deleteBtn = screen.getByRole("button", {
        name: "Видалити акаунт",
      });
      expect(deleteBtn).toBeDisabled();
    });

    it("disables avatar upload button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      const avatarBtns = screen.getAllByLabelText("Змінити аватар");
      expect(avatarBtns[0]).toBeDisabled();
    });

    it("disables email verification button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      mockUser.emailVerified = false;
      renderPage();
      const btn = screen.getByRole("button", { name: "Надіслати" });
      expect(btn).toBeDisabled();
    });

    it("disables change email button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      const btn = screen.getByRole("button", { name: "Змінити" });
      expect(btn).toBeDisabled();
    });
  });

  describe("sessions section", () => {
    it("calls listSessions on mount when online", () => {
      useOnlineStatusMock.mockReturnValue(true);
      renderPage();
      expect(listSessionsMock).toHaveBeenCalled();
    });

    it("does NOT call listSessions when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      expect(listSessionsMock).not.toHaveBeenCalled();
    });

    it("disables refresh button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      const refreshBtn = screen.getByRole("button", { name: "Оновити" });
      expect(refreshBtn).toBeDisabled();
    });
  });

  describe("async safety", () => {
    it("resets name save loading and shows error when updateUser throws", async () => {
      updateUserMock.mockRejectedValueOnce(new Error("network"));
      renderPage();
      const nameInput = screen.getByLabelText("Ім'я");
      fireEvent.change(nameInput, { target: { value: "Нове ім'я" } });

      const saveBtn = screen.getAllByRole("button", { name: "Зберегти" })[0];
      fireEvent.click(saveBtn);

      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith("Не вдалося оновити ім'я"),
      );
      expect(saveBtn).not.toBeDisabled();
    });
  });

  describe("delete account dialog", () => {
    it("uses accessible labels and closes on Escape", () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Видалити акаунт" }));

      const dialog = screen.getByRole("dialog", {
        name: "Видалити акаунт назавжди?",
      });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(within(dialog).getByLabelText("Пароль")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("memory bank", () => {
    it("renders stored profile memory and exposes visible delete action", () => {
      localStorage.setItem(
        "hub_user_profile_v1",
        JSON.stringify([
          {
            id: "mem_1",
            fact: "Не їм арахіс",
            category: "allergy",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ]),
      );

      renderPage();

      expect(screen.getByText("Не їм арахіс")).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Видалити: Не їм арахіс"));
      expect(screen.queryByText("Не їм арахіс")).not.toBeInTheDocument();
    });
  });
});
