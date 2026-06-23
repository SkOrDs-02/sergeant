// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

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
const changeEmailMock = vi.fn();
const sendVerificationEmailMock = vi.fn();
vi.mock("../auth/authClient", () => ({
  updateUser: (args: unknown) => updateUserMock(args),
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

vi.mock("./avatar", () => ({
  assertAvatarFile: vi.fn(),
  compressAvatar: vi.fn(async () => "data:image/png;base64,stub"),
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

    fireEvent.change(screen.getByLabelText("Ім'я"), {
      target: { value: "Олександр" },
    });
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });

  it("happy path: updateUser({name}) + success toast + onRefresh", async () => {
    updateUserMock.mockResolvedValue({ data: { ok: true }, error: null });
    const { onRefresh } = renderSection();

    fireEvent.change(screen.getByLabelText("Ім'я"), {
      target: { value: "  Олександр  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({ name: "Олександр" });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Ім'я оновлено");
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

    fireEvent.change(screen.getByLabelText("Ім'я"), {
      target: { value: "Новеім'я" },
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
    fireEvent.change(screen.getByLabelText("Ім'я"), {
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
    fireEvent.change(screen.getByLabelText("Ім'я"), {
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

    // The email editor's own "Зберегти" (second submit on screen).
    const saves = screen.getAllByRole("button", { name: "Зберегти" });
    fireEvent.click(saves[saves.length - 1]!);

    await waitFor(() => {
      expect(changeEmailMock).toHaveBeenCalledWith({
        newEmail: "new@example.com",
      });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Лист підтвердження нового email надіслано",
      );
      expect(onRefresh).toHaveBeenCalled();
    });
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

  it("uploads a compressed avatar on file change (happy path)", async () => {
    updateUserMock.mockResolvedValue({ data: { ok: true }, error: null });
    const { onRefresh } = renderSection();

    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(avatarInput(), { target: { files: [file] } });

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({
        image: "data:image/png;base64,stub",
      });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Аватар оновлено");
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("surfaces an updateUser error toast on avatar upload failure", async () => {
    updateUserMock.mockResolvedValue({
      error: { code: "BAD", message: "nope" },
    });
    renderSection();

    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(avatarInput(), { target: { files: [file] } });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("confirm + remove avatar calls updateUser({image:null})", async () => {
    updateUserMock.mockResolvedValue({ data: { ok: true }, error: null });
    renderSection({ image: "data:image/png;base64,existing" });

    fireEvent.click(screen.getByRole("button", { name: "Видалити фото" }));
    fireEvent.click(screen.getByRole("button", { name: "Так" }));

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({ image: null });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Аватар видалено");
    });
  });

  it("can cancel the avatar-remove confirmation", () => {
    renderSection({ image: "data:image/png;base64,existing" });
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
