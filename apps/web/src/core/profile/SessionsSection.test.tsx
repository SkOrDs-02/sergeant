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
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigateMock };
});

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

const logoutMock = vi.fn<() => Promise<void>>();
vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ logout: logoutMock }),
}));

// F1 (review): the unsynced-loss gate for a CURRENT-session revoke now
// runs BEFORE `revokeSession` — via a direct call to this helper, not
// via `logout()`'s `confirmUnsyncedLoss` option (which only fires AFTER
// the session would already be dead). Default: nothing pending, so most
// tests below proceed straight through without ever seeing the dialog.
const flushPendingSyncOpsMock =
  vi.fn<() => Promise<{ pending: number; unknown: boolean }>>();
vi.mock("../syncEngine/flushBeforeLogout.js", () => ({
  flushPendingSyncOpsBeforeLogout: () => flushPendingSyncOpsMock(),
}));

import { SessionsSection } from "./SessionsSection";

function renderSection(online: boolean) {
  return render(
    <MemoryRouter>
      <SessionsSection online={online} />
    </MemoryRouter>,
  );
}

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
    flushPendingSyncOpsMock.mockResolvedValue({
      pending: 0,
      unknown: false,
    });
  });

  it("calls revokeSession with the session token (NOT the id)", async () => {
    renderSection(true);

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

  it("shows a success toast on success", async () => {
    renderSection(true);

    const revokeButton = await screen.findByRole("button", {
      name: /Завершити/i,
    });

    fireEvent.click(revokeButton);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("Сесію завершено"),
    );
  });

  // Regression test: `SAMPLE_SESSION` is also the CURRENT session here
  // (`getSessionMock` resolves the same `id`). Revoking your own current
  // session destroys it server-side, but React Query / the Better Auth
  // cookie cache still held the old `me` payload — the UI kept rendering
  // as "logged in" until a manual reload. The fix routes a current-session
  // revoke through the full `logout()` teardown + redirect to sign-in
  // instead of a bare local list filter.
  it("revoking the CURRENT session logs out and redirects to sign-in", async () => {
    logoutMock.mockResolvedValue(undefined);
    renderSection(true);

    const revokeButton = await screen.findByRole("button", {
      name: /Завершити/i,
    });

    fireEvent.click(revokeButton);

    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/sign-in", { replace: true }),
    );
  });

  // Review finding: a rejected getSession() used to degrade silently into
  // "no session is current" — revoking the actual current session then
  // skipped the logout() teardown. In that blind state revocation must be
  // blocked until a successful refresh.
  it("blocks revocation with a hint when the current-session lookup fails", async () => {
    getSessionMock.mockRejectedValueOnce(new Error("network down"));
    renderSection(true);

    const revokeButton = await screen.findByRole("button", {
      name: /Завершити/i,
    });
    expect(
      screen.getByText(/Не вдалося визначити сесію цього пристрою/),
    ).toBeTruthy();
    expect(revokeButton).toBeDisabled();

    fireEvent.click(revokeButton);
    await waitFor(() => expect(revokeSessionMock).not.toHaveBeenCalled());
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it("maps Better Auth error code into a UA toast on failure", async () => {
    // F5 (web-frontend-ergonomics-roast): сирий `error.message` тепер
    // прокидується через `mapApiErrorToUserCopy`. Сервер віддає `code`
    // (`SESSION_NOT_FRESH` Better Auth), мапер повертає UA-копію — і
    // саме її ми очікуємо у toast-і.
    revokeSessionMock.mockResolvedValueOnce({
      error: { code: "SESSION_NOT_FRESH", message: "Session is not fresh" },
    } as never);
    renderSection(true);

    const revokeButton = await screen.findByRole("button", {
      name: /Завершити/i,
    });

    fireEvent.click(revokeButton);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Для цієї дії потрібен свіжий вхід. Увійди ще раз.",
        undefined,
        expect.objectContaining({ label: "Повторити" }),
      ),
    );
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
    // Привʼязуємо `updatedAt` до реального часу замість fake-timers, бо
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
    flushPendingSyncOpsMock.mockResolvedValue({
      pending: 0,
      unknown: false,
    });
  });

  it("renders 3 sessions with parsed UA labels", async () => {
    renderSection(true);

    expect(await screen.findByText("Chrome 132 на Windows")).toBeTruthy();
    expect(screen.getByText("Safari 17 на iPhone")).toBeTruthy();
    expect(screen.getByText("Firefox 122 на Linux")).toBeTruthy();
  });

  // Non-current sessions keep the pre-existing local-removal behavior —
  // only a CURRENT-session revoke should trigger the full logout flow.
  it("revoking a NON-current session removes it locally without logging out", async () => {
    renderSection(true);

    const iphoneRow = (await screen.findByText("Safari 17 на iPhone")).closest(
      "li",
    );
    if (!iphoneRow) throw new Error("non-current session row missing");
    const revokeButton = within(iphoneRow).getByRole("button", {
      name: /Завершити/i,
    });

    fireEvent.click(revokeButton);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("Сесію завершено"),
    );
    expect(screen.queryByText("Safari 17 на iPhone")).toBeNull();
    // The remaining two sessions are untouched, and no logout/redirect fired.
    expect(screen.getByText("Chrome 132 на Windows")).toBeTruthy();
    expect(screen.getByText("Firefox 122 на Linux")).toBeTruthy();
    expect(logoutMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("tags only the current session with the «Цей пристрій» badge", async () => {
    renderSection(true);

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
    renderSection(true);

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

// L-18: "Завершити" на ПОТОЧНІЙ сесії стирало локальну SQLite (разом із
// чергою синхронізації) через `logout()` без жодного попередження про
// незбережені записи — на відміну від кнопки «Вийти» на ProfilePage, яка
// таке попередження вже мала (через `confirmUnsyncedLoss`). Пінимо, що
// SessionsSection тепер прокидує той самий гейт.
//
// F1 (review): the gate must run BEFORE `revokeSession` is even called,
// not after — so these tests drive it via `flushPendingSyncOpsMock`
// directly (the real pre-revoke check) instead of via `logout()`'s
// `confirmUnsyncedLoss` option, which the fixed code no longer passes.
describe("SessionsSection — L-18 unsynced-loss gate for current-session revoke", () => {
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
    logoutMock.mockResolvedValue(undefined);
  });

  it("shows the «Є незбережені записи» dialog BEFORE revoking anything, and does NOT navigate while it's open", async () => {
    flushPendingSyncOpsMock.mockResolvedValue({ pending: 3, unknown: false });
    renderSection(true);

    const revokeButton = await screen.findByRole("button", {
      name: /Завершити/i,
    });
    fireEvent.click(revokeButton);

    expect(await screen.findByText("Є незбережені записи")).toBeTruthy();
    // F6: 3 is the Ukrainian "few" form — "записи", not "записів".
    expect(
      screen.getByText(/3 записи ще не збережено на сервері/),
    ).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
    // F1 regression pin: the dialog must appear BEFORE the session is
    // touched — not merely before the redirect.
    expect(revokeSessionMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it("cancelling («Залишитись») keeps the session genuinely alive — revokeSession is NEVER called, no navigate, no crash", async () => {
    flushPendingSyncOpsMock.mockResolvedValue({ pending: 2, unknown: false });
    renderSection(true);

    fireEvent.click(await screen.findByRole("button", { name: /Завершити/i }));
    // `ConfirmDialog` renders the scrim as a SECOND element with the same
    // accessible name (`aria-label={cancelLabel}`) — scope to the
    // `alertdialog` container so we press the visible Cancel button, not
    // the backdrop.
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Залишитись" }));

    await waitFor(() =>
      expect(screen.queryByText("Є незбережені записи")).toBeNull(),
    );
    expect(navigateMock).not.toHaveBeenCalled();
    // F5 (review): the OLD test here only asserted "no navigate", which
    // stayed true regardless of revoke-ordering and so never caught F1.
    // The real invariant a cancel must guarantee is that the session was
    // never touched in the first place.
    expect(revokeSessionMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it("confirming («Все одно завершити») revokes the session THEN proceeds to sign-in", async () => {
    flushPendingSyncOpsMock.mockResolvedValue({ pending: 1, unknown: false });
    renderSection(true);

    fireEvent.click(await screen.findByRole("button", { name: /Завершити/i }));
    // F6: 1 is the "one" form — "1 запис", not "1 записів"/"1 записи".
    expect(
      await screen.findByText(/1 запис ще не збережено на сервері/),
    ).toBeTruthy();
    fireEvent.click(
      await screen.findByRole("button", { name: "Все одно завершити" }),
    );

    await waitFor(() =>
      expect(revokeSessionMock).toHaveBeenCalledWith({
        token: SAMPLE_SESSION.token,
      }),
    );
    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/sign-in", { replace: true }),
    );
  });

  // F4/F6 sibling coverage: the "many" plural form (5+) is also exercised
  // here since only "one" (1) and "few" (3) are covered above.
  it("uses the Ukrainian «many» plural form (5+) in the unsynced-loss copy", async () => {
    flushPendingSyncOpsMock.mockResolvedValue({ pending: 5, unknown: false });
    renderSection(true);

    fireEvent.click(await screen.findByRole("button", { name: /Завершити/i }));

    expect(
      await screen.findByText(/5 записів ще не збережено на сервері/),
    ).toBeTruthy();
  });
});

// L-19: офлайн "Активні сесії" рендерили COPY.empty ("Немає сесій") —
// брехливий порожній стан. `load()` виходить РАНІШЕ будь-якого запиту,
// коли `online === false`, тож старий код ніколи не розрізняв "сервер
// відповів: 0 сесій" від "ми взагалі не питали сервер".
describe("SessionsSection — L-19 offline before first successful load", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows an offline 'could not load' message instead of the empty state", () => {
    renderSection(false);

    expect(
      screen.getByText(/не вдалося завантажити активні сесії/i),
    ).toBeTruthy();
    // The dishonest empty-state copy must NOT appear in its place.
    expect(screen.queryByText("Немає сесій")).toBeNull();
    // And listSessions() must never have been called offline.
    expect(listSessionsMock).not.toHaveBeenCalled();
  });

  it("shows the genuine empty state once a successful ONLINE load actually returns 0 sessions", async () => {
    listSessionsMock.mockResolvedValue({ data: [] });
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const { rerender } = render(
      <MemoryRouter>
        <SessionsSection online={true} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listSessionsMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Немає сесій")).toBeTruthy();

    // Going offline afterwards must not regress the now-confirmed empty
    // state back into the (removed) offline branch.
    rerender(
      <MemoryRouter>
        <SessionsSection online={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Немає сесій")).toBeTruthy();
  });

  // F4 (review): `load()` never re-armed `loading` — it was only ever set
  // from the INITIAL `useState(online)`. A user who opens this section
  // offline (correct honest message) and then reconnects re-enters
  // `load()` with `loading` still `false`; while the now-online fetch is
  // in flight, `sessions` is still `[]` and `everLoaded` still `false`,
  // so the render fell straight through to the dishonest `COPY.empty`
  // for the duration of the request — the exact lie L-19 exists to kill,
  // just shifted to a different window.
  it("does not flash the dishonest empty state while the offline→online transition's first fetch is still in flight", async () => {
    let resolveList!: (v: { data: unknown[] }) => void;
    const listPromise = new Promise<{ data: unknown[] }>((resolve) => {
      resolveList = resolve;
    });
    listSessionsMock.mockReturnValue(listPromise);
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const { rerender } = render(
      <MemoryRouter>
        <SessionsSection online={false} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/не вдалося завантажити активні сесії/i),
    ).toBeTruthy();

    rerender(
      <MemoryRouter>
        <SessionsSection online={true} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(listSessionsMock).toHaveBeenCalledTimes(1));

    // The fetch triggered by the transition is still pending — neither
    // the offline message NOR the dishonest "Немає сесій" empty state
    // may show while we wait for it.
    expect(
      screen.queryByText(/не вдалося завантажити активні сесії/i),
    ).toBeNull();
    expect(screen.queryByText("Немає сесій")).toBeNull();
    expect(screen.getByText("Завантаження…")).toBeTruthy();

    resolveList({ data: [] });
    expect(await screen.findByText("Немає сесій")).toBeTruthy();
  });
});
