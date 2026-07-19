import { describe, it, expect, vi, beforeEach } from "vitest";
import { setModulePrefetcher, getModulePrefetchProps } from "./intentPrefetch";

describe("intentPrefetch", () => {
  beforeEach(() => {
    // Reset the module-level registry to a known no-op state between
    // tests (there is no exported reset — re-registering a no-op works
    // just as well since the registry only ever holds a single fn ref).
    setModulePrefetcher(() => {});
  });

  it("no-ops silently when no prefetcher has been registered yet", () => {
    setModulePrefetcher(null as unknown as () => void);
    const props = getModulePrefetchProps("finyk");
    expect(() => props.onMouseEnter()).not.toThrow();
    expect(() => props.onFocus()).not.toThrow();
  });

  it("calls the registered prefetcher with the module id on mouse enter", () => {
    const prefetch = vi.fn();
    setModulePrefetcher(prefetch);
    const props = getModulePrefetchProps("fizruk");
    props.onMouseEnter();
    expect(prefetch).toHaveBeenCalledWith("fizruk");
  });

  it("calls the registered prefetcher with the module id on focus", () => {
    const prefetch = vi.fn();
    setModulePrefetcher(prefetch);
    const props = getModulePrefetchProps("routine");
    props.onFocus();
    expect(prefetch).toHaveBeenCalledWith("routine");
  });

  it("updates the active prefetcher when re-registered", () => {
    const first = vi.fn();
    const second = vi.fn();
    setModulePrefetcher(first);
    setModulePrefetcher(second);
    const props = getModulePrefetchProps("nutrition");
    props.onMouseEnter();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("nutrition");
  });
});
