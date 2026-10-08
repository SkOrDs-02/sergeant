// @vitest-environment jsdom
/**
 * Аудит 2026-10-01, `priv-04`: вихід мусить зняти web-push підписку ДО
 * `signOut()` (серверний `unregister` потребує живої сесії), а збій чи завис
 * мережі не має блокувати вихід.
 *
 * Справжній `AuthProvider` + справжні `releasePushOnLogout` і
 * `usePushNotifications.webpush` і справжній api-client; підміняється лише
 * мережа (`fetch`), `PushManager` та `serviceWorker.ready`.
 */
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { flushMock, signOutMock, wipeMock, unsubscribeMock } = vi.hoisted(
  () => ({
    flushMock: vi.fn(),
    signOutMock: vi.fn(async () => undefined),
    wipeMock: vi.fn(async () => undefined),
    unsubscribeMock: vi.fn(),
  }),
);

/** Мережа: `POST /api/v1/push/unregister`. Решта запитів — порожній 200. */
const fetchMock = vi.fn();
const unregisterMock = vi.fn();

/** Порядок викликів між мережею, локальною підпискою й виходом. */
const calls: string[] = [];

vi.mock("./authClient.js", () => ({
  signIn: { email: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
  signOut: () => {
    calls.push("signOut");
    return signOutMock();
  },
  requestPasswordReset: vi.fn(),
}));
vi.mock("../syncEngine/flushBeforeLogout", () => ({
  flushPendingSyncOpsBeforeLogout: () => flushMock(),
}));
// Тест не про SW-кеші: їхній обмін повідомленнями тягне власні таймери.
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
import { PUSH_SUB_KEY } from "@shared/hooks/pushSubscribedFlag";
import {
  PUSH_RELEASE_TOTAL_TIMEOUT_MS,
  PUSH_UNREGISTER_TIMEOUT_MS,
} from "./releasePushOnLogout";

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

const ENDPOINT = "https://push.example/endpoint-of-user-a";
const originalSw = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
const hadPushManager = "PushManager" in window;

function installPushEnv(hasSubscription = true) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () =>
            hasSubscription
              ? { endpoint: ENDPOINT, unsubscribe: unsubscribeMock }
              : null,
        },
      }),
    },
  });
  (window as unknown as { PushManager: unknown }).PushManager = class {};
}

beforeEach(() => {
  calls.length = 0;
  flushMock.mockReset();
  flushMock.mockResolvedValue({ pending: 0, unknown: false });
  signOutMock.mockClear();
  wipeMock.mockClear();
  const json = { "content-type": "application/json" };
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.includes("/push/unregister")) {
        return new Response("{}", { status: 200, headers: json });
      }
      const result = await unregisterMock(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: json,
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  unregisterMock.mockReset();
  unregisterMock.mockImplementation(async () => {
    calls.push("unregister");
    return { ok: true, platform: "web" };
  });
  unsubscribeMock.mockReset();
  unsubscribeMock.mockImplementation(async () => {
    calls.push("unsubscribe");
    return true;
  });
  window.localStorage.setItem(PUSH_SUB_KEY, "1");
  installPushEnv();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalSw) Object.defineProperty(navigator, "serviceWorker", originalSw);
  else
    delete (navigator as unknown as Record<string, unknown>)["serviceWorker"];
  if (!hadPushManager) {
    delete (window as unknown as Record<string, unknown>)["PushManager"];
  }
});

function mountProvider() {
  render(
    <Wrapper>
      <Probe />
    </Wrapper>,
  );
}

describe("logout() — зняття web-push підписки (priv-04)", () => {
  it("знімає серверний рядок і локальну підписку ДО signOut, скидає мітку тумблера", async () => {
    mountProvider();

    let done: boolean | undefined;
    await act(async () => {
      done = await holder.current!.logout();
    });

    expect(done).toBe(true);
    expect(unregisterMock).toHaveBeenCalledTimes(1);
    expect(unregisterMock.mock.calls[0]?.[0]).toEqual({
      platform: "web",
      endpoint: ENDPOINT,
    });
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["unregister", "unsubscribe", "signOut"]);
    expect(window.localStorage.getItem(PUSH_SUB_KEY)).toBeNull();
  });

  it("збій unregister не блокує вихід: підписка знімається локально, signOut відбувається", async () => {
    unregisterMock.mockRejectedValue(new Error("network down"));
    mountProvider();

    let done: boolean | undefined;
    await act(async () => {
      done = await holder.current!.logout();
    });

    expect(done).toBe(true);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(wipeMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(PUSH_SUB_KEY)).toBeNull();
  });

  it("завислий unregister впирається в таймаут і не блокує вихід", async () => {
    unregisterMock.mockImplementation(() => new Promise(() => undefined));
    mountProvider();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    let done: boolean | undefined;
    let finished = false;
    const pending = act(async () => {
      done = await holder.current!.logout();
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(PUSH_UNREGISTER_TIMEOUT_MS - 100);
    expect(finished).toBe(false);
    expect(signOutMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    await pending;

    expect(finished).toBe(true);
    expect(done).toBe(true);
    expect(PUSH_UNREGISTER_TIMEOUT_MS).toBeLessThan(
      PUSH_RELEASE_TOTAL_TIMEOUT_MS,
    );
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(PUSH_SUB_KEY)).toBeNull();
  });

  it("serviceWorker.ready, що не резолвиться, впирається в загальну стелю й не блокує вихід", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: new Promise(() => undefined) },
    });
    mountProvider();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    let done: boolean | undefined;
    let finished = false;
    const pending = act(async () => {
      done = await holder.current!.logout();
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(PUSH_RELEASE_TOTAL_TIMEOUT_MS - 100);
    expect(finished).toBe(false);
    expect(signOutMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    await pending;

    expect(done).toBe(true);
    expect(unregisterMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(PUSH_SUB_KEY)).toBeNull();
  });

  it("без підписки unregister не викликається, але вихід і скидання мітки відбуваються", async () => {
    installPushEnv(false);
    mountProvider();

    await act(async () => {
      await holder.current!.logout();
    });

    expect(unregisterMock).not.toHaveBeenCalled();
    expect(unsubscribeMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(PUSH_SUB_KEY)).toBeNull();
  });

  it("«Залишитись» у діалозі втрати: підписка лишається цілою", async () => {
    flushMock.mockResolvedValue({ pending: 2, unknown: false });
    mountProvider();

    let pendingLogout!: Promise<boolean>;
    await act(async () => {
      pendingLogout = holder.current!.logout();
    });
    expect(unregisterMock).not.toHaveBeenCalled();
    expect(unsubscribeMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PUSH_SUB_KEY)).toBe("1");
    // Діалог лишається відкритим; тест завершується без відповіді.
    void pendingLogout;
  });
});
