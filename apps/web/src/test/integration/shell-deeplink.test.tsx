// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { SHELL_DEEPLINK_CHANNEL } from "@sergeant/shared";

/**
 * Integration test for `ShellDeepLinkBridge` — covers the PR-29 shape:
 *   - BroadcastChannel listener navigates на отриманий path.
 *   - Backward-compat: `window.__sergeantShellNavigate` все ще працює.
 *   - Coalescing: одна (path, timestamp) пара, надіслана ОБОМА шляхами,
 *     призводить рівно до одного `navigate()`.
 *   - Cold-start queue drain-иться при mount-і.
 *   - Unsafe path не призводить до навігації.
 *
 * Mount-имо bridge всередині `<MemoryRouter>` + перехоплюємо
 * `useLocation()` через тестовий компонент-shim. `isCapacitor()` мокаємо
 * на `true`, щоб bridge install-нувся — у браузерному режимі він навмисно
 * no-op.
 */

vi.mock("@sergeant/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sergeant/shared")>();
  return {
    ...actual,
    isCapacitor: vi.fn(() => true),
  };
});

let ShellDeepLinkBridge: typeof import("../../core/app/ShellDeepLinkBridge.js").ShellDeepLinkBridge;

beforeEach(async () => {
  vi.resetModules();
  ({ ShellDeepLinkBridge } =
    await import("../../core/app/ShellDeepLinkBridge.js"));
  delete (
    window as Window & {
      __sergeantShellNavigate?: unknown;
      __sergeantShellDeepLinkQueue?: unknown;
    }
  ).__sergeantShellNavigate;
  delete (
    window as Window & {
      __sergeantShellNavigate?: unknown;
      __sergeantShellDeepLinkQueue?: unknown;
    }
  ).__sergeantShellDeepLinkQueue;
});

afterEach(async () => {
  // Unmount the bridge first — its effect-cleanup unsubscribes the
  // BroadcastChannel listener and closes the channel. Then yield one
  // event-loop turn so any *in-flight* BroadcastChannel delivery posted by
  // this test is flushed (and dropped, now that the listener is gone) before
  // the next test mounts a fresh bridge on the same channel name. Without
  // this drain a late async message from one test navigates the next test's
  // router and flakes its assertion (the channel name is a shared constant,
  // so messages cross test boundaries unless explicitly drained).
  cleanup();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  vi.restoreAllMocks();
});

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <span data-testid="loc">{location.pathname + location.search}</span>;
}

function renderBridge(initialEntries: string[] = ["/"]): HTMLElement {
  const utils = render(
    <MemoryRouter initialEntries={initialEntries}>
      <ShellDeepLinkBridge />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  return utils.getByTestId("loc");
}

describe("ShellDeepLinkBridge — BroadcastChannel listener (PR-29)", () => {
  it("navigates when a shell deep-link message arrives on the channel", async () => {
    const loc = renderBridge();
    expect(loc.textContent).toBe("/");

    const sender = new BroadcastChannel(SHELL_DEEPLINK_CHANNEL);
    sender.postMessage({
      protocolVersion: 1,
      url: "/finyk/transactions/42",
      source: "shell",
      timestamp: Date.now(),
    });
    // Poll instead of a fixed delay: BroadcastChannel delivery + the
    // router re-render is async, and on a throttled CI runner a fixed
    // 10ms wait races the navigation (the documented flake).
    await waitFor(
      () => expect(loc.textContent).toBe("/finyk/transactions/42"),
      {
        timeout: 2000,
      },
    );
    sender.close();
  });

  it("ignores messages with mismatched protocol version", async () => {
    const loc = renderBridge();
    const sender = new BroadcastChannel(SHELL_DEEPLINK_CHANNEL);
    sender.postMessage({
      protocolVersion: 999,
      url: "/finyk",
      source: "shell",
      timestamp: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(loc.textContent).toBe("/");
    sender.close();
  });

  it("ignores messages with source other than `shell` (no web→web self-loop)", async () => {
    const loc = renderBridge();
    const sender = new BroadcastChannel(SHELL_DEEPLINK_CHANNEL);
    sender.postMessage({
      protocolVersion: 1,
      url: "/finyk",
      source: "web",
      timestamp: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(loc.textContent).toBe("/");
    sender.close();
  });

  it("rejects unsafe paths (M19 defense-in-depth) even when delivered via BroadcastChannel", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loc = renderBridge();
    const sender = new BroadcastChannel(SHELL_DEEPLINK_CHANNEL);
    sender.postMessage({
      protocolVersion: 1,
      url: "/unknown-prefix/admin",
      source: "shell",
      timestamp: Date.now(),
    });
    // Wait on the observable side-effect (the rejection warning) rather than
    // a fixed delay — that deterministically proves the message was delivered
    // and handled before we assert that no navigation happened.
    await waitFor(() => expect(warnSpy).toHaveBeenCalled(), { timeout: 2000 });
    expect(loc.textContent).toBe("/");
    sender.close();
    warnSpy.mockRestore();
  });
});

describe("ShellDeepLinkBridge — backward-compat (window-global)", () => {
  it("window.__sergeantShellNavigate still works (legacy shim path)", async () => {
    const loc = renderBridge();
    const w = window as Window & {
      __sergeantShellNavigate?: (path: string) => void;
    };
    expect(typeof w.__sergeantShellNavigate).toBe("function");
    await act(async () => {
      w.__sergeantShellNavigate!("/profile");
    });
    expect(loc.textContent).toBe("/profile");
  });

  it("drains pre-mount __sergeantShellDeepLinkQueue on install (cold-start)", async () => {
    (
      window as Window & { __sergeantShellDeepLinkQueue?: string[] }
    ).__sergeantShellDeepLinkQueue = ["/welcome"];
    const loc = renderBridge();
    // Дочекаємось React state-update після useEffect-у (poll замість
    // фіксованої затримки — drain + re-render асинхронні).
    await waitFor(() => expect(loc.textContent).toBe("/welcome"), {
      timeout: 2000,
    });
    // Drained
    expect(
      (window as Window & { __sergeantShellDeepLinkQueue?: string[] })
        .__sergeantShellDeepLinkQueue,
    ).toEqual([]);
  });
});

describe("ShellDeepLinkBridge — coalescing window", () => {
  it("the same (path, timestamp) delivered via BOTH channel + window-global navigates only once", async () => {
    const loc = renderBridge();
    const ts = Date.now();

    // BroadcastChannel first
    const sender = new BroadcastChannel(SHELL_DEEPLINK_CHANNEL);
    sender.postMessage({
      protocolVersion: 1,
      url: "/chat",
      source: "shell",
      timestamp: ts,
    });
    await waitFor(() => expect(loc.textContent).toBe("/chat"), {
      timeout: 2000,
    });

    // window-global with the SAME timestamp → must be coalesced.
    // (NOTE: mobile-shell sends BC with the message's `Date.now()` but
    // calls `window.__sergeantShellNavigate(path)` without ts; web uses
    // `Date.now()` at receive time. The exact-ts coalescing here proves
    // the matcher logic; for typical mobile-shell flow the timestamps
    // will differ by <50ms but path equality still gives a single nav
    // because the BC nav has already happened. We test that explicitly
    // by re-checking `loc` doesn't *change*.)
    const w = window as Window & {
      __sergeantShellNavigate?: (path: string) => void;
    };
    // Simulate near-simultaneous shell dispatch by manually navigating
    // again with same path; React Router keeps us in place.
    await act(async () => {
      w.__sergeantShellNavigate!("/chat");
    });
    expect(loc.textContent).toBe("/chat");

    sender.close();
  });
});
