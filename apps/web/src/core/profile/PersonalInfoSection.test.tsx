// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ApiError } from "@sergeant/api-client";

/**
 * Regression tests for `PersonalInfoSection` — name save, email change, and
 * send-verification flows. These had zero coverage; the suite pins the
 * current Better-Auth `{ error }`-return behaviour so a future refactor
 * (e.g. migrating to `useApiForm`, card E6) has a safety net.
 *
 * Better-Auth `authClient` calls are mocked directly (they return
 * `{ data | error }`, never throw). Avatar compression (`./avatar`) is
 * stubbed so the canvas path is out of scope here.
 */

const updateUserMock = vi.fn();
const putAvatarMock = vi.fn();
const deleteAvatarMock = vi.fn();
const refreshSessionMock = vi.fn(async () => {});
vi.mock("@shared/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/api")>()),
  meApi: {
    putAvatar: (blob: unknown) => putAvatarMock(blob),
    deleteAvatar: () => deleteAvatarMock(),
  },
}));
const changeEmailMock = vi.fn();
const sendVerificationEmailMock = vi.fn();
vi.mock("../auth/authClient", () => ({
  updateUser: (args: unknown) => updateUserMock(args),
  refreshSessionCookieCache: () => refreshSessionMock(),
  changeEmail: (args: unknown) => changeEmailMock(args),
  sendVerificationEmail: (args: unknown) => sendVerificationEmailMock(args),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: toastErrorMock,
    info: vi.fn(),
  }),
}));

const STUB_BLOB = new Blob([new Uint8Array([1, 2, 3])], {
  type: "image/webp",
});
vi.mock("./avatar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./avatar")>()),
  assertAvatarFile: vi.fn(),
  compressAvatar: vi.fn(async () => STUB_BLOB),
}));

import { PersonalInfoSection } from "./PersonalInfoSection";
import type { ProfileUser } from "./types";

const BASE_USER: ProfileUser = {
  name: "Олег",
  email: "oleg@example.com",
  emailVerified: true,
  image: null,
} as ProfileUser;

function renderSection(overrides: Partial<ProfileUser> = {}, online = true) {
  const onRefresh = vi.fn(async () => {});
  const user = { ...BASE_USER, ...overrides } as ProfileUser;
  render(
    <PersonalInfoSection user={user} online={online} onRefresh={onRefresh} />,
  );
  return { onRefresh };
}

