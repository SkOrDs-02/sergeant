// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  PushRegisterRequestSchema,
  PushUnregisterRequestSchema,
  type PushRegisterRequest,
  type PushRegisterResponse,
  type PushUnregisterRequest,
  type PushUnregisterResponse,
} from "@sergeant/api-client";
import { ApiClientProvider } from "@sergeant/api-client/react";
import type { ApiClient } from "@sergeant/api-client";

// Mock `@shared/api` — уся web-сторона шарить один `createApiClient(...)`
// інстанс, але у юніт-тестах не хочемо проганяти HTTP-шар: мокаємо
// `pushApi.getVapidPublic` (інші методи pushApi після session-4c не
// використовуються напряму — все йде через уніфіковані `api.push.register`
// / `api.push.unregister` з `@sergeant/api-client/react`-хуків).
vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    pushApi: {
      getVapidPublic: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    },
  };
});

// Mock `@sergeant/shared` tо контролювати `isCapacitor()` / `getPlatform()`
// per-test — інакше native-гілку не перевіриш у jsdom без реального
// Capacitor-рантайму.
vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return {
    ...actual,
    isCapacitor: vi.fn(() => false),
    getPlatform: vi.fn(() => "web"),
  };
});

// Mock native push gate — у юніт-тестах не тягнемо `@sergeant/mobile-shell`
// (workspace-лінк є, але плагін сам кине "not implemented" у jsdom).
vi.mock("@shared/lib/adapters/pushNative", () => ({
  subscribeNativePush: vi.fn(),
  unsubscribeNativePush: vi.fn(),
  getStoredNativePushToken: vi.fn(),
}));

import { usePushNotifications } from "./usePushNotifications";
import { pushApi } from "@shared/api";
import { getPlatform, isCapacitor } from "@sergeant/shared";
import {
  getStoredNativePushToken,
  subscribeNativePush,
  unsubscribeNativePush,
} from "@shared/lib/adapters/pushNative";

const isCapacitorMock = isCapacitor as unknown as ReturnType<typeof vi.fn>;
const getPlatformMock = getPlatform as unknown as ReturnType<typeof vi.fn>;
const subscribeNativePushMock = subscribeNativePush as unknown as ReturnType<
  typeof vi.fn
>;
const unsubscribeNativePushMock =
  unsubscribeNativePush as unknown as ReturnType<typeof vi.fn>;
const getStoredNativePushTokenMock =
  getStoredNativePushToken as unknown as ReturnType<typeof vi.fn>;

const getVapidPublicMock = pushApi.getVapidPublic as unknown as ReturnType<
  typeof vi.fn
>;
const legacyUnsubscribeMock = pushApi.unsubscribe as unknown as ReturnType<
  typeof vi.fn
>;

// Мінімальний мок `PushSubscription` — нам цікавий тільки `toJSON()`
// (саме з нього береться `endpoint` + `keys`) і `endpoint` (для
// unsubscribe-шляху). Інші поля інтерфейсу веб-API не використовуються.
function makeMockPushSubscription(args: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  return {
    endpoint: args.endpoint,
    expirationTime: null,
    options: {} as PushSubscriptionOptions,
    getKey: (): ArrayBuffer | null => null,
    toJSON: () => ({
      endpoint: args.endpoint,
      keys: { p256dh: args.p256dh, auth: args.auth },
    }),
    unsubscribe: async () => true,
  } as unknown as PushSubscription;
}

type NotificationStub = {
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
};

function stubNotification(permission: NotificationPermission) {
  const requestPermission = vi.fn(async () => permission);
  const stub: NotificationStub = { permission, requestPermission };
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    writable: true,
    value: stub,
  });
  return requestPermission;
}

