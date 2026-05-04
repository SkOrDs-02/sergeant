/**
 * Jest coverage for the mobile PostHog transport — no-op gating around
 * `EXPO_PUBLIC_POSTHOG_KEY`, fetch-handoff when the key is set, queue
 * buffering before init completes, and identify/reset semantics.
 *
 * The env read is mocked through `./posthogEnv` so tests can drive
 * both branches without fighting Expo's babel `EXPO_PUBLIC_*`
 * inlining. `mobileKVStore` is mocked to keep the test deterministic
 * and decouple it from the real MMKV instance.
 */

jest.mock("../observability/posthogEnv", () => ({
  __esModule: true,
  getPostHogKey: jest.fn(),
  getPostHogHost: jest.fn(() => "https://eu.i.posthog.com"),
}));

jest.mock("@/lib/storage", () => {
  const map = new Map<string, string>();
  return {
    __esModule: true,
    mobileKVStore: {
      getString: jest.fn((key: string) => map.get(key) ?? null),
      setString: jest.fn((key: string, value: string) => {
        map.set(key, value);
      }),
      remove: jest.fn((key: string) => {
        map.delete(key);
      }),
      onChange: jest.fn(() => () => {}),
    },
    __mockClear: () => map.clear(),
  };
});

import {
  __resetPostHogForTests,
  capturePostHogEvent,
  identifyPostHogUser,
  initPostHog,
  resetPostHog,
} from "../observability/posthog";
import { getPostHogHost, getPostHogKey } from "../observability/posthogEnv";

const getKeyMock = getPostHogKey as jest.Mock;
const getHostMock = getPostHogHost as jest.Mock;

const mockedStorage = jest.requireMock("@/lib/storage") as {
  __mockClear: () => void;
  mobileKVStore: { getString: jest.Mock; setString: jest.Mock };
};

