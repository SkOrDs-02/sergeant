import { act, renderHook } from "@testing-library/react-native";
import {
  Keyboard,
  type EmitterSubscription,
  type KeyboardEvent,
  type KeyboardEventListener,
} from "react-native";

import { useMobileVisualKeyboardInset } from "./useVisualKeyboardInset";

type Listener = (event: KeyboardEvent) => void;

interface MockSubscription extends EmitterSubscription {
  remove: jest.Mock<void, []>;
}

function makeEvent(height: number): KeyboardEvent {
  return {
    endCoordinates: { height, screenX: 0, screenY: 0, width: 0 },
    startCoordinates: { height: 0, screenX: 0, screenY: 0, width: 0 },
    duration: 0,
    easing: "keyboard",
    isEventFromThisApp: true,
  } as unknown as KeyboardEvent;
}

describe("useMobileVisualKeyboardInset", () => {
  let showListeners: Listener[];
  let hideListeners: Listener[];
  let subscriptions: MockSubscription[];
  let addListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    showListeners = [];
    hideListeners = [];
    subscriptions = [];
    addListenerSpy = jest
      .spyOn(Keyboard, "addListener")
      .mockImplementation(
        (eventName: string, listener: KeyboardEventListener) => {
          if (eventName === "keyboardDidShow") {
            showListeners.push(listener as Listener);
          } else if (eventName === "keyboardDidHide") {
            hideListeners.push(listener as Listener);
          }
          const sub: MockSubscription = {
            remove: jest.fn(),
          } as unknown as MockSubscription;
          subscriptions.push(sub);
          return sub;
        },
      );
  });

  afterEach(() => {
    addListenerSpy.mockRestore();
  });

  it("returns 0 and does not subscribe when `active` is false", () => {
    const { result } = renderHook(() => useMobileVisualKeyboardInset(false));

    expect(result.current).toBe(0);
    expect(addListenerSpy).not.toHaveBeenCalled();
  });

  it("subscribes to keyboardDidShow/Hide and tracks the reported height", () => {
    const { result } = renderHook(() => useMobileVisualKeyboardInset(true));

    expect(result.current).toBe(0);
    expect(addListenerSpy).toHaveBeenCalledTimes(2);
    expect(addListenerSpy).toHaveBeenNthCalledWith(
      1,
      "keyboardDidShow",
      expect.any(Function),
    );
    expect(addListenerSpy).toHaveBeenNthCalledWith(
      2,
      "keyboardDidHide",
      expect.any(Function),
    );

    act(() => {
      showListeners[0]!(makeEvent(324));
    });
    expect(result.current).toBe(324);

    act(() => {
      showListeners[0]!(makeEvent(410));
    });
    expect(result.current).toBe(410);

    act(() => {
      hideListeners[0]!(makeEvent(0));
    });
    expect(result.current).toBe(0);
  });

  it("removes listeners on unmount", () => {
    const { unmount } = renderHook(() => useMobileVisualKeyboardInset(true));

    expect(subscriptions).toHaveLength(2);
    for (const sub of subscriptions) {
      expect(sub.remove).not.toHaveBeenCalled();
    }

    unmount();

    for (const sub of subscriptions) {
      expect(sub.remove).toHaveBeenCalledTimes(1);
    }
  });

  it("resets to 0 and removes listeners when `active` flips to false", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useMobileVisualKeyboardInset(active),
      { initialProps: { active: true } },
    );

    act(() => {
      showListeners[0]!(makeEvent(280));
    });
    expect(result.current).toBe(280);

    const initialSubs = subscriptions.slice();

    rerender({ active: false });

    expect(result.current).toBe(0);
    for (const sub of initialSubs) {
      expect(sub.remove).toHaveBeenCalledTimes(1);
    }
  });
});