function stubServiceWorker(
  subscription: PushSubscription,
  existing: PushSubscription | null = null,
) {
  const subscribeMock = vi.fn(async () => subscription);
  const registration = {
    pushManager: {
      subscribe: subscribeMock,
      getSubscription: vi.fn(async () => existing),
    },
  };
  Object.defineProperty(globalThis.navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve(registration) },
  });
  // `PushManager` як глобал — використовується у `isPushSupported()`.
  Object.defineProperty(globalThis, "PushManager", {
    configurable: true,
    value: function PushManager() {},
  });
  return subscribeMock;
}

function makeWrapper(apiClient: ApiClient) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ApiClientProvider client={apiClient}>{children}</ApiClientProvider>
      </QueryClientProvider>
    );
  };
}

type RegisterMock = ReturnType<
  typeof vi.fn<(payload: PushRegisterRequest) => Promise<PushRegisterResponse>>
>;
type UnregisterMock = ReturnType<
  typeof vi.fn<
    (payload: PushUnregisterRequest) => Promise<PushUnregisterResponse>
  >
>;

function makeRegisterMock(response: PushRegisterResponse): RegisterMock {
  return vi.fn<(payload: PushRegisterRequest) => Promise<PushRegisterResponse>>(
    async () => response,
  );
}

function makeUnregisterMock(response: PushUnregisterResponse): UnregisterMock {
  return vi.fn<
    (payload: PushUnregisterRequest) => Promise<PushUnregisterResponse>
  >(async () => response);
}

function makeApiClientWithMocks(
  registerMock: RegisterMock,
  unregisterMock: UnregisterMock = makeUnregisterMock({
    ok: true,
    platform: "web",
  }),
) {
  return {
    push: {
      register: registerMock,
      unregister: unregisterMock,
      getVapidPublic: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    },
  } as unknown as ApiClient;
}

describe("usePushNotifications — subscribe via api.push.register", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    isCapacitorMock.mockReturnValue(false);
    getPlatformMock.mockReturnValue("web");
    getVapidPublicMock.mockResolvedValue({ publicKey: "AAAA" });
    legacyUnsubscribeMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("викликає api.push.register з web-payload `{ platform, token, keys }`", async () => {
    stubNotification("granted");
    const subscription = makeMockPushSubscription({
      endpoint: "https://fcm.googleapis.com/wp/abc123",
      p256dh: "p256dh-key",
      auth: "auth-key",
    });
    stubServiceWorker(subscription);

    const registerMock = makeRegisterMock({ ok: true, platform: "web" });
    const apiClient = makeApiClientWithMocks(registerMock);

    const { result } = renderHook(() => usePushNotifications(), {
      wrapper: makeWrapper(apiClient),
    });

    await act(async () => {
      await result.current.subscribe();
    });

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledTimes(1);
    });

    const payload = registerMock.mock.calls[0]![0];
    expect(payload).toEqual({
      platform: "web",
      token: "https://fcm.googleapis.com/wp/abc123",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });
    // Payload має задовольняти runtime-схему з `@sergeant/api-client`,
    // щоб зміни у shared-схемі ламали саме цей юніт, а не далеко у
    // httpClient-і.
    expect(() => PushRegisterRequestSchema.parse(payload)).not.toThrow();
    expect(localStorage.getItem("hub_push_subscribed")).toBe("1");
    expect(result.current.subscribed).toBe(true);
  });

  it("не викликає register, якщо permission НЕ granted", async () => {
    stubNotification("denied");
    const subscription = makeMockPushSubscription({
      endpoint: "https://example/e",
      p256dh: "p",
      auth: "a",
    });
    stubServiceWorker(subscription);

    const registerMock = makeRegisterMock({ ok: true, platform: "web" });
    const apiClient = makeApiClientWithMocks(registerMock);

    const { result } = renderHook(() => usePushNotifications(), {
      wrapper: makeWrapper(apiClient),
    });

    await act(async () => {
      await result.current.subscribe();
    });

    expect(registerMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("hub_push_subscribed")).toBeNull();
  });
});

