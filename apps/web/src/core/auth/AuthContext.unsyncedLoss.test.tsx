// @vitest-environment jsdom
/**
 * Аудит 2026-10-01, `data-19`: підтвердження втрати незасинхронізованого —
 * обов'язкова частина самого `logout()`, а не опція, яку викликач мусить
 * передати. Раніше палітра команд і `PendingDeletionScreen` викликали
 * `logout()` без гака `confirmUnsyncedLoss` і стирали чергу мовчки.
 *
 * Тут справжній `AuthProvider` + справжній (ліниво завантажений) діалог;
 * мокається лише лічильник черги (`flushBeforeLogout`), мережа й SQLite.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { flushMock, signOutMock, wipeMock } = vi.hoisted(() => ({
  flushMock: vi.fn(),
  signOutMock: vi.fn(async () => undefined),
  wipeMock: vi.fn(async () => undefined),
}));

vi.mock("./authClient.js", () => ({
  signIn: { email: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
  signOut: () => signOutMock(),
  requestPasswordReset: vi.fn(),
}));
vi.mock("../syncEngine/flushBeforeLogout", () => ({
  flushPendingSyncOpsBeforeLogout: () => flushMock(),
}));
vi.mock("../db/sqlite", async () => {
  const real =
    await vi.importActual<typeof import("../db/sqlite")>("../db/sqlite");
  return { ...real, wipeSqliteDb: wipeMock, setSqliteUser: vi.fn() };
});
vi.mock("@sergeant/api-client/react", async () => {
  const real = await vi.importActual<
    typeof import("@sergeant/api-client/react")
  >("@sergeant/api-client/react");
  return {
    ...real,
    useUser: () => ({
      data: {
        user: {
          id: "u-1",
          email: "a@b.c",
          name: "A",
          image: null,
          emailVerified: true,
          createdAt: "2026-01-15T08:30:00.000Z",
        },
      },
      isLoading: false,
      isPending: false,
      error: null,
    }),
  };
});

import { AuthProvider, useAuth } from "./AuthContext";

type AuthContextValue = ReturnType<typeof useAuth>;

const holder: { current: AuthContextValue | null } = { current: null };
/** Поточне значення контексту (оновлюється ефектом після кожного рендера). */
const auth = new Proxy({} as AuthContextValue, {
  get: (_t, key: keyof AuthContextValue) => holder.current![key],
});

function Probe() {
  const ctx = useAuth();
  useEffect(() => {
    holder.current = ctx;
  });
  return null;
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

function mountProvider() {
  render(
    <Wrapper>
      <Probe />
    </Wrapper>,
  );
}

beforeEach(() => {
  flushMock.mockReset();
  flushMock.mockResolvedValue({ pending: 0, unknown: false });
  signOutMock.mockClear();
  wipeMock.mockClear();
});

describe("logout() — обов'язкове підтвердження втрати незасинхронізованого", () => {
  it("виходить без жодного діалогу, коли нічого не втрачається", async () => {
    mountProvider();

    let done: boolean | undefined;
    await act(async () => {
      done = await auth.logout();
    });

    expect(done).toBe(true);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(wipeMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("питає САМ — без жодного гака від викликача — і нічого не стирає, доки людина мовчить", async () => {
    flushMock.mockResolvedValue({ pending: 3, unknown: false });
    mountProvider();

    let pendingLogout!: Promise<boolean>;
    await act(async () => {
      pendingLogout = auth.logout();
    });

    const dialog = await screen.findByRole("alertdialog", {
      name: "Є незбережені записи",
    });
    expect(dialog).toHaveTextContent(/3 записи ще не збережено на сервері\./);
    // Поки відповіді немає — сесія жива, нічого не стерто.
    expect(signOutMock).not.toHaveBeenCalled();
    expect(wipeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Залишитись" }));
    await act(async () => {
      await pendingLogout;
    });
  });

  it("«Залишитись»: logout() повертає false, сесія жива, SQLite не стирається", async () => {
    flushMock.mockResolvedValue({ pending: 1, unknown: false });
    mountProvider();

    let pendingLogout!: Promise<boolean>;
    await act(async () => {
      pendingLogout = auth.logout();
    });
    await screen.findByRole("alertdialog", { name: "Є незбережені записи" });
    fireEvent.click(screen.getByRole("button", { name: "Залишитись" }));

    let done: boolean | undefined;
    await act(async () => {
      done = await pendingLogout;
    });

    expect(done).toBe(false);
    expect(signOutMock).not.toHaveBeenCalled();
    expect(wipeMock).not.toHaveBeenCalled();
    expect(auth.status).toBe("authenticated");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("«Все одно вийти»: стирає і повертає true", async () => {
    flushMock.mockResolvedValue({ pending: 5, unknown: false });
    mountProvider();

    let pendingLogout!: Promise<boolean>;
    await act(async () => {
      pendingLogout = auth.logout();
    });
    await screen.findByRole("alertdialog", { name: "Є незбережені записи" });
    fireEvent.click(screen.getByRole("button", { name: "Все одно вийти" }));

    let done: boolean | undefined;
    await act(async () => {
      done = await pendingLogout;
    });

    expect(done).toBe(true);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(wipeMock).toHaveBeenCalledTimes(1);
  });

  it("не питає, коли стан черги невідомий (fail-open: вихід не блокується)", async () => {
    flushMock.mockResolvedValue({ pending: 0, unknown: true });
    mountProvider();

    let done: boolean | undefined;
    await act(async () => {
      done = await auth.logout();
    });

    expect(done).toBe(true);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("skipUnsyncedLossPrompt не чіпає чергу й не питає (сесію вже відкликано / акаунт видалено)", async () => {
    flushMock.mockResolvedValue({ pending: 9, unknown: false });
    mountProvider();

    let done: boolean | undefined;
    await act(async () => {
      done = await auth.logout({ skipUnsyncedLossPrompt: true });
    });

    expect(done).toBe(true);
    expect(flushMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(wipeMock).toHaveBeenCalledTimes(1);
  });

  it("другий паралельний вихід, поки діалог відкритий, не стирає нічого і не відкриває другий діалог", async () => {
    flushMock.mockResolvedValue({ pending: 2, unknown: false });
    mountProvider();

    let first!: Promise<boolean>;
    await act(async () => {
      first = auth.logout();
    });
    await screen.findByRole("alertdialog", { name: "Є незбережені записи" });

    let second: boolean | undefined;
    await act(async () => {
      second = await auth.logout();
    });
    expect(second).toBe(false);
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(wipeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Залишитись" }));
    await act(async () => {
      await first;
    });
  });
});
