// @vitest-environment jsdom
/**
 * Офлайн холодний старт (`docs/work/specs/offline-cold-start.md`, крок 2):
 * мережева помилка `me` на пристрої власника відкриває застосунок з
 * особистістю зі штампа, якщо жоден запобіжник не спрацював.
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

vi.mock("@shared/lib/api/queryClientPersister", () => ({
  clearPersistedQueryCache: () => Promise.resolve(),
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
import * as posthog from "../observability/posthog";
import * as purgeLocalData from "../../shared/lib/storage/purgeLocalData";
import * as swControl from "../app/swControl";
import {
  OFFLINE_IDENTITY_MAX_AGE_MS,
  noteMeOk,
  notePendingDeletion,
} from "./offlineIdentity";
import { markPendingSignOut } from "./pendingSignOut";
import {
  hasSessionExpiredMarker,
  markSessionExpired,
} from "./sessionExpiredMarker";

const identifyMock = vi.spyOn(posthog, "identifyPostHogUser");
const purgeMock = vi.spyOn(purgeLocalData, "purgeAppOwnedLocalData");
const swSetActiveUserMock = vi.spyOn(swControl, "swSetActiveUser");
const swClearCachesMock = vi.spyOn(swControl, "swClearCaches");

const USER = {
  id: "u-1",
  email: "a@b.c",
  name: "A",
  image: null,
  emailVerified: true,
  createdAt: "2026-01-15T08:30:00.000Z",
};

const networkError = () =>
  new ApiError({ kind: "network", message: "offline", url: "/api/v1/me" });

function offline() {
  useUserMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isPending: false,
    error: networkError(),
  });
}

function online(user: typeof USER) {
  useUserMock.mockReturnValue({
    data: { user },
    dataUpdatedAt: Date.now(),
    isLoading: false,
    isPending: false,
    error: null,
  });
}

function http(status: number) {
  return new ApiError({ kind: "http", message: "x", status, url: "/" });
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

/** Пристрій власника з живою `me` годину тому. */
function ownerDevice() {
  reconcileChatOwnerOnAuthChange(USER.id);
  noteMeOk(Date.now() - 60 * 60 * 1000);
}

const reloadMock = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  useUserMock.mockReset();
  for (const m of [
    identifyMock,
    purgeMock,
    swSetActiveUserMock,
    swClearCachesMock,
    reloadMock,
  ]) {
    m.mockReset();
  }
  identifyMock.mockImplementation(() => undefined);
  purgeMock.mockResolvedValue(undefined);
  swSetActiveUserMock.mockResolvedValue(undefined);
  swClearCachesMock.mockResolvedValue(undefined);
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

