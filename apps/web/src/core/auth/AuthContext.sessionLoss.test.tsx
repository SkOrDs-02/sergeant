// @vitest-environment jsdom
/**
 * priv-02 (аудит 2026-10-01): сесія, що закінчилась без «Вийти» (401) або
 * змінилась на іншого користувача, запускає той самий клієнтський teardown,
 * що й `logout()`: purgeAppOwnedLocalData + swClearCaches + swSetActiveUser(null)
 * ДО reload. SQLite-партицію не стираємо (flush без сесії неможливий).
 * Стани «сервер недоступний» (5xx/мережа) і «акаунт у вікні видалення» —
 * НЕ рішення про identity, teardown там заборонений.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@shared/api";

vi.mock("./authClient.js", () => ({
  signIn: { email: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
  signOut: vi.fn(async () => undefined),
  requestPasswordReset: vi.fn(),
}));

const clearPersistedQueryCacheMock = vi.fn(async () => undefined);
vi.mock("@shared/lib/api/queryClientPersister", () => ({
  clearPersistedQueryCache: () => clearPersistedQueryCacheMock(),
}));

const useUserMock = vi.fn();
vi.mock("@sergeant/api-client/react", async () => {
  const real = await vi.importActual<
    typeof import("@sergeant/api-client/react")
  >("@sergeant/api-client/react");
  return { ...real, useUser: (opts?: unknown) => useUserMock(opts) };
});

import { AuthProvider, useAuth } from "./AuthContext";
import { reconcileChatOwnerOnAuthChange } from "../hub/hubChatSessions";
import * as purgeLocalData from "../../shared/lib/storage/purgeLocalData";
import * as swControl from "../app/swControl";
import * as sqlite from "../db/sqlite";

// Шпигуни замість `vi.mock` (cap 5): справжні модулі, лише підміна викликів.
const purgeMock = vi.spyOn(purgeLocalData, "purgeAppOwnedLocalData");
const swClearCachesMock = vi.spyOn(swControl, "swClearCaches");
const swSetActiveUserMock = vi.spyOn(swControl, "swSetActiveUser");
const wipeSqliteDbMock = vi.spyOn(sqlite, "wipeSqliteDb");
const setSqliteUserMock = vi.spyOn(sqlite, "setSqliteUser");

const USER_X = {
  id: "u-x",
  email: "x@b.c",
  name: "X",
  image: null,
  emailVerified: true,
  createdAt: "2026-01-15T08:30:00.000Z",
};
const USER_Y = { ...USER_X, id: "u-y", email: "y@b.c", name: "Y" };

function http(status: number, body?: unknown) {
  return new ApiError({
    kind: "http",
    message: `HTTP ${status}`,
    status,
    body,
    url: "/api/v1/me",
  });
}

function failed(error: unknown) {
  useUserMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isPending: false,
    error,
  });
}

function signedIn(user: typeof USER_X) {
  useUserMock.mockReturnValue({
    data: { user },
    isLoading: false,
    isPending: false,
    error: null,
  });
}

function wrapper() {
  const client = new QueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

const reloadMock = vi.fn();
const realLocation = window.location;

describe("AuthContext: teardown після втрати сесії (priv-02)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useUserMock.mockReset();
    for (const m of [
      clearPersistedQueryCacheMock,
      purgeMock,
      swClearCachesMock,
      swSetActiveUserMock,
      wipeSqliteDbMock,
      setSqliteUserMock,
      reloadMock,
    ]) {
      m.mockReset();
    }
    purgeMock.mockResolvedValue(undefined);
    swClearCachesMock.mockResolvedValue(undefined);
    swSetActiveUserMock.mockResolvedValue(undefined);
    wipeSqliteDbMock.mockResolvedValue(undefined);
    clearPersistedQueryCacheMock.mockResolvedValue(undefined);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, reload: reloadMock },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  it("401 після сесії користувача: purge + SW-кеші + SW-user(null) до reload, SQLite не стирається", async () => {
    reconcileChatOwnerOnAuthChange(USER_X.id);
    failed(http(401, { error: "Unauthorized" }));
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    expect(result.current.status).toBe("unauthenticated");

    await waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1));
    expect(purgeMock).toHaveBeenCalledTimes(1);
    expect(swClearCachesMock).toHaveBeenCalledTimes(1);
    expect(swSetActiveUserMock).toHaveBeenCalledWith(null);
    expect(clearPersistedQueryCacheMock).toHaveBeenCalledTimes(1);
    // Без сесії flush неможливий: партицію попередника не стираємо.
    expect(wipeSqliteDbMock).not.toHaveBeenCalled();
    expect(setSqliteUserMock).not.toHaveBeenCalled();
    // Порядок: teardown повністю завершений ДО reload.
    expect(purgeMock.mock.invocationCallOrder[0]).toBeLessThan(
      reloadMock.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(swSetActiveUserMock.mock.invocationCallOrder[0]).toBeLessThan(
      reloadMock.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("user→user (інший акаунт на тому ж пристрої): той самий teardown до reload", async () => {
    reconcileChatOwnerOnAuthChange(USER_X.id);
    signedIn(USER_Y);
    renderHook(() => useAuth(), { wrapper: wrapper() });

    await waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1));
    expect(purgeMock).toHaveBeenCalledTimes(1);
    expect(swClearCachesMock).toHaveBeenCalledTimes(1);
    expect(swSetActiveUserMock).toHaveBeenCalledWith(null);
    expect(wipeSqliteDbMock).not.toHaveBeenCalled();
  });

  it("збій одного кроку teardown не блокує reload", async () => {
    reconcileChatOwnerOnAuthChange(USER_X.id);
    purgeMock.mockRejectedValueOnce(new Error("idb blocked"));
    swClearCachesMock.mockRejectedValueOnce(new Error("sw dead"));
    failed(http(401));
    renderHook(() => useAuth(), { wrapper: wrapper() });

    await waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1));
    expect(swSetActiveUserMock).toHaveBeenCalledWith(null);
  });

  it.each([
    ["500", http(500, { error: "db" })],
    ["503", http(503)],
    [
      "мережа",
      new ApiError({ kind: "network", message: "offline", url: "/api/v1/me" }),
    ],
  ])(
    "%s на пристрої з власником-користувачем: teardown НЕ запускається",
    async (_label, error) => {
      reconcileChatOwnerOnAuthChange(USER_X.id);
      failed(error);
      const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
      expect(result.current.serverUnavailable).toBe(true);

      await new Promise((r) => setTimeout(r, 20));
      expect(purgeMock).not.toHaveBeenCalled();
      expect(swClearCachesMock).not.toHaveBeenCalled();
      expect(swSetActiveUserMock).not.toHaveBeenCalled();
      expect(wipeSqliteDbMock).not.toHaveBeenCalled();
      expect(reloadMock).not.toHaveBeenCalled();
    },
  );

  it("pending_deletion (403) на пристрої з власником-користувачем: teardown НЕ запускається", async () => {
    reconcileChatOwnerOnAuthChange(USER_X.id);
    failed(
      http(403, {
        code: "account_pending_deletion",
        scheduledPurgeAt: "2026-10-31T10:00:00.000Z",
      }),
    );
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    expect(result.current.status).toBe("pending_deletion");

    await new Promise((r) => setTimeout(r, 20));
    expect(purgeMock).not.toHaveBeenCalled();
    expect(swClearCachesMock).not.toHaveBeenCalled();
    expect(swSetActiveUserMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("anon→user не запускає teardown (міграція анонімних даних)", async () => {
    // Власник не штампований / анонімний.
    signedIn(USER_X);
    renderHook(() => useAuth(), { wrapper: wrapper() });

    await new Promise((r) => setTimeout(r, 20));
    expect(purgeMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
