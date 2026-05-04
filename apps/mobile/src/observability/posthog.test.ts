/**
 * Unit tests for the mobile PostHog HTTP transport.
 *
 * The env reads (`getPostHogKey` / `getPostHogHost`) live in
 * `./env` so we can `jest.mock` them here without fighting Expo's
 * babel `EXPO_PUBLIC_*` env-inlining plugin. `expo-crypto.randomUUID`
 * is mocked to a deterministic value so distinct-id assertions stay
 * stable, and `@/lib/storage` is replaced by an in-memory cache so we
 * can drive cold-start vs warm-start scenarios without touching MMKV.
 */

jest.mock("./env", () => ({
  __esModule: true,
  getPostHogKey: jest.fn(),
  getPostHogHost: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  __esModule: true,
  randomUUID: jest.fn(() => "anon-uuid-1"),
}));

const storage = new Map<string, string>();
jest.mock("@/lib/storage", () => ({
  __esModule: true,
  safeReadStringLS: jest.fn((key: string, fallback: string | null = null) =>
    storage.has(key) ? storage.get(key)! : fallback,
  ),
  safeWriteLS: jest.fn((key: string, value: unknown) => {
    storage.set(key, typeof value === "string" ? value : JSON.stringify(value));
    return true;
  }),
  safeRemoveLS: jest.fn((key: string) => {
    storage.delete(key);
    return true;
  }),
}));

import * as Crypto from "expo-crypto";

import {
  __resetForTests,
  capturePostHogEvent,
  identifyPostHogUser,
  initPostHog,
  resetPostHog,
} from "./posthog";
import { getPostHogHost, getPostHogKey } from "./env";

const getPostHogKeyMock = getPostHogKey as jest.Mock;
const getPostHogHostMock = getPostHogHost as jest.Mock;
const randomUUIDMock = Crypto.randomUUID as jest.Mock;

const fetchMock = jest.fn();

beforeEach(() => {
  storage.clear();
  __resetForTests();
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  // `globalThis.fetch` is provided by jest-expo; install a fresh spy
  // per test so assertions don't leak across cases.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchMock;
  getPostHogKeyMock.mockReset().mockReturnValue("phc_test_key");
  getPostHogHostMock.mockReset().mockReturnValue("https://eu.i.posthog.com");
  randomUUIDMock.mockReset().mockReturnValue("anon-uuid-1");
});

describe("initPostHog", () => {
  it("mints and persists an anonymous distinct_id on cold start", async () => {
    await initPostHog();
    capturePostHogEvent("test", { foo: "bar" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.distinct_id).toBe("anon-uuid-1");
    expect(storage.get("posthog_distinct_id_v1")).toBe("anon-uuid-1");
  });

  it("re-uses the persisted distinct_id on warm start", async () => {
    storage.set("posthog_distinct_id_v1", "warm-id-2");
    await initPostHog();
    capturePostHogEvent("test");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.distinct_id).toBe("warm-id-2");
    // Persisted id wins — no fresh UUID minted.
    expect(randomUUIDMock).not.toHaveBeenCalled();
  });

  it("registers source + platform super-properties on every capture", async () => {
    await initPostHog();
    capturePostHogEvent("ftux_event", { module: "finyk" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.event).toBe("ftux_event");
    // jest-expo defaults `Platform.OS` to `"ios"`; we just want the
    // value to be a non-empty string regardless of which platform the
    // CI matrix runs as.
    expect(body.properties).toMatchObject({
      source: "mobile-expo",
      module: "finyk",
    });
    expect(typeof body.properties.platform).toBe("string");
    expect(body.properties.platform.length).toBeGreaterThan(0);
  });

  it("is idempotent — repeat calls do not re-mint or re-register", async () => {
    await initPostHog();
    await initPostHog();
    await initPostHog();

    expect(randomUUIDMock).toHaveBeenCalledTimes(1);
  });

  it("is a complete no-op when EXPO_PUBLIC_POSTHOG_KEY is absent", async () => {
    getPostHogKeyMock.mockReturnValue(undefined);

    await initPostHog();
    capturePostHogEvent("ignored");
    identifyPostHogUser("u-1", { plan: "free" });
    resetPostHog();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.size).toBe(0);
  });

  it("is a complete no-op when key is empty string", async () => {
    getPostHogKeyMock.mockReturnValue("");

    await initPostHog();
    capturePostHogEvent("ignored");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("capturePostHogEvent", () => {
  it("buffers events fired before init completes and flushes after", async () => {
    capturePostHogEvent("early_1", { n: 1 });
    capturePostHogEvent("early_2", { n: 2 });
    expect(fetchMock).not.toHaveBeenCalled();

    await initPostHog();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const events = fetchMock.mock.calls.map(
      (c) => JSON.parse(c[1].body as string).event,
    );
    expect(events).toEqual(["early_1", "early_2"]);
  });

  it("ignores empty event names", async () => {
    await initPostHog();
    capturePostHogEvent("");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the configured api host", async () => {
    getPostHogHostMock.mockReturnValue("https://us.i.posthog.com");
    await initPostHog();
    capturePostHogEvent("hosted");

    expect(fetchMock.mock.calls[0][0]).toBe("https://us.i.posthog.com/i/v0/e/");
  });
});

describe("identifyPostHogUser", () => {
  it("rebinds the distinct_id and emits an $identify with traits", async () => {
    await initPostHog();
    fetchMock.mockClear();

    identifyPostHogUser("user-42", { plan: "free", vibe: ["finyk"] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.event).toBe("$identify");
    expect(body.distinct_id).toBe("user-42");
    expect(body.properties.$set).toEqual({ plan: "free", vibe: ["finyk"] });
    expect(storage.get("posthog_distinct_id_v1")).toBe("user-42");

    capturePostHogEvent("post_identify_event");
    const captured = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(captured.distinct_id).toBe("user-42");
  });

  it("ignores empty userId", async () => {
    await initPostHog();
    fetchMock.mockClear();

    identifyPostHogUser("");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("buffers identify when called before init resolves", async () => {
    identifyPostHogUser("pre-init-user", { plan: "free" });
    await initPostHog();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.event).toBe("$identify");
    expect(body.distinct_id).toBe("pre-init-user");
  });
});

describe("resetPostHog", () => {
  it("mints a fresh anonymous id and clears the persisted one", async () => {
    await initPostHog();
    identifyPostHogUser("u-1");
    randomUUIDMock.mockReturnValue("anon-uuid-2");
    fetchMock.mockClear();

    resetPostHog();

    expect(storage.has("posthog_distinct_id_v1")).toBe(false);

    capturePostHogEvent("after_reset");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.distinct_id).toBe("anon-uuid-2");
  });

  it("buffers reset when called before init resolves", async () => {
    capturePostHogEvent("anon_event");
    resetPostHog();
    randomUUIDMock
      .mockReturnValueOnce("anon-uuid-1")
      .mockReturnValueOnce("anon-uuid-3");

    await initPostHog();

    // The buffered reset replaces the freshly-minted id, so the
    // queued capture lands on a different distinct_id than the one
    // persisted at init-time.
    expect(storage.has("posthog_distinct_id_v1")).toBe(false);
  });
});
