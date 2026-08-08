// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Hit } from "./searchTypes";

const performSearch = vi.hoisted(() => vi.fn<(q: string) => Hit[]>(() => []));
const navigate = vi.hoisted(() => vi.fn());
const emitHubBus = vi.hoisted(() => vi.fn());
const openHubModuleWithAction = vi.hoisted(() => vi.fn());
const announceSettingsHashChange = vi.hoisted(() => vi.fn());
const hapticTap = vi.hoisted(() => vi.fn());
const askInline = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const resetInline = vi.hoisted(() => vi.fn());
const pushRecentQuery = vi.hoisted(() => vi.fn((q: string) => [q]));
const clearRecentQueries = vi.hoisted(() => vi.fn());
const getRecentQueries = vi.hoisted(() => vi.fn(() => ["попередній"]));

vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("./searchSources", () => ({ performSearch }));
vi.mock("@shared/lib/modules/hubBus", () => ({ emitHubBus }));
vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModuleWithAction,
  announceSettingsHashChange,
}));
vi.mock("@shared/lib/adapters/haptic", () => ({ hapticTap }));
vi.mock("../hubSearchEngine", () => ({
  getRecentQueries,
  pushRecentQuery,
  clearRecentQueries,
}));
vi.mock("./useInlineAiRail", () => ({
  useInlineAiRail: () => ({
    state: { status: "idle" },
    ask: askInline,
    reset: resetInline,
    cancel: vi.fn(),
  }),
}));

import { useSearchEngine } from "./useSearchEngine";

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function hit(
  partial: Partial<Hit> & Pick<Hit, "id" | "module" | "target">,
): Hit {
  return {
    moduleLabel: "",
    title: "",
    subtitle: "",
    icon: "",
    _score: 1,
    ...partial,
  } as Hit;
}

const onClose = vi.fn();
const onOpenModule = vi.fn();

