// @vitest-environment jsdom
/**
 * Аудит 2026-10-01, `sec-41` (рішення власника 2026-11-21): PIN-креденшел
 * акаунта стирається при БУДЬ-ЯКОМУ виході, а не лише з екрана замка. Раніше
 * звичайний вихід із налаштувань лишав на пристрої сіль і PBKDF2-хеш PIN.
 *
 * Справжній `AuthProvider` і справжній `lockStorage` поверх fake-indexeddb;
 * підміняються лише мережа, SW і стирання SQLite.
 */
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IDBFactory } from "fake-indexeddb";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("../app/swControl", () => ({
  swClearCaches: async () => undefined,
  swSetActiveUser: async () => undefined,
  onSwControllerChange: () => () => undefined,
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
import { hasPinSet, savePinHash } from "../security/lockStorage";

type AuthContextValue = ReturnType<typeof useAuth>;
const holder: { current: AuthContextValue | null } = { current: null };

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

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

beforeEach(() => {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
  flushMock.mockReset();
  flushMock.mockResolvedValue({ pending: 0, unknown: false });
  signOutMock.mockClear();
  wipeMock.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
});

describe("logout() — стирання PIN-креденшела (sec-41)", () => {
  it("звичайний вихід стирає PIN вийденого акаунта і не чіпає чужий слот", async () => {
    await savePinHash("1234", "u-1");
    await savePinHash("5678", "u-2");
    render(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );

    let done: boolean | undefined;
    await act(async () => {
      done = await holder.current!.logout();
    });

    expect(done).toBe(true);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(await hasPinSet("u-1")).toBe(false);
    // Партиції per-user (audit F16): інший акаунт на спільному пристрої
    // свій PIN зберігає.
    expect(await hasPinSet("u-2")).toBe(true);
  }, 30_000);
});
