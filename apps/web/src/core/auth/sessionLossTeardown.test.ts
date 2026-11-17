// @vitest-environment jsdom
/**
 * Сесія, що протухла без «Вийти», не проходить через `logout()`, а серверний
 * хук на видалення сесії при протуханні cookie не спрацьовує. Тож web-push
 * підписку попереднього користувача мусить зняти саме teardown, локально і
 * без серверного виклику (сесії вже немає, він дав би 401).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/swControl", () => ({
  swClearCaches: async () => undefined,
  swSetActiveUser: async () => undefined,
}));
vi.mock("../../shared/lib/storage/purgeLocalData", () => ({
  purgeAppOwnedLocalData: async () => undefined,
}));

import { PUSH_SUB_KEY } from "@shared/hooks/pushSubscribedFlag";
import { teardownLocalStateAfterSessionLoss } from "./sessionLossTeardown";

const unsubscribeMock = vi.fn(async () => true);
const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
const originalSw = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
const hadPushManager = "PushManager" in window;

beforeEach(() => {
  unsubscribeMock.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => ({
            endpoint: "https://push.example/endpoint-of-user-a",
            unsubscribe: unsubscribeMock,
          }),
        },
      }),
    },
  });
  (window as unknown as { PushManager: unknown }).PushManager = class {};
  window.localStorage.setItem(PUSH_SUB_KEY, "1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalSw) Object.defineProperty(navigator, "serviceWorker", originalSw);
  else
    delete (navigator as unknown as Record<string, unknown>)["serviceWorker"];
  if (!hadPushManager) {
    delete (window as unknown as Record<string, unknown>)["PushManager"];
  }
});

describe("teardownLocalStateAfterSessionLoss", () => {
  it("знімає web-push підписку локально, без серверного unregister", async () => {
    await teardownLocalStateAfterSessionLoss();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PUSH_SUB_KEY)).toBeNull();
  });
});
