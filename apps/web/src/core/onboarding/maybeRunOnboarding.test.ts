// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./demoSeed", () => ({
  runDemoSeedFromUrl: vi.fn(),
  runDemoCleanupOnce: vi.fn(),
}));

import { maybeRunOnboarding } from "./index";
import { runDemoSeedFromUrl, runDemoCleanupOnce } from "./demoSeed";

function setHref(href: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(href),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setHref("https://app.test/");
});

describe("maybeRunOnboarding", () => {
  it("no-op when no demo or welcome param is present", async () => {
    await maybeRunOnboarding();
    expect(runDemoSeedFromUrl).not.toHaveBeenCalled();
    expect(runDemoCleanupOnce).not.toHaveBeenCalled();
  });

  it("calls runDemoSeedFromUrl when ?demo=1", async () => {
    setHref("https://app.test/?demo=1");
    await maybeRunOnboarding();
    expect(runDemoSeedFromUrl).toHaveBeenCalledTimes(1);
    expect(runDemoCleanupOnce).not.toHaveBeenCalled();
  });

  it("calls runDemoCleanupOnce when ?demo=reset", async () => {
    setHref("https://app.test/?demo=reset");
    await maybeRunOnboarding();
    expect(runDemoCleanupOnce).toHaveBeenCalledTimes(1);
    expect(runDemoSeedFromUrl).not.toHaveBeenCalled();
  });

  it("no-op when only ?welcome param (no demo handler)", async () => {
    setHref("https://app.test/?welcome=1");
    await maybeRunOnboarding();
    expect(runDemoSeedFromUrl).not.toHaveBeenCalled();
    expect(runDemoCleanupOnce).not.toHaveBeenCalled();
  });
});
