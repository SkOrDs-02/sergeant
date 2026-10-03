// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  SHELL_DEEPLINK_CHANNEL,
  SHELL_DEEPLINK_QUEUE_KEY,
} from "@sergeant/shared";

/**
 * Integration test for `ShellDeepLinkBridge` — BroadcastChannel + queue drain.
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
  delete (window as Window & { [SHELL_DEEPLINK_QUEUE_KEY]?: unknown })[
    SHELL_DEEPLINK_QUEUE_KEY
  ];
});

afterEach(async () => {
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
    await waitFor(
      () => expect(loc.textContent).toBe("/finyk/transactions/42"),
      { timeout: 2000 },
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
    await waitFor(() => expect(warnSpy).toHaveBeenCalled(), { timeout: 2000 });
    expect(loc.textContent).toBe("/");
    sender.close();
    warnSpy.mockRestore();
  });
});

describe("ShellDeepLinkBridge — cold-start queue", () => {
  it("drains pre-mount __sergeantShellDeepLinkQueue on install (cold-start)", async () => {
    (window as Window & { [SHELL_DEEPLINK_QUEUE_KEY]?: string[] })[
      SHELL_DEEPLINK_QUEUE_KEY
    ] = ["/welcome"];
    const loc = renderBridge();
    await waitFor(() => expect(loc.textContent).toBe("/welcome"), {
      timeout: 2000,
    });
    expect(
      (window as Window & { [SHELL_DEEPLINK_QUEUE_KEY]?: string[] })[
        SHELL_DEEPLINK_QUEUE_KEY
      ],
    ).toEqual([]);
  });
});

describe("ShellDeepLinkBridge — coalescing window", () => {
  it("the same (path, timestamp) delivered via channel + queue navigates only once", async () => {
    const ts = Date.now();
    (window as Window & { [SHELL_DEEPLINK_QUEUE_KEY]?: string[] })[
      SHELL_DEEPLINK_QUEUE_KEY
    ] = ["/chat"];

    const loc = renderBridge();
    await waitFor(() => expect(loc.textContent).toBe("/chat"), {
      timeout: 2000,
    });

    const sender = new BroadcastChannel(SHELL_DEEPLINK_CHANNEL);
    sender.postMessage({
      protocolVersion: 1,
      url: "/chat",
      source: "shell",
      timestamp: ts,
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(loc.textContent).toBe("/chat");

    sender.close();
  });
});