describe("mobile posthog transport", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    __resetPostHogForTests();
    mockedStorage.__mockClear();
    mockedStorage.mobileKVStore.getString.mockClear();
    mockedStorage.mobileKVStore.setString.mockClear();
    getKeyMock.mockReset();
    getHostMock.mockReset().mockReturnValue("https://eu.i.posthog.com");
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(""),
    });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  describe("initPostHog", () => {
    it("без EXPO_PUBLIC_POSTHOG_KEY — повний no-op (жодного fetch)", async () => {
      getKeyMock.mockReturnValue(undefined);

      await initPostHog();
      capturePostHogEvent("test_event", { foo: "bar" });
      identifyPostHogUser("user-1");
      resetPostHog();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("ідемпотентний — повторний виклик повертає той самий promise", async () => {
      getKeyMock.mockReturnValue("phc_test");

      const a = initPostHog();
      const b = initPostHog();

      expect(a).toBe(b);
      await a;
    });

    it("персистить distinct_id у MMKV", async () => {
      getKeyMock.mockReturnValue("phc_test");

      await initPostHog();

      expect(mockedStorage.mobileKVStore.setString).toHaveBeenCalledWith(
        "sergeant.mobile.posthog.distinct_id.v1",
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        ),
      );
    });
  });

  describe("capturePostHogEvent", () => {
    it("шле подію у /capture/ після init", async () => {
      getKeyMock.mockReturnValue("phc_test");
      await initPostHog();

      capturePostHogEvent("onboarding_started", { source: "demo" });
      // event POST is async — wait a tick
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { method: string; body: string },
      ];
      expect(url).toBe("https://eu.i.posthog.com/capture/");
      expect(init.method).toBe("POST");
      const parsed = JSON.parse(init.body) as {
        api_key: string;
        event: string;
        distinct_id: string;
        properties: Record<string, unknown>;
      };
      expect(parsed.api_key).toBe("phc_test");
      expect(parsed.event).toBe("onboarding_started");
      expect(parsed.distinct_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(parsed.properties).toMatchObject({
        platform: expect.any(String),
        is_capacitor: false,
        is_expo: true,
        source: "demo",
      });
    });

    it("буферизує події до завершення init і потім флешить", async () => {
      getKeyMock.mockReturnValue("phc_test");
      // Не await — фіксуємо стан "init у процесі".
      const initOnce = initPostHog();
      capturePostHogEvent("queued_a");
      capturePostHogEvent("queued_b");

      await initOnce;
      await Promise.resolve();
      await Promise.resolve();

      const eventNames = fetchMock.mock.calls.map((call) => {
        const body = call[1] as { body: string };
        return (JSON.parse(body.body) as { event: string }).event;
      });
      expect(eventNames).toEqual(
        expect.arrayContaining(["queued_a", "queued_b"]),
      );
    });

    it("без ключа — не накопичує події у черзі (queue не росте)", async () => {
      getKeyMock.mockReturnValue(undefined);
      // Лиш `initPostHog` робить ранній resolve без зміни стану — без
      // нього `enqueue` все одно не повинен спрацьовувати, бо
      // `capturePostHogEvent` сам перевіряє ключ.
      for (let i = 0; i < 200; i += 1) {
        capturePostHogEvent(`drop_${i}`);
      }
      // Вмикаємо ключ і чекаємо init — нічого не повинно злетіти.
      getKeyMock.mockReturnValue("phc_test");
      await initPostHog();
      await Promise.resolve();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("ігнорує fetch-throw і не валиться", async () => {
      getKeyMock.mockReturnValue("phc_test");
      fetchMock.mockRejectedValueOnce(new Error("network down"));
      await initPostHog();

      expect(() => capturePostHogEvent("network_test")).not.toThrow();
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("identifyPostHogUser", () => {
    it("шле $identify з $anon_distinct_id stitch на першому login", async () => {
      getKeyMock.mockReturnValue("phc_test");
      await initPostHog();
      const initialId = mockedStorage.mobileKVStore.setString.mock.calls.find(
        ([key]) => key === "sergeant.mobile.posthog.distinct_id.v1",
      )?.[1] as string;

      identifyPostHogUser("user-42", { plan: "free" });
      await Promise.resolve();

      const identifyCall = fetchMock.mock.calls.find((call) => {
        const body = call[1] as { body: string };
        return (
          (JSON.parse(body.body) as { event: string }).event === "$identify"
        );
      });
      expect(identifyCall).toBeDefined();
      const parsed = JSON.parse(
        (identifyCall![1] as { body: string }).body,
      ) as {
        distinct_id: string;
        properties: Record<string, unknown>;
      };
      expect(parsed.distinct_id).toBe("user-42");
      expect(parsed.properties.$anon_distinct_id).toBe(initialId);
      expect(parsed.properties.$set).toEqual({ plan: "free" });
    });

    it("персистить новий distinct_id у MMKV", async () => {
      getKeyMock.mockReturnValue("phc_test");
      await initPostHog();
      mockedStorage.mobileKVStore.setString.mockClear();

      identifyPostHogUser("user-99");
      await Promise.resolve();

      expect(mockedStorage.mobileKVStore.setString).toHaveBeenCalledWith(
        "sergeant.mobile.posthog.distinct_id.v1",
        "user-99",
      );
    });
  });

  describe("resetPostHog", () => {
    it("re-roll-ить anon distinct_id після logout", async () => {
      getKeyMock.mockReturnValue("phc_test");
      await initPostHog();

      identifyPostHogUser("user-1");
      await Promise.resolve();
      mockedStorage.mobileKVStore.setString.mockClear();

      resetPostHog();

      expect(mockedStorage.mobileKVStore.setString).toHaveBeenCalledWith(
        "sergeant.mobile.posthog.distinct_id.v1",
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        ),
      );
      // Verify the new anon id is NOT the user id.
      const written = mockedStorage.mobileKVStore.setString.mock.calls[0][1];
      expect(written).not.toBe("user-1");
    });
  });
});
