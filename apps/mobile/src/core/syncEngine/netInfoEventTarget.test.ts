/**
 * Tests for the mobile NetInfo → SyncEngineEventTarget bridge.
 *
 * Asserts the offline → online edge semantics consumed by
 * `createSyncEngineFlushOnReconnect`:
 *   - Subscription happens lazily on first `addEventListener('online', …)`.
 *   - Listeners fire only on the offline → online edge, not on
 *     every NetInfo callback (NetInfo fires on every state change,
 *     including identical-state heartbeats on some platforms).
 *   - `removeEventListener` releases NetInfo when no listeners remain.
 *   - `dispose()` is idempotent.
 *   - Non-`online` event types are ignored without throwing.
 */
import {
  createNetInfoEventTarget,
  type NetInfoLike,
} from "./netInfoEventTarget";

interface FakeNetInfo extends NetInfoLike {
  fire(state: { readonly isConnected?: boolean | null }): void;
  readonly subscriberCount: number;
}

function makeFakeNetInfo(): FakeNetInfo {
  const subscribers = new Set<
    (state: { readonly isConnected?: boolean | null }) => void
  >();
  return {
    addEventListener(listener) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    fire(state) {
      for (const cb of [...subscribers]) cb(state);
    },
    get subscriberCount() {
      return subscribers.size;
    },
  };
}

describe("createNetInfoEventTarget", () => {
  it("does not subscribe to NetInfo until the first online listener is added", () => {
    const netInfo = makeFakeNetInfo();
    const target = createNetInfoEventTarget(netInfo);

    expect(netInfo.subscriberCount).toBe(0);

    target.addEventListener("online", () => {});
    expect(netInfo.subscriberCount).toBe(1);
  });

  it("fires the online listener only on the offline → online edge", () => {
    const netInfo = makeFakeNetInfo();
    const target = createNetInfoEventTarget(netInfo, { initialOnline: false });
    const listener = jest.fn();
    target.addEventListener("online", listener);

    netInfo.fire({ isConnected: false });
    expect(listener).not.toHaveBeenCalled();

    netInfo.fire({ isConnected: true });
    expect(listener).toHaveBeenCalledTimes(1);
    const call = listener.mock.calls[0];
    expect(call?.[0]).toMatchObject({ type: "online" });

    // Subsequent online-stays-online heartbeats must not fire again.
    netInfo.fire({ isConnected: true });
    expect(listener).toHaveBeenCalledTimes(1);

    // After going offline and back, the edge fires once more.
    netInfo.fire({ isConnected: false });
    netInfo.fire({ isConnected: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("treats nullish or false isConnected as offline", () => {
    const netInfo = makeFakeNetInfo();
    const target = createNetInfoEventTarget(netInfo, { initialOnline: true });
    const listener = jest.fn();
    target.addEventListener("online", listener);

    // Drop to offline (nullish counts as offline).
    netInfo.fire({ isConnected: null });
    netInfo.fire({ isConnected: undefined });
    netInfo.fire({ isConnected: false });
    expect(listener).not.toHaveBeenCalled();

    netInfo.fire({ isConnected: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("releases the NetInfo subscription once the last listener is removed", () => {
    const netInfo = makeFakeNetInfo();
    const target = createNetInfoEventTarget(netInfo);

    const listenerA = () => {};
    const listenerB = () => {};
    target.addEventListener("online", listenerA);
    target.addEventListener("online", listenerB);
    expect(netInfo.subscriberCount).toBe(1);

    target.removeEventListener("online", listenerA);
    expect(netInfo.subscriberCount).toBe(1);

    target.removeEventListener("online", listenerB);
    expect(netInfo.subscriberCount).toBe(0);
  });

  it("ignores listeners for non-online event types", () => {
    const netInfo = makeFakeNetInfo();
    const target = createNetInfoEventTarget(netInfo);
    const listener = jest.fn();

    target.addEventListener("visibilitychange", listener);
    expect(netInfo.subscriberCount).toBe(0);

    netInfo.fire({ isConnected: true });
    expect(listener).not.toHaveBeenCalled();
    target.removeEventListener("visibilitychange", listener);
  });

  it("dispose() clears listeners and underlying NetInfo subscription idempotently", () => {
    const netInfo = makeFakeNetInfo();
    const target = createNetInfoEventTarget(netInfo, { initialOnline: false });
    const listener = jest.fn();
    target.addEventListener("online", listener);
    expect(netInfo.subscriberCount).toBe(1);

    target.dispose();
    expect(netInfo.subscriberCount).toBe(0);

    netInfo.fire({ isConnected: true });
    expect(listener).not.toHaveBeenCalled();

    // Idempotent — calling dispose again does not throw or
    // re-touch NetInfo.
    target.dispose();
    expect(netInfo.subscriberCount).toBe(0);
  });

  it("swallows listener exceptions so siblings still fire", () => {
    const netInfo = makeFakeNetInfo();
    const target = createNetInfoEventTarget(netInfo, { initialOnline: false });
    const bad = jest.fn(() => {
      throw new Error("listener exploded");
    });
    const good = jest.fn();
    target.addEventListener("online", bad);
    target.addEventListener("online", good);

    expect(() => netInfo.fire({ isConnected: true })).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });
});
