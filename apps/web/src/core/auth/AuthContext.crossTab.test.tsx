// @vitest-environment jsdom
/**
 * priv-02 (аудит 2026-10-01, залишок після #1337): вихід або втрата сесії в
 * одній вкладці через BroadcastChannel приводить решту вкладок цього браузера
 * з активним користувачем до signed-out + локального teardown + екрана входу.
 * SQLite-партицію ця гілка не стирає (priv-05).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

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
import { SESSION_BROADCAST_CHANNEL } from "./sessionBroadcast";
import { SIGN_IN_PATH } from "../app/appPaths";
import * as purgeLocalData from "../../shared/lib/storage/purgeLocalData";
import * as swControl from "../app/swControl";
import * as sqlite from "../db/sqlite";

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

function signedIn() {
  useUserMock.mockReturnValue({
    data: { user: USER_X },
    isLoading: false,
    isPending: false,
    error: null,
  });
}

function anonymous() {
  useUserMock.mockReturnValue({
    data: undefined,
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

/** «Інша вкладка»: окремий екземпляр каналу з чужим `from`. */
function otherTabPostsSessionEnded() {
  const other = new BroadcastChannel(SESSION_BROADCAST_CHANNEL);
  other.postMessage({ type: "session-ended", from: "some-other-tab" });
  other.close();
}

const assignMock = vi.fn();
const realLocation = window.location;

describe("AuthContext: вихід в іншій вкладці (priv-02, BroadcastChannel)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUserMock.mockReset();
    for (const m of [
      clearPersistedQueryCacheMock,
      purgeMock,
      swClearCachesMock,
      swSetActiveUserMock,
      wipeSqliteDbMock,
      setSqliteUserMock,
      assignMock,
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
      value: { ...realLocation, assign: assignMock, reload: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  it("чужий сигнал: вкладка з користувачем розлогінюється, чистить локальні дані й іде на вхід, SQLite не стирає", async () => {
    signedIn();
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    expect(result.current.status).toBe("authenticated");

    otherTabPostsSessionEnded();

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN_PATH));
    expect(result.current.status).toBe("unauthenticated");
    expect(purgeMock).toHaveBeenCalledTimes(1);
    expect(swClearCachesMock).toHaveBeenCalledWith("user");
    expect(swSetActiveUserMock).toHaveBeenCalledWith(null);
    expect(clearPersistedQueryCacheMock).toHaveBeenCalledTimes(1);
    expect(wipeSqliteDbMock).not.toHaveBeenCalled();
    expect(setSqliteUserMock).not.toHaveBeenCalled();
    expect(purgeMock.mock.invocationCallOrder[0]).toBeLessThan(
      assignMock.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("анонімна вкладка ігнорує чужий вихід: нічого не стирається", async () => {
    anonymous();
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    expect(result.current.status).toBe("unauthenticated");

    otherTabPostsSessionEnded();

    await new Promise((r) => setTimeout(r, 50));
    expect(purgeMock).not.toHaveBeenCalled();
    expect(swClearCachesMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("сторонні повідомлення на каналі ігноруються", async () => {
    signedIn();
    renderHook(() => useAuth(), { wrapper: wrapper() });

    const other = new BroadcastChannel(SESSION_BROADCAST_CHANNEL);
    other.postMessage({ type: "something-else", from: "x" });
    other.postMessage("session-ended");
    other.postMessage(null);
    other.close();

    await new Promise((r) => setTimeout(r, 50));
    expect(purgeMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("власний logout() сигналить іншим вкладкам, а сама вкладка не реагує на свій сигнал двічі", async () => {
    signedIn();
    const listener = new BroadcastChannel(SESSION_BROADCAST_CHANNEL);
    const received: unknown[] = [];
    listener.onmessage = (e: MessageEvent) => received.push(e.data);

    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.logout({ skipUnsyncedLossPrompt: true });
    });

    await waitFor(() => expect(received.length).toBe(1));
    expect(received[0]).toMatchObject({ type: "session-ended" });
    // logout сам стирає SQLite один раз; крос-табова гілка в цій вкладці мовчить.
    expect(wipeSqliteDbMock).toHaveBeenCalledTimes(1);
    expect(purgeMock).toHaveBeenCalledTimes(1);
    listener.close();
  });
});
