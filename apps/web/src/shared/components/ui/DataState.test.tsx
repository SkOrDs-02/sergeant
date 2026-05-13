/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DataState } from "./DataState";

afterEach(cleanup);

/**
 * Contract tests for the DataState wrapper. Locks the precedence
 * (error → loading → empty → success), the `refetch` plumbing, and
 * the `stale` slot behaviour for background refetches.
 */
describe("DataState", () => {
  it("renders the skeleton while the query is loading", () => {
    render(
      <DataState
        query={{ data: undefined, isLoading: true }}
        skeleton={<div data-testid="skeleton">…</div>}
      >
        {(data: number[]) => <span data-testid="body">{data.length}</span>}
      </DataState>,
    );
    expect(screen.getByTestId("skeleton")).toBeTruthy();
    expect(screen.queryByTestId("body")).toBeNull();
  });

  it("renders the empty slot when data is an empty array", () => {
    render(
      <DataState
        query={{ data: [] as number[], isLoading: false }}
        empty={<div data-testid="empty">Порожньо</div>}
      >
        {(data) => <span data-testid="body">{data.length}</span>}
      </DataState>,
    );
    expect(screen.getByTestId("empty")).toBeTruthy();
    expect(screen.queryByTestId("body")).toBeNull();
  });

  it("treats undefined data as empty when an empty slot is present", () => {
    // Use a custom isEmpty so `data === null` counts as empty for an
    // envelope-shaped response; default would also do so for plain
    // `undefined`, but we exercise the custom path here.
    render(
      <DataState
        query={{ data: { items: [] }, isLoading: false }}
        isEmpty={(d) => d.items.length === 0}
        empty={<div data-testid="empty">Нема</div>}
      >
        {(d) => <span data-testid="body">{d.items.length}</span>}
      </DataState>,
    );
    expect(screen.getByTestId("empty")).toBeTruthy();
  });

  it("renders the error slot and forwards refetch via the retry callback", () => {
    const refetch = vi.fn();
    const errorRenderer = vi.fn((err: Error, retry: () => void) => (
      <button data-testid="retry" onClick={retry}>
        {err.message}
      </button>
    ));

    render(
      <DataState
        query={{
          data: undefined,
          isError: true,
          error: new Error("boom"),
          refetch,
        }}
        error={errorRenderer}
      >
        {() => <span data-testid="body" />}
      </DataState>,
    );

    const retryBtn = screen.getByTestId("retry");
    expect(retryBtn.textContent).toBe("boom");
    fireEvent.click(retryBtn);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("error wins even when stale data is present in the cache", () => {
    render(
      <DataState
        query={{
          data: [1, 2, 3],
          isError: true,
          error: new Error("network down"),
        }}
      >
        {(data: number[]) => <span data-testid="body">{data.length}</span>}
      </DataState>,
    );
    // Default fallback now delegates to `<EmptyState variant="danger">`,
    // which renders inside `role="status"` (correct per WAI-ARIA — empty/
    // error placeholders are advisory, not interruptive). The eyebrow
    // chip carries "Помилка"; the description carries the raw message.
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Помилка")).toBeTruthy();
    expect(screen.getByText("network down")).toBeTruthy();
    expect(screen.queryByTestId("body")).toBeNull();
  });

  it("renders body + stale slot when data is fresh and a refetch is in flight", () => {
    render(
      <DataState
        query={{ data: [1], isLoading: false, isFetching: true }}
        stale={(_data, isStale) =>
          isStale ? <span data-testid="stale">refreshing</span> : null
        }
      >
        {(data: number[]) => <span data-testid="body">{data.length}</span>}
      </DataState>,
    );
    expect(screen.getByTestId("stale")).toBeTruthy();
    expect(screen.getByTestId("body").textContent).toBe("1");
  });

  it("renders nothing when query is indeterminate (no data, no error, not loading)", () => {
    const { container } = render(
      <DataState query={{ data: undefined, isLoading: false }}>
        {() => <span data-testid="body" />}
      </DataState>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("default error fallback exposes a retry button that calls refetch", () => {
    const refetch = vi.fn();
    render(
      <DataState
        query={{
          data: undefined,
          isError: true,
          error: new Error("oops"),
          refetch,
        }}
      >
        {() => <span data-testid="body" />}
      </DataState>,
    );
    fireEvent.click(screen.getByRole("button", { name: /спробувати/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("falls through to children when no empty slot is provided even for an empty array", () => {
    render(
      <DataState query={{ data: [] as number[], isLoading: false }}>
        {(data) => <span data-testid="body">len={data.length}</span>}
      </DataState>,
    );
    // No `empty` prop ⇒ DataState should NOT swallow the call. Body
    // owns the decision so callers can render their own zero-state.
    expect(screen.getByTestId("body").textContent).toBe("len=0");
  });

  it("falls back to React Query v5 `isPending` when `isLoading` is absent", () => {
    render(
      <DataState
        query={{ data: undefined, isPending: true }}
        skeleton={<div data-testid="skeleton">…</div>}
      >
        {() => <span data-testid="body" />}
      </DataState>,
    );
    expect(screen.getByTestId("skeleton")).toBeTruthy();
  });
});