function setup() {
  return renderHook(() => useSearchEngine({ onClose, onOpenModule }), {
    wrapper,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  performSearch.mockReturnValue([]);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useSearchEngine", () => {
  it("seeds recents from storage and performs an empty search initially", () => {
    const { result } = setup();
    expect(result.current.recents).toEqual(["попередній"]);
    expect(performSearch).toHaveBeenCalledWith("");
  });

  it("debounces search for queries of length >= 2", () => {
    performSearch.mockReturnValue([
      hit({
        id: "f1",
        module: "finyk",
        target: { kind: "module", moduleId: "finyk" },
      }),
    ]);
    const { result } = setup();
    act(() => result.current.setQuery("каву"));
    act(() => vi.advanceTimersByTime(120));
    expect(result.current.results.length).toBeGreaterThan(0);
  });

  it("openHit: module hit calls onOpenModule + onClose", () => {
    const { result } = setup();
    act(() =>
      result.current.openHit(
        hit({
          id: "m1",
          module: "finyk",
          target: { kind: "module", moduleId: "finyk" },
        }),
      ),
    );
    expect(hapticTap).toHaveBeenCalled();
    expect(onOpenModule).toHaveBeenCalledWith("finyk");
    expect(onClose).toHaveBeenCalled();
  });

  it("openHit: ai-handoff resolves inline without closing", () => {
    const { result } = setup();
    act(() =>
      result.current.openHit(
        hit({
          id: "a1",
          module: "ai",
          target: { kind: "ai-handoff", query: "питання" },
        }),
      ),
    );
    expect(askInline).toHaveBeenCalledWith("питання");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("openHit: settings hit navigates to the dedicated /settings route", () => {
    const { result } = setup();
    act(() =>
      result.current.openHit(
        hit({ id: "s1", module: "settings", target: { kind: "settings" } }),
      ),
    );
    expect(navigate).toHaveBeenCalledWith({ pathname: "/settings", hash: "" });
  });

  // L-13 (audit 2026-08-08): `hit.target.sectionId` was computed by
  // `searchSettings.ts` for every settings hit but silently dropped here —
  // clicking a ⌘K settings result (e.g. "Підписка та план") always landed
  // on whichever inner Settings tab happened to be open, never on the
  // section the user actually searched for. Regression guard: a settings
  // hit that carries `sectionId` must navigate with the matching
  // `#settings-<id>` hash — the same deep-link shape `HubSettingsPage`
  // already reads on mount.
  it("openHit: settings hit with sectionId navigates to its #settings-<id> hash and re-announces hashchange (audit finding #2a)", () => {
    const { result } = setup();
    act(() =>
      result.current.openHit(
        hit({
          id: "s2",
          module: "settings",
          target: { kind: "settings", sectionId: "plan" },
        }),
      ),
    );
    expect(navigate).toHaveBeenCalledWith({
      pathname: "/settings",
      hash: "#settings-plan",
    });
    // Audit finding #2a: react-router's `navigate()` alone never fires a
    // native `hashchange` event, so `SettingsGroup`'s anchor auto-open
    // (which only listens for that event) silently no-op'd on every ⌘K
    // settings hit landing on an ALREADY-mounted Settings page. This is
    // the regression guard for the manual re-announce that fixes it —
    // `announceSettingsHashChange` (`hubNav.ts`) is the shared helper that
    // does the actual `window.dispatchEvent(new Event("hashchange"))`,
    // covered directly by that module's own tests.
    expect(announceSettingsHashChange).toHaveBeenCalledTimes(1);
  });

  // Audit finding #2b: the previous version reused the CURRENT
  // `window.location.pathname`, so from a module route (`/finyk`, …) the
  // navigation silently landed on `/finyk?tab=settings#settings-…` — a URL
  // the Finyk module never reads — instead of anywhere near Settings.
  it("openHit: settings hit always targets /settings, regardless of the current route", () => {
    const original = `${window.location.pathname}${window.location.search}`;
    window.history.pushState(null, "", "/finyk?range=custom");
    const { result } = setup();
    act(() =>
      result.current.openHit(
        hit({
          id: "s3",
          module: "settings",
          target: { kind: "settings", sectionId: "notifications" },
        }),
      ),
    );
    expect(navigate).toHaveBeenCalledWith({
      pathname: "/settings",
      hash: "#settings-notifications",
    });
    window.history.pushState(null, "", original);
  });

  it("openHit: assistant with capability example opens chat", () => {
    const { result } = setup();
    act(() =>
      result.current.openHit(
        hit({
          id: "as1",
          module: "assistant",
          target: {
            kind: "assistant",
            capability: { examples: ["спробуй це"] } as never,
          },
        }),
      ),
    );
    expect(emitHubBus).toHaveBeenCalledWith("openChat", {
      message: "спробуй це",
      autoSend: false,
    });
  });

  it("openHit: assistant without example navigates to /assistant", () => {
    const { result } = setup();
    act(() =>
      result.current.openHit(
        hit({ id: "as2", module: "assistant", target: { kind: "assistant" } }),
      ),
    );
    expect(navigate).toHaveBeenCalledWith("/assistant");
  });

  it("openHit: action hit dispatches a module action", () => {
    const { result } = setup();
    act(() =>
      result.current.openHit(
        hit({
          id: "act1",
          module: "actions",
          target: {
            kind: "action",
            moduleId: "finyk" as never,
            action: "add" as never,
          },
        }),
      ),
    );
    expect(openHubModuleWithAction).toHaveBeenCalledWith("finyk", "add");
  });

  it("escalateToChat resets the rail, closes and emits openChat", () => {
    const { result } = setup();
    act(() => result.current.escalateToChat("ескалація"));
    expect(resetInline).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(emitHubBus).toHaveBeenCalledWith("openChat", {
      message: "ескалація",
      autoSend: false,
    });
  });

  it("commitQuery pushes a recent query and ignores blanks", () => {
    const { result } = setup();
    act(() => result.current.commitQuery("  "));
    expect(pushRecentQuery).not.toHaveBeenCalled();
    act(() => result.current.commitQuery("реальний"));
    expect(pushRecentQuery).toHaveBeenCalledWith("реальний");
    expect(result.current.recents).toEqual(["реальний"]);
  });

  it("pickRecent sets the query", () => {
    const { result } = setup();
    act(() => result.current.pickRecent("історія"));
    expect(result.current.query).toBe("історія");
  });

  it("clearRecents clears storage and state", () => {
    const { result } = setup();
    act(() => result.current.clearRecents());
    expect(clearRecentQueries).toHaveBeenCalled();
    expect(result.current.recents).toEqual([]);
  });

  it("keyboard nav: ArrowDown/ArrowUp move active index, Escape closes", () => {
    performSearch.mockReturnValue([
      hit({
        id: "k1",
        module: "finyk",
        target: { kind: "module", moduleId: "finyk" },
      }),
      hit({
        id: "k2",
        module: "fizruk",
        target: { kind: "module", moduleId: "fizruk" },
      }),
    ]);
    const { result } = setup();
    act(() => result.current.setQuery("ка"));
    act(() => vi.advanceTimersByTime(120));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown" }),
      );
    });
    expect(result.current.activeIdx).toBe(1);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    });
    expect(result.current.activeIdx).toBe(0);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("keyboard Enter activates the active hit", () => {
    performSearch.mockReturnValue([
      hit({
        id: "e1",
        module: "finyk",
        target: { kind: "module", moduleId: "finyk" },
      }),
    ]);
    const { result } = setup();
    act(() => result.current.setQuery("ка"));
    act(() => vi.advanceTimersByTime(120));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(onOpenModule).toHaveBeenCalledWith("finyk");
  });
});
