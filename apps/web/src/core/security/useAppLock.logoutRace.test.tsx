// @vitest-environment jsdom
/**
 * sec-12/priv-14, зауваження перевірки: `signOut()` замка мусить стерти
 * PIN-креденшел ДО навігації, яку робить справжній `logout()`.
 *
 * `logout()` завершується `location.assign(SIGN_IN_PATH)` — повним
 * вивантаженням документа. IndexedDB-транзакція, запущена після `await
 * logout()`, переривається разом із ним: запис `failed >= 10` вціліває, і
 * повторний вхід знову показує `lockedOut`. Тест бере справжні `AuthProvider`,
 * `useAppLock` і `lockStorage` (fake-indexeddb); підмінено лише мережу
 * (`signOut` клієнта, `useUser`), SW і SQLite та сама навігація: вона
 * відрізає IndexedDB, як це робить вивантаження документа.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

vi.mock("../auth/authClient.js", () => ({
  signIn: { email: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
  signOut: vi.fn(async () => undefined),
  requestPasswordReset: vi.fn(),
}));
vi.mock("../syncEngine/flushBeforeLogout", () => ({
  flushPendingSyncOpsBeforeLogout: async () => ({ pending: 0, unknown: false }),
}));
vi.mock("../app/swControl", () => ({
  swClearCaches: async () => undefined,
  swSetActiveUser: async () => undefined,
  onSwControllerChange: () => () => undefined,
}));
vi.mock("../db/sqlite", async () => {
  const real =
    await vi.importActual<typeof import("../db/sqlite")>("../db/sqlite");
  return {
    ...real,
    wipeSqliteDb: vi.fn(async () => undefined),
    setSqliteUser: vi.fn(),
  };
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

import { AuthProvider } from "../auth/AuthContext";
import {
  __seedAttemptStateForTests,
  hasPinSet,
  MAX_FAILED_UNLOCK_ATTEMPTS,
  readLockStatus,
  savePinHash,
} from "./lockStorage";
import { useAppLock } from "./useAppLock";

const realLocation = window.location;
const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("useAppLock.signOut() + справжній logout(): гонка зі стиранням PIN", () => {
  let freshIdb: IDBFactory;
  const assignMock = vi.fn();

  beforeEach(() => {
    freshIdb = new IDBFactory();
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = freshIdb;
    window.localStorage.clear();
    assignMock.mockReset();
    // Навігація вивантажує документ: з цього моменту будь-яка робота з
    // IndexedDB падає (у браузері транзакції переривається).
    assignMock.mockImplementation(() => {
      (globalThis as { indexedDB?: unknown }).indexedDB = {
        open() {
          throw new Error("document unloaded");
        },
        deleteDatabase() {
          throw new Error("document unloaded");
        },
      };
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, assign: assignMock },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  });

  it("креденшел lockedOut-користувача стертий до навігації: повторний вхід не повертає lockedOut", async () => {
    await savePinHash("9876", "u-1");
    await __seedAttemptStateForTests(
      MAX_FAILED_UNLOCK_ATTEMPTS,
      undefined,
      "u-1",
    );
    const { result } = renderHook(() => useAppLock(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("lockedOut"));

    let done = false;
    await act(async () => {
      done = await result.current.signOut();
    });
    expect(done).toBe(true);
    expect(assignMock).toHaveBeenCalledTimes(1);

    // Новий «документ» після навігації бачить ту саму базу.
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = freshIdb;
    expect(await hasPinSet("u-1")).toBe(false);
    expect(await readLockStatus("u-1")).toMatchObject({
      hasPin: false,
      lockedOut: false,
    });
  }, 30_000);
});
