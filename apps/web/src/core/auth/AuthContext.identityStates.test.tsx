// @vitest-environment jsdom
/**
 * Явні стани ідентичності `AuthContext` (аудит 2026-10-01, logic-01 і
 * rel-02): до цього будь-яка помилка `me` читалась як «не автентифікований».
 *
 *  - 401 → `unauthenticated`;
 *  - 403 `account_pending_deletion` → `pending_deletion` + `pendingDeletion`;
 *  - 5xx / 429 / мережа / битий JSON → НЕ вихід: `loading` +
 *    `serverUnavailable` на пристрої з власником-користувачем, без
 *    identity-wipe, з перезапитом `me`;
 *  - після відновлення `me` користувач повертається.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
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

const USER = {
  id: "u-1",
  email: "a@b.c",
  name: "A",
  image: null,
  emailVerified: true,
  createdAt: "2026-01-15T08:30:00.000Z",
};

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

function makeWrapper() {
  const client = new QueryClient();
  const clearSpy = vi.spyOn(client, "clear");
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  return { Wrapper, clearSpy };
}

/** Пристрій, на якому раніше входив користувач (власник штампований). */
function stampUserOwner() {
  reconcileChatOwnerOnAuthChange(USER.id);
}

describe("AuthContext: стани ідентичності", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useUserMock.mockReset();
    clearPersistedQueryCacheMock.mockClear();
  });

  it("401 → unauthenticated, без банера «сервер недоступний»", () => {
    failed(http(401, { error: "Unauthorized" }));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.serverUnavailable).toBe(false);
    expect(result.current.pendingDeletion).toBeNull();
  });

  it("403 account_pending_deletion → pending_deletion з датою з тіла 403", () => {
    failed(
      http(403, {
        code: "account_pending_deletion",
        scheduledPurgeAt: "2026-10-31T10:00:00.000Z",
      }),
    );
    const { Wrapper, clearSpy } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.status).toBe("pending_deletion");
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.pendingDeletion).toEqual({
      scheduledPurgeAt: "2026-10-31T10:00:00.000Z",
    });
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("403 з іншим кодом лишається виходом, а не вікном видалення", () => {
    failed(http(403, { code: "FORBIDDEN" }));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.pendingDeletion).toBeNull();
  });

  it.each([
    ["500", http(500, { error: "db" })],
    ["503", http(503)],
    ["429", http(429)],
    [
      "мережа",
      new ApiError({ kind: "network", message: "offline", url: "/api/v1/me" }),
    ],
    [
      "битий JSON",
      new ApiError({
        kind: "parse",
        message: "bad json",
        status: 200,
        url: "/api/v1/me",
      }),
    ],
  ])(
    "%s на пристрої з власником-користувачем: loading + serverUnavailable, без identity-wipe",
    (_label, error) => {
      stampUserOwner();
      failed(error);
      const { Wrapper, clearSpy } = makeWrapper();
      const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
      expect(result.current.status).toBe("loading");
      expect(result.current.status).not.toBe("unauthenticated");
      expect(result.current.isLoading).toBe(true);
      expect(result.current.serverUnavailable).toBe(true);
      expect(clearSpy).not.toHaveBeenCalled();
      expect(clearPersistedQueryCacheMock).not.toHaveBeenCalled();
    },
  );

  it("збій me на анонімному пристрої не вішає спінер: unauthenticated без банера", () => {
    failed(http(500));
    const { Wrapper, clearSpy } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.serverUnavailable).toBe(false);
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("після відновлення me користувач повертається, а стан збою знімається", () => {
    stampUserOwner();
    failed(http(500));
    const { Wrapper, clearSpy } = makeWrapper();
    const { result, rerender } = renderHook(() => useAuth(), {
      wrapper: Wrapper,
    });
    expect(result.current.serverUnavailable).toBe(true);

    useUserMock.mockReturnValue({
      data: { user: USER },
      isLoading: false,
      isPending: false,
      error: null,
    });
    rerender();

    expect(result.current.status).toBe("authenticated");
    expect(result.current.user).toEqual(USER);
    expect(result.current.serverUnavailable).toBe(false);
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("повтор me під час збою: перезапит із відступом, що росте, і без нього на 401/403", () => {
    stampUserOwner();
    failed(http(500));
    const { Wrapper } = makeWrapper();
    const { rerender } = renderHook(() => useAuth(), { wrapper: Wrapper });
    const lastOpts = () =>
      useUserMock.mock.calls.at(-1)?.[0] as {
        retry: (n: number, e: unknown) => boolean;
        refetchInterval: number | false;
      };

    expect(lastOpts().refetchInterval).toBe(5_000);
    // Повтор усередині циклу: лише для «недоступно», до двох разів.
    expect(lastOpts().retry(0, http(500))).toBe(true);
    expect(lastOpts().retry(1, http(429))).toBe(true);
    expect(
      lastOpts().retry(
        0,
        new ApiError({ kind: "network", message: "x", url: "/" }),
      ),
    ).toBe(true);
    expect(lastOpts().retry(2, http(500))).toBe(false);
    expect(lastOpts().retry(0, http(401))).toBe(false);
    expect(lastOpts().retry(0, http(403))).toBe(false);
    expect(
      lastOpts().retry(
        0,
        new ApiError({ kind: "aborted", message: "x", url: "/" }),
      ),
    ).toBe(false);

    // Наступний збій (новий обʼєкт помилки) подовжує паузу.
    failed(http(500));
    rerender();
    expect(lastOpts().refetchInterval).toBe(10_000);

    // 401 зупиняє перезапит.
    failed(http(401));
    rerender();
    expect(lastOpts().refetchInterval).toBe(false);
  });
});
