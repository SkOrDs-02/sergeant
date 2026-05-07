// @vitest-environment jsdom
//
// Regression test for the production toast
// `[body.token] Invalid input: expected string, received undefined`
// that the user reported when clicking "Завершити" in profile sessions.
//
// Better Auth's `/revoke-session` endpoint validates the body with
// `z.object({ token: z.string() })` (see
// `node_modules/better-auth/dist/api/routes/session.mjs`). The component
// previously passed `{ id }`, which lands as `body.token === undefined`
// and surfaces as the user-visible toast above. We pin the contract here
// so a future refactor cannot regress to `{ id }` silently.

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const listSessionsMock = vi.fn<() => Promise<{ data: unknown[] }>>();
const revokeSessionMock = vi.fn<(d: unknown) => Promise<{ error: null }>>();
const getSessionMock = vi.fn<() => Promise<unknown>>();

vi.mock("../auth/authClient.js", () => ({
  listSessions: () => listSessionsMock(),
  revokeSession: (data: unknown) => revokeSessionMock(data),
  getSession: () => getSessionMock(),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success: toastSuccessMock, error: toastErrorMock }),
}));

import { SessionsSection } from "./SessionsSection";

const SAMPLE_SESSION = {
  id: "sess_abc",
  token: "tok_def",
  userId: "u-1",
  expiresAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date(),
  updatedAt: new Date(),
  ipAddress: "127.0.0.1",
  userAgent: "Safari/604.1",
};

describe("SessionsSection — revoke flow", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    listSessionsMock.mockResolvedValue({ data: [SAMPLE_SESSION] });
    revokeSessionMock.mockResolvedValue({ error: null });
    getSessionMock.mockResolvedValue({
      data: {
        session: { id: SAMPLE_SESSION.id },
        user: { id: SAMPLE_SESSION.userId },
      },
    });
  });

  it("calls revokeSession with the session token (NOT the id)", async () => {
    render(<SessionsSection online={true} />);

    // Wait for listSessions to populate the row.
    const revokeButton = await screen.findByRole("button", {
      name: /Завершити/i,
    });

    fireEvent.click(revokeButton);

    await waitFor(() => expect(revokeSessionMock).toHaveBeenCalledTimes(1));
    expect(revokeSessionMock).toHaveBeenCalledWith({ token: "tok_def" });
    // Critical contract pin — `id` must NOT be passed.
    expect(revokeSessionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.anything() }),
    );
  });

  it("removes the session from the list and shows a success toast on success", async () => {
    render(<SessionsSection online={true} />);

    const revokeButton = await screen.findByRole("button", {
      name: /Завершити/i,
    });

    fireEvent.click(revokeButton);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("Сесію завершено"),
    );
    // After success the row is gone — fallback empty-state copy renders.
    expect(await screen.findByText(/Немає сесій/i)).toBeTruthy();
  });

  it("surfaces server error message in a toast on failure", async () => {
    revokeSessionMock.mockResolvedValueOnce({
      error: { message: "boom" },
    } as never);
    render(<SessionsSection online={true} />);

    const revokeButton = await screen.findByRole("button", {
      name: /Завершити/i,
    });

    fireEvent.click(revokeButton);

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("boom"));
  });
});

describe("SessionsSection — «Цей пристрій» badge + last-seen (PR-10)", () => {
  const CHROME_WIN =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
  const SAFARI_IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const FIREFOX_LINUX =
    "Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0";

  function buildSessions() {
    // Прив'язуємо `updatedAt` до реального часу замість fake-timers, бо
    // `vi.useFakeTimers()` ламає `Promise.all` всередині `load()`
    // (`microtaskQueueMicrotask` чекає на тики таймерів, які ніколи не
    // приходять, → тест таймаутиться). Інтервали достатньо великі, щоб
    // toleruvati ~ms drift між побудовою і рендером.
    const now = Date.now();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);
    yesterday.setHours(20, 0, 0, 0);
    return [
      {
        id: "sess_current",
        token: "tok_current",
        userId: "u-1",
        expiresAt: new Date(now + 86_400_000),
        createdAt: new Date(now - 6 * 86_400_000),
        // 5 хвилин тому → minute-grained Intl формат
        updatedAt: new Date(now - 5 * 60_000),
        ipAddress: "127.0.0.1",
        userAgent: CHROME_WIN,
      },
      {
        id: "sess_iphone",
        token: "tok_iphone",
        userId: "u-1",
        expiresAt: new Date(now + 86_400_000),
        createdAt: yesterday,
        // вчора о 20:00 → «Вчора о …»
        updatedAt: yesterday,
        ipAddress: "10.0.0.5",
        userAgent: SAFARI_IPHONE,
      },
      {
        id: "sess_linux",
        token: "tok_linux",
        userId: "u-1",
        expiresAt: new Date(now + 86_400_000),
        createdAt: new Date(now - 3 * 86_400_000),
        // 3 дні тому → «3 дні тому»
        updatedAt: new Date(now - 3 * 86_400_000),
        ipAddress: "10.0.0.6",
        userAgent: FIREFOX_LINUX,
      },
    ];
  }

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    listSessionsMock.mockResolvedValue({ data: buildSessions() });
    revokeSessionMock.mockResolvedValue({ error: null });
    getSessionMock.mockResolvedValue({
      data: {
        session: { id: "sess_current" },
        user: { id: "u-1" },
      },
    });
  });

  it("renders 3 sessions with parsed UA labels", async () => {
    render(<SessionsSection online={true} />);

    expect(await screen.findByText("Chrome 132 на Windows")).toBeTruthy();
    expect(screen.getByText("Safari 17 на iPhone")).toBeTruthy();
    expect(screen.getByText("Firefox 122 на Linux")).toBeTruthy();
  });

  it("tags only the current session with the «Цей пристрій» badge", async () => {
    render(<SessionsSection online={true} />);

    // Знаходимо рядок поточної сесії за UA → у цьому рядку має бути бейдж.
    const currentRow = (
      await screen.findByText("Chrome 132 на Windows")
    ).closest("li");
    if (!currentRow) throw new Error("current session row missing");
    expect(within(currentRow).getByText("Цей пристрій")).toBeTruthy();

    // Інша сесія — без бейджа.
    const otherRow = screen.getByText("Safari 17 на iPhone").closest("li");
    if (!otherRow) throw new Error("non-current session row missing");
    expect(within(otherRow).queryByText("Цей пристрій")).toBeNull();
  });

  it("renders human-readable last-seen lines for all 3 sessions", async () => {
    render(<SessionsSection online={true} />);

    // Поточна — minute-grained relative copy.
    const currentRow = (
      await screen.findByText("Chrome 132 на Windows")
    ).closest("li");
    expect(within(currentRow as HTMLElement).getByText(/хвилин/i)).toBeTruthy();

    // Вчора — anchored.
    const iphoneRow = screen.getByText("Safari 17 на iPhone").closest("li");
    expect(within(iphoneRow as HTMLElement).getByText(/Вчора о/)).toBeTruthy();

    // 3 дні тому — N днів.
    const linuxRow = screen.getByText("Firefox 122 на Linux").closest("li");
    expect(
      within(linuxRow as HTMLElement).getByText(/(дні|днів|день).*тому/),
    ).toBeTruthy();
  });
});
