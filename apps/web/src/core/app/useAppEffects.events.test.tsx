/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { openChatMock, onHubBusMock, prefetchHubMock, prefetchModulesMock } =
  vi.hoisted(() => ({
    openChatMock: vi.fn(),
    onHubBusMock: vi.fn((_event: string) => () => {}),
    prefetchHubMock: vi.fn(),
    prefetchModulesMock: vi.fn(),
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
vi.mock("../lib/useRoutePrefetch", () => ({
  prefetchHubNavigationPages: prefetchHubMock,
  prefetchCriticalModules: prefetchModulesMock,
}));

import { useAppEffects, type AppEffectsDeps } from "./useAppEffects";
import {
  HUB_OPEN_MODULE_EVENT,
  HUB_OPEN_SETTINGS_EVENT,
} from "@shared/lib/modules/hubNav";
import { REQUEST_PULL_EVENT } from "@shared/lib/modules/cloudPullRequest";

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

  it("kicks off prefetch on mount", () => {
    renderHook(() => useAppEffects(makeDeps()));
    expect(prefetchHubMock).toHaveBeenCalled();
  });

  it("registers the openChat and openSearch hub-bus listeners", () => {
    renderHook(() => useAppEffects(makeDeps()));
    const events = onHubBusMock.mock.calls.map((c) => c[0]);
    expect(events).toContain("openChat");
    expect(events).toContain("openSearch");
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
    expect(openModule).toHaveBeenCalledWith("finyk", { hash: "tab" });
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
    expect(setHubView).toHaveBeenCalledWith("settings");
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
    renderHook(() => useAppEffects(makeDeps()));
    expect(() => {
      act(() => {
        window.dispatchEvent(new Event(REQUEST_PULL_EVENT));
      });
    }).not.toThrow();
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
    expect(openModule).toHaveBeenCalledWith("nutrition");
  });
});
