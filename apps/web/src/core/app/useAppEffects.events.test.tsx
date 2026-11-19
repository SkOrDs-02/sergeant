/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  openChatMock,
  onHubBusMock,
  prefetchHubMock,
  prefetchModulesMock,
  bootReaderMock,
} = vi.hoisted(() => ({
  openChatMock: vi.fn(),
  onHubBusMock: vi.fn((_event: string) => () => {}),
  prefetchHubMock: vi.fn(),
  prefetchModulesMock: vi.fn(),
  bootReaderMock: vi.fn(),
}));

vi.mock("../hub/useHubChatOverlay", () => ({
  useHubChatOverlay: () => ({ openChat: openChatMock }),
}));
vi.mock("@shared/lib/modules/hubBus", async () => {
  const actual = await vi.importActual<
    typeof import("@shared/lib/modules/hubBus")
  >("@shared/lib/modules/hubBus");
  return { ...actual, onHubBus: onHubBusMock };
});
vi.mock("../syncEngine/singleton", () => ({
  bootSyncEngineReader: bootReaderMock,
}));
vi.mock("../lib/useRoutePrefetch", () => ({
  prefetchHubNavigationPages: prefetchHubMock,
  prefetchCriticalModules: prefetchModulesMock,
}));

import { useAppEffects, type AppEffectsDeps } from "./useAppEffects";
import {
  HUB_OPEN_MODULE_EVENT,
  HUB_OPEN_SETTINGS_EVENT,
} from "@shared/lib/modules/hubNav";
import {
  PULL_COMPLETE_EVENT,
  REQUEST_PULL_EVENT,
  type CloudPullOutcome,
} from "@shared/lib/modules/cloudPullRequest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function captureCompletions(): {
  outcomes: Array<CloudPullOutcome | null>;
  stop: () => void;
} {
  const outcomes: Array<CloudPullOutcome | null> = [];
  const listener = (event: Event) => {
    outcomes.push((event as CustomEvent<CloudPullOutcome | null>).detail);
  };
  window.addEventListener(PULL_COMPLETE_EVENT, listener);
  return {
    outcomes,
    stop: () => window.removeEventListener(PULL_COMPLETE_EVENT, listener),
  };
}

function makeDeps(over: Partial<AppEffectsDeps> = {}): AppEffectsDeps {
  return {
    user: null,
    authLoading: false,
    ui: {
      searchOpen: false,
      hubView: "dashboard",
      setHubView: vi.fn(),
      setSearchOpen: vi.fn(),
      closeSearch: vi.fn(),
      closeSearchAfterNavigation: vi.fn(),
      searchQuery: "",
      openSearch: vi.fn(),
    },
    openModule: vi.fn(),
    navigate: vi.fn() as unknown as AppEffectsDeps["navigate"],
    setPwaAction: vi.fn(),
    validActions: new Set<never>(),
    ...over,
  };
}