describe("AuthContext: офлайн холодний старт", () => {
  it("мережа + штамп + свіжа мітка → authenticated з мінімальним user", async () => {
    ownerDevice();
    offline();
    const { Wrapper, clearSpy } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    expect(result.current.status).toBe("authenticated");
    expect(result.current.user).toEqual({
      id: USER.id,
      email: null,
      name: null,
      image: null,
      emailVerified: false,
      createdAt: null,
    });
    expect(result.current.offlineIdentity).toBe(true);
    expect(result.current.serverUnavailable).toBe(false);
    expect(result.current.isLoading).toBe(false);
    await waitFor(() =>
      expect(swSetActiveUserMock).toHaveBeenCalledWith(USER.id),
    );
    expect(identifyMock).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it.each([
    ["штамп анонімний", () => reconcileChatOwnerOnAuthChange(null)],
    ["штампа немає", () => undefined],
  ])("%s → unauthenticated", (_label, stamp) => {
    stamp();
    noteMeOk(Date.now());
    offline();
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.offlineIdentity).toBe(false);
  });

  it("sec-07 (вихід не дійшов до сервера) → unauthenticated", () => {
    ownerDevice();
    markPendingSignOut();
    offline();
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
  });

  it.each([
    ["sec-18 «сесія завершилась»", () => markSessionExpired()],
    [
      "мітка старша за 7 діб",
      () => noteMeOk(Date.now() - OFFLINE_IDENTITY_MAX_AGE_MS - 1),
    ],
    [
      "мітка з майбутнього (годинник перевели назад)",
      () => noteMeOk(Date.now() + 24 * 60 * 60 * 1000),
    ],
    [
      "мітки немає",
      () => window.localStorage.removeItem("auth_last_me_ok_at_v1"),
    ],
  ])("%s → блокер «сервер недоступний»", (_label, guard) => {
    ownerDevice();
    guard();
    offline();
    const { Wrapper, clearSpy } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.status).toBe("loading");
    expect(result.current.serverUnavailable).toBe(true);
    expect(result.current.offlineIdentity).toBe(false);
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["503", http(503)],
    ["429", http(429)],
    ["parse", new ApiError({ kind: "parse", message: "x", url: "/" })],
    ["aborted", new ApiError({ kind: "aborted", message: "x", url: "/" })],
  ])("%s при свіжій мітці лишається блокером", (_label, error) => {
    ownerDevice();
    useUserMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: false,
      error,
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.status).toBe("loading");
    expect(result.current.serverUnavailable).toBe(true);
    expect(result.current.offlineIdentity).toBe(false);
  });

  it("маркер видалення → pending_deletion з датою з маркера", () => {
    ownerDevice();
    notePendingDeletion("2026-12-01T00:00:00.000Z");
    offline();
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.status).toBe("pending_deletion");
    expect(result.current.pendingDeletion).toEqual({
      scheduledPurgeAt: "2026-12-01T00:00:00.000Z",
    });
    expect(result.current.user).toBeNull();
    expect(result.current.serverUnavailable).toBe(false);
  });

  it("маркер видалення без дати → блокер, не офлайн-режим", () => {
    ownerDevice();
    notePendingDeletion(null);
    offline();
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.status).toBe("loading");
    expect(result.current.serverUnavailable).toBe(true);
  });

  it("мережу не ретраїмо в межах циклу, але перезапитуємо з відступом", () => {
    ownerDevice();
    offline();
    const { Wrapper } = makeWrapper();
    renderHook(() => useAuth(), { wrapper: Wrapper });
    const opts = useUserMock.mock.calls.at(-1)?.[0] as {
      retry: (n: number, e: unknown) => boolean;
      refetchInterval: number | false;
    };
    expect(opts.retry(0, networkError())).toBe(false);
    expect(opts.refetchInterval).toBe(5_000);
  });
});

describe("AuthContext: офлайн → мережа повернулась", () => {
  it("200 той самий id: offlineIdentity знято, identify один раз", async () => {
    ownerDevice();
    offline();
    const { Wrapper, clearSpy } = makeWrapper();
    const { result, rerender } = renderHook(() => useAuth(), {
      wrapper: Wrapper,
    });
    expect(result.current.offlineIdentity).toBe(true);

    online(USER);
    rerender();
    expect(result.current.offlineIdentity).toBe(false);
    expect(result.current.user).toEqual(USER);
    await waitFor(() => expect(identifyMock).toHaveBeenCalledTimes(1));
    rerender();
    expect(identifyMock).toHaveBeenCalledTimes(1);
    expect(identifyMock.mock.calls[0]?.[0]).toBe(USER.id);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("200 інший id: identity-wipe з teardown і reload", async () => {
    ownerDevice();
    offline();
    const { Wrapper, clearSpy } = makeWrapper();
    const { rerender } = renderHook(() => useAuth(), { wrapper: Wrapper });

    online({ ...USER, id: "u-2" });
    rerender();
    await waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1));
    expect(clearSpy).toHaveBeenCalled();
    expect(purgeMock).toHaveBeenCalledTimes(1);
    expect(hasSessionExpiredMarker()).toBe(false);
  });

  it("503 посеред офлайн-режиму: застосунок лишається відкритим", () => {
    ownerDevice();
    offline();
    const { Wrapper, clearSpy } = makeWrapper();
    const { result, rerender } = renderHook(() => useAuth(), {
      wrapper: Wrapper,
    });
    expect(result.current.offlineIdentity).toBe(true);

    useUserMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: false,
      error: http(503),
    });
    rerender();
    expect(result.current.status).toBe("authenticated");
    expect(result.current.offlineIdentity).toBe(true);
    expect(result.current.user?.id).toBe(USER.id);
    expect(result.current.serverUnavailable).toBe(false);
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("401: teardown, маркер «сесія завершилась», reload", async () => {
    ownerDevice();
    offline();
    const { Wrapper } = makeWrapper();
    const { result, rerender } = renderHook(() => useAuth(), {
      wrapper: Wrapper,
    });

    useUserMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: false,
      error: http(401),
    });
    rerender();
    expect(result.current.status).toBe("unauthenticated");
    await waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1));
    expect(purgeMock).toHaveBeenCalledTimes(1);
    expect(hasSessionExpiredMarker()).toBe(true);
  });
});
