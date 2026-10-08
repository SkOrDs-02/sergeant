/** @vitest-environment jsdom */
/**
 * rel-12: «Скинути кеш PWA» знімає реєстрацію SW, а за Push API разом із нею
 * гине push-підписка. Тест відтворює сценарій на реальних `PWASection` і
 * `restoreWebPushSubscriptionIfLost`; моки лише на межах: `navigator.
 * serviceWorker` (з чесною семантикою «unregister скидає підписку»), мережа
 * (`pushApi`) і тригери (`swControl`, тост, перезавантаження).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const swMocks = vi.hoisted(() => ({
  swClearCaches: vi.fn(),
  swGetDebugSnapshot: vi.fn(),
  swSetDebug: vi.fn(),
}));
vi.mock("../app/swControl", () => swMocks);

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@shared/lib", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const pushApiMocks = vi.hoisted(() => ({
  getVapidPublic: vi.fn(),
  register: vi.fn(),
}));
vi.mock("@shared/api", () => ({ pushApi: pushApiMocks }));

import { PWASection } from "./PWASection";
import { restoreWebPushSubscriptionIfLost } from "@shared/hooks/restoreWebPushSubscription";
import { PUSH_SUB_KEY } from "@shared/hooks/pushSubscribedFlag";
import { safeRemoveLS, safeWriteLS } from "@shared/lib/storage/storage";

const ENDPOINT_BEFORE = "https://push.example/old";
const ENDPOINT_AFTER = "https://push.example/new";

interface FakeRegistration {
  pushManager: {
    getSubscription: () => Promise<unknown>;
    subscribe: ReturnType<typeof vi.fn>;
  };
  unregister: () => Promise<boolean>;
}

function makeSubscription(endpoint: string) {
  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      keys: { p256dh: "p256-key", auth: "auth-key" },
    }),
  };
}

/** Реєстрація, де `unregister()` деактивує підписку (Push API § unregister). */
function makeRegistration(initial: string | null): FakeRegistration {
  let sub: ReturnType<typeof makeSubscription> | null = initial
    ? makeSubscription(initial)
    : null;
  return {
    pushManager: {
      getSubscription: async () => sub,
      subscribe: vi.fn(async () => {
        sub = makeSubscription(ENDPOINT_AFTER);
        return sub;
      }),
    },
    unregister: async () => {
      sub = null;
      return true;
    },
  };
}

let current: FakeRegistration;

function installServiceWorker() {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    get: () => ({
      getRegistration: async () => current,
      ready: Promise.resolve(current),
    }),
  });
}

describe("PWASection: push-підписка після скидання кешу", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("Notification", { permission: "granted" });
    pushApiMocks.getVapidPublic.mockResolvedValue({ publicKey: "AQAB" });
    pushApiMocks.register.mockResolvedValue({ ok: true });
    swMocks.swClearCaches.mockResolvedValue({ ok: true, deleted: [] });
    current = makeRegistration(ENDPOINT_BEFORE);
    installServiceWorker();
    safeWriteLS(PUSH_SUB_KEY, "1");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    safeRemoveLS(PUSH_SUB_KEY);
  });

  async function resetPwaCache() {
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    render(<PWASection />);
    fireEvent.click(screen.getByText("Скинути кеш PWA"));
    fireEvent.click(screen.getByText("Скинути та перезавантажити"));
    await vi.waitFor(() => {
      expect(swMocks.swClearCaches).toHaveBeenCalledWith("all");
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(reload).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  }

  it("після reset і reload підписка відновлюється й реєструється на сервері", async () => {
    const before = await current.pushManager.getSubscription();
    expect(before).not.toBeNull();

    await resetPwaCache();

    // unregister() скинув підписку: тумблер у LS каже «увімкнено», а підписки нема.
    expect(await current.pushManager.getSubscription()).toBeNull();

    // Наступне завантаження ставить нову реєстрацію (без підписки).
    current = makeRegistration(null);
    await expect(restoreWebPushSubscriptionIfLost()).resolves.toBe("restored");

    expect(current.pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(pushApiMocks.register).toHaveBeenCalledWith({
      platform: "web",
      token: ENDPOINT_AFTER,
      keys: { p256dh: "p256-key", auth: "auth-key" },
    });
  });

  it("не чіпає підписку, яка жива", async () => {
    current = makeRegistration(ENDPOINT_BEFORE);
    await expect(restoreWebPushSubscriptionIfLost()).resolves.toBe(
      "not-needed",
    );
    expect(current.pushManager.subscribe).not.toHaveBeenCalled();
    expect(pushApiMocks.register).not.toHaveBeenCalled();
  });

  it("не відновлює, якщо людина push не вмикала (мітки нема)", async () => {
    safeRemoveLS(PUSH_SUB_KEY);
    current = makeRegistration(null);
    await expect(restoreWebPushSubscriptionIfLost()).resolves.toBe(
      "not-needed",
    );
    expect(current.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("не відновлює без виданого дозволу на сповіщення", async () => {
    vi.stubGlobal("Notification", { permission: "denied" });
    current = makeRegistration(null);
    await expect(restoreWebPushSubscriptionIfLost()).resolves.toBe(
      "not-needed",
    );
    expect(current.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("при збої мережі не кидає і лишає мітку для наступної спроби", async () => {
    current = makeRegistration(null);
    pushApiMocks.register.mockRejectedValue(new Error("offline"));
    await expect(restoreWebPushSubscriptionIfLost()).resolves.toBe("failed");
    const { safeReadStringLS } = await import("@shared/lib/storage/storage");
    expect(safeReadStringLS(PUSH_SUB_KEY)).toBe("1");
  });
});