beforeEach(() => {
  updateUserMock.mockReset();
  putAvatarMock.mockReset();
  deleteAvatarMock.mockReset();
  refreshSessionMock.mockClear();
  changeEmailMock.mockReset();
  sendVerificationEmailMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PersonalInfoSection — name save", () => {
  it("Зберегти is disabled until the name changes", () => {
    renderSection();
    const save = screen.getByRole("button", { name: "Зберегти" });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Імʼя"), {
      target: { value: "Олександр" },
    });
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });

  it("happy path: updateUser({name}) + success toast + onRefresh", async () => {
    updateUserMock.mockResolvedValue({ data: { ok: true }, error: null });
    const { onRefresh } = renderSection();

    fireEvent.change(screen.getByLabelText("Імʼя"), {
      target: { value: "  Олександр  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({ name: "Олександр" });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Імʼя оновлено");
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("error path: updateUser returns { error } → inline error message, no success toast", async () => {
    // After the useApiForm migration (F7, 2026-06-03), server errors from
    // updateUser are thrown as Error objects inside onSubmit. useApiForm
    // catches them and surfaces the message via `serverError` (rendered
    // inline in the form), not via toast.error. This matches the UX pattern
    // used by LoginForm and WaitlistForm.
    updateUserMock.mockResolvedValue({
      error: { code: "BAD", message: "nope" },
    });
    renderSection();

    fireEvent.change(screen.getByLabelText("Імʼя"), {
      target: { value: "Новеімʼя" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalled();
    });
    // Error surfaces inline (mapApiErrorToUserCopy fallback for unknown code).
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("does not save a whitespace-only name", async () => {
    renderSection();
    fireEvent.change(screen.getByLabelText("Імʼя"), {
      target: { value: "   " },
    });
    const save = screen.getByRole("button", { name: "Зберегти" });
    // dirty (differs from "Олег") so enabled, but handler bails on empty trim.
    fireEvent.click(save);
    await new Promise((r) => setTimeout(r, 30));
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("offline disables the save button", () => {
    renderSection({}, false);
    fireEvent.change(screen.getByLabelText("Імʼя"), {
      target: { value: "Інше" },
    });
    expect(
      (screen.getByRole("button", { name: "Зберегти" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("PersonalInfoSection — email change", () => {
  it("Змінити reveals the email editor; happy path calls changeEmail", async () => {
    changeEmailMock.mockResolvedValue({ data: { ok: true }, error: null });
    const { onRefresh } = renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    const emailInput = screen.getByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "new@example.com" } });
    // sec-06: сервер вимагає поточний пароль; поле йде в тіло запиту.
    fireEvent.change(screen.getByLabelText("Поточний пароль"), {
      target: { value: "current-pass" },
    });

    // The email editor's own "Зберегти" (second submit on screen).
    const saves = screen.getAllByRole("button", { name: "Зберегти" });
    fireEvent.click(saves[saves.length - 1]!);

    await waitFor(() => {
      expect(changeEmailMock).toHaveBeenCalledWith({
        newEmail: "new@example.com",
        password: "current-pass",
      });
    });
    // Verified account → Better Auth sends a confirmation to the CURRENT
    // address first; the address does not change until that link is clicked.
    // The copy has to say so, otherwise the user watches the old email sit in
    // the field and assumes the save silently failed.
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Лист підтвердження надіслано на поточну адресу",
      );
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  /**
   * The other Better Auth branch: with an unverified current address the
   * verification goes to the NEW inbox, and since sec-06 (owner decision
   * 2026-10-23, `updateEmailWithoutVerification: false`) the address changes
   * only after that click. Same `{ status: true }` on the wire, so the
   * component branches on `emailVerified` — pin both arms. Без пароля (акаунт
   * лише з Google) поле `password` у тіло не йде.
   */
  it("unverified account gets the new-inbox copy; no password → no field", async () => {
    changeEmailMock.mockResolvedValue({ data: { ok: true }, error: null });
    const { onRefresh } = renderSection({ emailVerified: false });

    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    const saves = screen.getAllByRole("button", { name: "Зберегти" });
    fireEvent.click(saves[saves.length - 1]!);

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Лист підтвердження надіслано на нову адресу",
      );
    });
    expect(changeEmailMock).toHaveBeenCalledWith({
      newEmail: "new@example.com",
    });
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  /**
   * Regression anchor for the shipped bug: `user.changeEmail` was never
   * configured on the server, so this endpoint answered `400
   * CHANGE_EMAIL_DISABLED` every single time. The server-side guard lives in
   * `apps/server/src/auth.test.ts`; here we only pin that the code reaches the
   * user as Ukrainian copy rather than the generic fallback.
   */
  it("CHANGE_EMAIL_DISABLED surfaces its own Ukrainian copy", async () => {
    changeEmailMock.mockResolvedValue({
      error: {
        code: "CHANGE_EMAIL_DISABLED",
        message: "Change email is disabled",
      },
    });
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    const saves = screen.getAllByRole("button", { name: "Зберегти" });
    fireEvent.click(saves[saves.length - 1]!);

    await waitFor(() => {
      expect(
        screen.getByText("Зміна email тимчасово недоступна."),
      ).toBeTruthy();
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  /**
   * `sec-06`: сервер віддає `403 SESSION_NOT_FRESH` непідтвердженому акаунту
   * зі старою сесією. Користувач має побачити прохання увійти знову, а не
   * generic «Не вдалося змінити email», і жодного success-тосту.
   */
  it("SESSION_NOT_FRESH просить увійти знову", async () => {
    changeEmailMock.mockResolvedValue({
      error: { code: "SESSION_NOT_FRESH", message: "Session is not fresh" },
    });
    renderSection({ emailVerified: false });

    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    const saves = screen.getAllByRole("button", { name: "Зберегти" });
    fireEvent.click(saves[saves.length - 1]!);

    await waitFor(() => {
      expect(
        screen.getByText("Для цієї дії потрібен свіжий вхід. Увійди ще раз."),
      ).toBeTruthy();
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("email save stays disabled when the value equals the current email", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    // Editor pre-fills newEmail with the current email → save disabled.
    const saves = screen.getAllByRole("button", { name: "Зберегти" });
    expect((saves[saves.length - 1] as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("PersonalInfoSection — avatar", () => {
  function avatarInput(): HTMLInputElement {
    return document.querySelector(
      'input[type="file"][accept="image/*"]',
    ) as HTMLInputElement;
  }

  it("uploads a compressed avatar as a raw Blob (happy path), НЕ через updateUser", async () => {
    putAvatarMock.mockResolvedValue({
      image: "/api/avatar/u1?v=1",
      updatedAt: "2026-10-20T10:00:00.000Z",
    });
    const { onRefresh } = renderSection();

    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(avatarInput(), { target: { files: [file] } });

    await waitFor(() => {
      expect(putAvatarMock).toHaveBeenCalledWith(STUB_BLOB);
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Аватар оновлено");
      expect(onRefresh).toHaveBeenCalled();
      expect(refreshSessionMock).toHaveBeenCalled();
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it.each([
    [413, "завелике"],
    [415, "JPEG, PNG або WebP"],
  ])(
    "%i від сервера: чесний error-тост, жодного success-тосту",
    async (status, text) => {
      putAvatarMock.mockRejectedValue(
        new ApiError({
          kind: "http",
          message: "x",
          status,
          url: "/api/avatar",
        }),
      );
      const { onRefresh } = renderSection();

      const file = new File(["x"], "a.png", { type: "image/png" });
      fireEvent.change(avatarInput(), { target: { files: [file] } });

      await waitFor(() => {
        expect(toastErrorMock).toHaveBeenCalledWith(
          expect.stringContaining(text),
          undefined,
          expect.objectContaining({ label: "Обрати інший" }),
        );
      });
      expect(toastSuccessMock).not.toHaveBeenCalled();
      expect(onRefresh).not.toHaveBeenCalled();
    },
  );

  it("мережева помилка: error-тост з «Повторити», success-тосту нема", async () => {
    putAvatarMock.mockRejectedValue(
      new ApiError({ kind: "network", message: "offline", url: "/api/avatar" }),
    );
    renderSection();

    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(avatarInput(), { target: { files: [file] } });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("зʼєднання"),
        undefined,
        expect.objectContaining({ label: "Повторити" }),
      );
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("зовнішній https-аватар (OAuth) малюється як є, наш /api/avatar - через API", () => {
    renderSection({ image: "https://lh3.googleusercontent.com/a/x" });
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "https://lh3.googleusercontent.com/a/x",
    );
    cleanup();
    renderSection({ image: "/api/avatar/u1?v=1" });
    expect(document.querySelector("img")?.getAttribute("src")).toMatch(
      /\/api\/v1\/avatar\/u1\?v=1$/,
    );
  });

  it("confirm + remove avatar calls DELETE /api/avatar", async () => {
    deleteAvatarMock.mockResolvedValue({ ok: true });
    renderSection({ image: "/api/avatar/u1?v=1" });

    fireEvent.click(screen.getByRole("button", { name: "Видалити фото" }));
    fireEvent.click(screen.getByRole("button", { name: "Так" }));

    await waitFor(() => {
      expect(deleteAvatarMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Аватар видалено");
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("DELETE впав - error-тост без success", async () => {
    deleteAvatarMock.mockRejectedValue(new Error("boom"));
    renderSection({ image: "/api/avatar/u1?v=1" });

    fireEvent.click(screen.getByRole("button", { name: "Видалити фото" }));
    fireEvent.click(screen.getByRole("button", { name: "Так" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Не вдалося видалити аватар",
        undefined,
        expect.objectContaining({ label: "Повторити" }),
      );
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("can cancel the avatar-remove confirmation", () => {
    renderSection({ image: "/api/avatar/u1?v=1" });
    fireEvent.click(screen.getByRole("button", { name: "Видалити фото" }));
    fireEvent.click(screen.getByRole("button", { name: "Ні" }));
    expect(
      screen.getByRole("button", { name: "Видалити фото" }),
    ).toBeInTheDocument();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("renders the name initial when no avatar image is set", () => {
    renderSection({ image: null, name: "Олег" });
    // Hero shows the uppercased first letter as a fallback avatar.
    expect(screen.getByText("О")).toBeInTheDocument();
  });
});

describe("PersonalInfoSection — email verification", () => {
  it("unverified user sees the banner; Надіслати calls sendVerificationEmail", async () => {
    sendVerificationEmailMock.mockResolvedValue({ error: null });
    renderSection({ emailVerified: false });

    fireEvent.click(screen.getByRole("button", { name: "Надіслати" }));

    await waitFor(() => {
      expect(sendVerificationEmailMock).toHaveBeenCalledWith({
        email: "oleg@example.com",
      });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Лист підтвердження надіслано",
      );
    });
  });
});
