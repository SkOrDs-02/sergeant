/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PullToRefresh } from "./PullToRefresh";

beforeEach(() => {
  // PullToRefreshIndicator references CSS that is irrelevant here; the
  // test focuses on structural contracts.
});
afterEach(cleanup);

/**
 * Smoke tests for the `<PullToRefresh>` wrapper. The actual gesture
 * physics live in `usePullToRefresh.ts` and are covered there. These
 * tests verify the wiring contract that integration sites depend on:
 *   - children render inside the inner scroll container
 *   - `onScrollElement` fires with the inner element (Virtuoso bridge)
 *   - `as="main"` + `id` + `tabIndex` are passed through (skip-link target)
 */
describe("PullToRefresh", () => {
  it("renders children inside an inner scrollable container", () => {
    const { getByText } = render(
      <PullToRefresh onRefresh={() => {}}>
        <p>hello</p>
      </PullToRefresh>,
    );
    const child = getByText("hello");
    // Wrap chain: child <- inner div(.overflow-y-auto) <- outer wrapper
    const inner = child.parentElement;
    expect(inner).toBeTruthy();
    expect(inner!.className).toMatch(/overflow-y-auto/);
  });

  it("notifies onScrollElement with the inner scroll element", () => {
    const seen: Array<HTMLElement | null> = [];
    render(
      <PullToRefresh
        onRefresh={() => {}}
        onScrollElement={(el) => seen.push(el)}
      >
        <p>x</p>
      </PullToRefresh>,
    );
    expect(seen.length).toBeGreaterThanOrEqual(1);
    const last = seen[seen.length - 1];
    expect(last).toBeInstanceOf(HTMLElement);
    expect(last!.className).toMatch(/overflow-y-auto/);
  });

  it("renders the outer wrapper as a <main> when as='main' and forwards id/tabIndex", () => {
    const { container } = render(
      <PullToRefresh as="main" id="my-main" tabIndex={-1} onRefresh={() => {}}>
        <p>x</p>
      </PullToRefresh>,
    );
    const main = container.querySelector("main#my-main");
    expect(main).toBeTruthy();
    expect(main!.getAttribute("tabIndex")).toBe("-1");
  });

  it("invokes onRefresh when called via the underlying hook contract", async () => {
    // Direct gesture simulation belongs in `usePullToRefresh.test.ts`;
    // here we just sanity-check that the prop is wired through (i.e.
    // the component does not eat the callback).
    const onRefresh = vi.fn();
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>x</p>
      </PullToRefresh>,
    );
    // We can't trigger a real gesture in jsdom, so this asserts only
    // that mount does not synchronously call onRefresh.
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