describe("usePushNotifications — unsubscribe via api.push.unregister", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    isCapacitorMock.mockReturnValue(false);
    getPlatformMock.mockReturnValue("web");
    getVapidPublicMock.mockResolvedValue({ publicKey: "AAAA" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("викликає api.push.unregister з `{ platform: 'web', endpoint }` і не чіпає legacy pushApi.unsubscribe", async () => {
    // При `unsubscribe()` хук має піти в уніфікований `/api/v1/push/unregister`
    // через `api.push.unregister`, а не у legacy DELETE `/api/push/subscribe`.
    const existing = makeMockPushSubscription({
      endpoint: "https://fcm.googleapis.com/wp/abc123",
      p256dh: "p256dh-key",
      auth: "auth-key",
    });
    stubServiceWorker(existing, existing);

    const registerMock = makeRegisterMock({ ok: true, platform: "web" });
    const unregisterMock = makeUnregisterMock({ ok: true, platform: "web" });
    const apiClient = makeApiClientWithMocks(registerMock, unregisterMock);

    localStorage.setItem("hub_push_subscribed", "1");

    const { result } = renderHook(() => usePushNotifications(), {
      wrapper: makeWrapper(apiClient),
    });

    await act(async () => {
      await result.current.unsubscribe();
    });

    await waitFor(() => {
      expect(unregisterMock).toHaveBeenCalledTimes(1);
    });

    const payload = unregisterMock.mock.calls[0]![0];
    expect(payload).toEqual({
      platform: "web",
      endpoint: "https://fcm.googleapis.com/wp/abc123",
    });
    // Payload — валідний web-варіант discriminated union з shared.
    expect(() => PushUnregisterRequestSchema.parse(payload)).not.toThrow();
    // Legacy шлях (`pushApi.unsubscribe` → DELETE `/api/push/subscribe`)
    // не має смикатись: session-4c забороняє direct-виклики legacy у web.
    expect(legacyUnsubscribeMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("hub_push_subscribed")).toBeNull();
    expect(result.current.subscribed).toBe(false);
  });

  it("без активної підписки у браузері — не викликає api.push.unregister", async () => {
    // `pushManager.getSubscription()` повертає null (юзер ще не підписувався).
    // У такому випадку немає `endpoint`, тож і серверу нічого чистити.
    const placeholder = makeMockPushSubscription({
      endpoint: "https://example/e",
      p256dh: "p",
      auth: "a",
    });
    stubServiceWorker(placeholder, null);

    const registerMock = makeRegisterMock({ ok: true, platform: "web" });
    const unregisterMock = makeUnregisterMock({ ok: true, platform: "web" });
    const apiClient = makeApiClientWithMocks(registerMock, unregisterMock);

    localStorage.setItem("hub_push_subscribed", "1");

    const { result } = renderHook(() => usePushNotifications(), {
      wrapper: makeWrapper(apiClient),
    });

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(unregisterMock).not.toHaveBeenCalled();
    // Локальний стан все одно чиститься, щоб UI не лишився «увімкненим».
    expect(localStorage.getItem("hub_push_subscribed")).toBeNull();
    expect(result.current.subscribed).toBe(false);
  });
});

describe("usePushNotifications — native Capacitor branch", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Native-контекст: `isCapacitor()` → true. Web Push API (navigator.serviceWorker,
    // Notification.requestPermission) НЕ підміняємо навмисно — щоб зафіксувати, що
    // native-гілка до них не дотикається (інакше jsdom впаде на `await navigator.serviceWorker.ready`).
    isCapacitorMock.mockReturnValue(true);
    // `pushApi.getVapidPublic` не має викликатись у native — кидаємо reject,
    // щоб випадковий `useQuery` не проскочив тихо.
    getVapidPublicMock.mockRejectedValue(
      new Error("VAPID must not be fetched on native"),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("android: реєструє `{ platform: 'android', token }` без `keys` і не торкається Web Push API", async () => {
    getPlatformMock.mockReturnValue("android");
    subscribeNativePushMock.mockResolvedValue({
      platform: "android",
      token: "fcm-token-abc",
    });

    const notificationRequestSpy = vi.fn();
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      writable: true,
      value: {
        permission: "default",
        requestPermission: notificationRequestSpy,
      },
    });
    const serviceWorkerReadySpy = vi.fn();
    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      configurable: true,
      value: {
        get ready() {
          serviceWorkerReadySpy();
          return Promise.reject(
            new Error("serviceWorker must not be accessed on native"),
          );
        },
      },
    });

    const registerMock = makeRegisterMock({ ok: true, platform: "android" });
    const apiClient = makeApiClientWithMocks(registerMock);

    const { result } = renderHook(() => usePushNotifications(), {
      wrapper: makeWrapper(apiClient),
    });

    // `supported` має бути true навіть без Web Push API (capacitor-гейт).
    expect(result.current.supported).toBe(true);

    await act(async () => {
      await result.current.subscribe();
    });

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledTimes(1);
    });

    const payload = registerMock.mock.calls[0]![0];
    expect(payload).toEqual({ platform: "android", token: "fcm-token-abc" });
    expect(() => PushRegisterRequestSchema.parse(payload)).not.toThrow();

    expect(subscribeNativePushMock).toHaveBeenCalledTimes(1);
    // Web-Push side-effects MUST NOT бути тригернуті у native-гілці.
    expect(notificationRequestSpy).not.toHaveBeenCalled();
    expect(serviceWorkerReadySpy).not.toHaveBeenCalled();
    expect(getVapidPublicMock).not.toHaveBeenCalled();

    expect(localStorage.getItem("hub_push_subscribed")).toBe("1");
    expect(result.current.subscribed).toBe(true);
  });

  it("ios: реєструє `{ platform: 'ios', token }` без `keys`", async () => {
    getPlatformMock.mockReturnValue("ios");
    subscribeNativePushMock.mockResolvedValue({
      platform: "ios",
      token: "apns-deadbeef",
    });

    const registerMock = makeRegisterMock({ ok: true, platform: "ios" });
    const apiClient = makeApiClientWithMocks(registerMock);

    const { result } = renderHook(() => usePushNotifications(), {
      wrapper: makeWrapper(apiClient),
    });

    await act(async () => {
      await result.current.subscribe();
    });

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledTimes(1);
    });

    const payload = registerMock.mock.calls[0]![0];
    expect(payload).toEqual({ platform: "ios", token: "apns-deadbeef" });
    expect(() => PushRegisterRequestSchema.parse(payload)).not.toThrow();
    expect(result.current.subscribed).toBe(true);
  });

  it("unsubscribe на native шле `{ platform, token }` і НЕ ходить у navigator.serviceWorker", async () => {
    getPlatformMock.mockReturnValue("android");
    getStoredNativePushTokenMock.mockResolvedValue("fcm-token-abc");
    unsubscribeNativePushMock.mockResolvedValue("fcm-token-abc");

    const serviceWorkerReadySpy = vi.fn();
    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      configurable: true,
      value: {
        get ready() {
          serviceWorkerReadySpy();
          return Promise.reject(
            new Error("serviceWorker must not be accessed on native"),
          );
        },
      },
    });

    const registerMock = makeRegisterMock({ ok: true, platform: "android" });
    const unregisterMock = makeUnregisterMock({
      ok: true,
      platform: "android",
    });
    const apiClient = makeApiClientWithMocks(registerMock, unregisterMock);

    localStorage.setItem("hub_push_subscribed", "1");

    const { result } = renderHook(() => usePushNotifications(), {
      wrapper: makeWrapper(apiClient),
    });

    await act(async () => {
      await result.current.unsubscribe();
    });

    await waitFor(() => {
      expect(unregisterMock).toHaveBeenCalledTimes(1);
    });

    const payload = unregisterMock.mock.calls[0]![0];
    expect(payload).toEqual({ platform: "android", token: "fcm-token-abc" });
    expect(() => PushUnregisterRequestSchema.parse(payload)).not.toThrow();
    expect(unsubscribeNativePushMock).toHaveBeenCalledTimes(1);
    expect(serviceWorkerReadySpy).not.toHaveBeenCalled();
    expect(legacyUnsubscribeMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("hub_push_subscribed")).toBeNull();
    expect(result.current.subscribed).toBe(false);
  });

  it("unsubscribe без кешованого токена все одно очищає локальний стан", async () => {
    getPlatformMock.mockReturnValue("ios");
    getStoredNativePushTokenMock.mockResolvedValue(null);
    unsubscribeNativePushMock.mockResolvedValue(null);

    const registerMock = makeRegisterMock({ ok: true, platform: "ios" });
    const unregisterMock = makeUnregisterMock({ ok: true, platform: "ios" });
    const apiClient = makeApiClientWithMocks(registerMock, unregisterMock);

    localStorage.setItem("hub_push_subscribed", "1");

    const { result } = renderHook(() => usePushNotifications(), {
      wrapper: makeWrapper(apiClient),
    });

    await act(async () => {
      await result.current.unsubscribe();
    });

    // Без токена сервер анрегнути нічим — але UI все одно має піти у "вимкнено".
    expect(unregisterMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("hub_push_subscribed")).toBeNull();
    expect(result.current.subscribed).toBe(false);
  });
});