describe("useAppEffects — global event bridges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onHubBusMock.mockReturnValue(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("kicks off prefetch on mount", async () => {
    renderHook(() => useAppEffects(makeDeps()));
    // `useRoutePrefetch` вантажиться через `import()` (eager-бюджет), тож
    // префетч стартує після мікротаски, а не синхронно на маунті.
    await waitFor(() => expect(prefetchHubMock).toHaveBeenCalled());
  });

  it("skips the prefetch when unmounted before the chunk resolves", async () => {
    const { unmount } = renderHook(() => useAppEffects(makeDeps()));
    unmount();
    await import("../lib/useRoutePrefetch");
    await Promise.resolve();
    expect(prefetchHubMock).not.toHaveBeenCalled();
  });

  it("registers the openChat hub-bus listener", () => {
    renderHook(() => useAppEffects(makeDeps()));
    const events = onHubBusMock.mock.calls.map((c) => c[0]);
    expect(events).toContain("openChat");
    // `openSearch` знято 2026-09-15: канал мав слухача і НУЛЬ продуктових
    // емітерів. Тест лишається пінити, що зареєстрований саме той канал, у
    // якого емітери є.
    expect(events).not.toContain("openSearch");
  });

  it("opens a module on the HUB_OPEN_MODULE custom event", () => {
    const openModule = vi.fn();
    renderHook(() => useAppEffects(makeDeps({ openModule })));
    act(() => {
      window.dispatchEvent(
        new CustomEvent(HUB_OPEN_MODULE_EVENT, {
          detail: { module: "finyk", hash: "tab" },
        }),
      );
    });
    // Джерело завжди їде в опціях: без названого — `other` (P3, базова
    // лінія перед віссю дії хабу).
    expect(openModule).toHaveBeenCalledWith("finyk", {
      hash: "tab",
      source: "other",
    });
  });

  it("persists a valid PWA action from the open-module event", () => {
    const setPwaAction = vi.fn();
    const openModule = vi.fn();
    renderHook(() =>
      useAppEffects(
        makeDeps({
          openModule,
          setPwaAction,
          validActions: new Set(["add-expense"]) as never,
        }),
      ),
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent(HUB_OPEN_MODULE_EVENT, {
          detail: { module: "finyk", action: "add-expense" },
        }),
      );
    });
    expect(setPwaAction).toHaveBeenCalledWith("add-expense");
    expect(openModule).toHaveBeenCalled();
  });

  it("ignores an unknown PWA action", () => {
    const setPwaAction = vi.fn();
    renderHook(() =>
      useAppEffects(makeDeps({ setPwaAction, validActions: new Set() })),
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent(HUB_OPEN_MODULE_EVENT, {
          detail: { module: "finyk", action: "bogus" },
        }),
      );
    });
    expect(setPwaAction).not.toHaveBeenCalled();
  });

  it("switches to settings and navigates on the open-settings event", () => {
    const navigate = vi.fn();
    const setHubView = vi.fn();
    renderHook(() =>
      useAppEffects(
        makeDeps({
          navigate: navigate as never,
          ui: {
            searchOpen: false,
            hubView: "dashboard",
            setHubView,
            setSearchOpen: vi.fn(),
            closeSearch: vi.fn(),
            closeSearchAfterNavigation: vi.fn(),
            searchQuery: "",
            openSearch: vi.fn(),
          },
        }),
      ),
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent(HUB_OPEN_SETTINGS_EVENT, {
          detail: { section: "modules" },
        }),
      );
    });
    expect(setHubView).toHaveBeenCalledWith("settings", { syncUrl: false });
    expect(navigate).toHaveBeenCalledWith("/?tab=settings#settings-modules");
  });

  it("navigates to the bare settings tab when no section is given", () => {
    const navigate = vi.fn();
    renderHook(() => useAppEffects(makeDeps({ navigate: navigate as never })));
    act(() => {
      window.dispatchEvent(
        new CustomEvent(HUB_OPEN_SETTINGS_EVENT, { detail: {} }),
      );
    });
    expect(navigate).toHaveBeenCalledWith("/?tab=settings");
  });

  it("settles the legacy cloud-pull request event without throwing", () => {
    bootReaderMock.mockResolvedValue(null);
    renderHook(() => useAppEffects(makeDeps()));
    expect(() => {
      act(() => {
        window.dispatchEvent(new Event(REQUEST_PULL_EVENT));
      });
    }).not.toThrow();
  });

  // PR-H3 pin: the request runs a real reader tick, and completion is
  // emitted only after `pullOnce()` settles, carrying its outcome.
  it("runs pullOnce and emits ok:true only after the tick resolves", async () => {
    const tick = deferred<unknown>();
    const pullOnce = vi.fn(() => tick.promise);
    bootReaderMock.mockResolvedValue({ pullOnce });
    const completions = captureCompletions();
    try {
      renderHook(() => useAppEffects(makeDeps()));
      await act(async () => {
        window.dispatchEvent(new Event(REQUEST_PULL_EVENT));
        await Promise.resolve();
      });
      expect(bootReaderMock).toHaveBeenCalledTimes(1);
      expect(pullOnce).toHaveBeenCalledTimes(1);
      expect(completions.outcomes).toEqual([]);

      await act(async () => {
        tick.resolve({ pulled: 1 });
        await tick.promise;
      });
      expect(completions.outcomes).toEqual([{ ok: true }]);
    } finally {
      completions.stop();
    }
  });

  it("emits ok:false when the pull tick fails (offline, 5xx)", async () => {
    const tick = deferred<unknown>();
    bootReaderMock.mockResolvedValue({ pullOnce: () => tick.promise });
    const completions = captureCompletions();
    try {
      renderHook(() => useAppEffects(makeDeps()));
      await act(async () => {
        window.dispatchEvent(new Event(REQUEST_PULL_EVENT));
        await Promise.resolve();
      });
      expect(completions.outcomes).toEqual([]);

      await act(async () => {
        tick.reject(new TypeError("Failed to fetch"));
        await tick.promise.catch(() => undefined);
      });
      expect(completions.outcomes).toEqual([{ ok: false }]);
    } finally {
      completions.stop();
    }
  });

  it("treats a follower tab (no reader) as a successful pull", async () => {
    bootReaderMock.mockResolvedValue(null);
    const completions = captureCompletions();
    try {
      renderHook(() => useAppEffects(makeDeps()));
      await act(async () => {
        window.dispatchEvent(new Event(REQUEST_PULL_EVENT));
      });
      expect(completions.outcomes).toEqual([{ ok: true }]);
    } finally {
      completions.stop();
    }
  });

  it("opens a module when the service worker posts OPEN_MODULE", () => {
    const openModule = vi.fn();
    let messageHandler: ((event: Event) => void) | null = null;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        addEventListener: (type: string, handler: EventListener) => {
          if (type === "message")
            messageHandler = handler as (event: Event) => void;
        },
        removeEventListener: vi.fn(),
      },
    });
    renderHook(() => useAppEffects(makeDeps({ openModule })));
    act(() => {
      messageHandler?.(
        new MessageEvent("message", {
          data: { type: "OPEN_MODULE", module: "nutrition" },
        }),
      );
    });
    expect(openModule).toHaveBeenCalledWith("nutrition", {
      source: "pwa_shortcut",
    });
  });
});