describe("usePushNotifications — localStorage hardening (Item #6 round 8)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    isCapacitorMock.mockReturnValue(false);
    getPlatformMock.mockReturnValue("web");
    getVapidPublicMock.mockResolvedValue({ publicKey: "AAAA" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ініційний рендер не падає, якщо localStorage.getItem кидає (Safari Private Mode)", () => {
    // Safari Private Mode / зруйнований storage backend кидає SecurityError
    // на будь-який getItem. До міграції на `safeReadStringLS` ми ловили це
    // через try/catch у самому хуку — тепер хедж лежить у `safe*LS`-обгортці.
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError: localStorage is disabled");
      });

    const apiClient = makeApiClientWithMocks(
      makeRegisterMock({ ok: true, platform: "web" }),
    );

    const { result } = renderHook(() => usePushNotifications(), {
      wrapper: makeWrapper(apiClient),
    });

    expect(result.current.subscribed).toBe(false);
    expect(getItemSpy).toHaveBeenCalledWith("hub_push_subscribed");
  });

  it("subscribe не падає, якщо localStorage.setItem кидає QuotaExceededError", async () => {
    stubNotification("granted");
    const subscription = makeMockPushSubscription({
      endpoint: "https://fcm.googleapis.com/wp/quota",
      p256dh: "p",
      auth: "a",
    });
    stubServiceWorker(subscription);

    const registerMock = makeRegisterMock({ ok: true, platform: "web" });
    const apiClient = makeApiClientWithMocks(registerMock);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const { result } = renderHook(() => usePushNotifications(), {
      wrapper: makeWrapper(apiClient),
    });

    await act(async () => {
      await result.current.subscribe();
    });

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledTimes(1);
    });

    // Серверна реєстрація все одно пройшла; in-memory стан виставився.
    // Запис у LS свідомо проігнорено — наступний рендер прочитає `false`,
    // що краще, ніж краш виклику subscribe() у середині retry-flow.
    expect(result.current.subscribed).toBe(true);
  });

  it("unsubscribe не падає, якщо localStorage.removeItem кидає", async () => {
    stubNotification("granted");
    const apiClient = makeApiClientWithMocks(
      makeRegisterMock({ ok: true, platform: "web" }),
      makeUnregisterMock({ ok: true, platform: "web" }),
    );

    localStorage.setItem("hub_push_subscribed", "1");

    const subscription = makeMockPushSubscription({
      endpoint: "https://fcm.googleapis.com/wp/rm",
      p256dh: "p",
      auth: "a",
    });
    stubServiceWorker(subscription);

    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    const { result } = renderHook(() => usePushNotifications(), {
      wrapper: makeWrapper(apiClient),
    });

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(result.current.subscribed).toBe(false);
  });
});
