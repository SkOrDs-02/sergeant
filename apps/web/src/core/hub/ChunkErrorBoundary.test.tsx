// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Component, type ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ChunkErrorBoundary from "./ChunkErrorBoundary";
import * as chunkReload from "../lib/chunkReload";

vi.mock("../lib/chunkReload", () => ({
  isChunkLoadError: vi.fn(),
  reloadOnceForChunkError: vi.fn(),
}));

function ChunkBomb(): never {
  const e = new Error("Failed to fetch dynamically imported module");
  e.name = "ChunkLoadError";
  throw e;
}

function PlainBomb(): never {
  throw new Error("kaboom-not-chunk");
}

// Parent boundary used to observe errors re-thrown by ChunkErrorBoundary.
class CatchAll extends Component<
  { children?: ReactNode },
  { err: Error | null }
> {
  override state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  override render() {
    return this.state.err ? (
      <p>{`outer-caught:${this.state.err.message}`}</p>
    ) : (
      this.props.children
    );
  }
}

describe("ChunkErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the reload card and auto-recovers on a chunk-load error", () => {
    vi.mocked(chunkReload.isChunkLoadError).mockReturnValue(true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ChunkErrorBoundary minH={56}>
        <ChunkBomb />
      </ChunkErrorBoundary>,
    );

    // Auto-recovery path fired exactly once (from componentDidCatch).
    expect(chunkReload.reloadOnceForChunkError).toHaveBeenCalledTimes(1);
    // Manual fallback card is shown instead of an infinite skeleton.
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Перезавантажити")).toBeTruthy();

    spy.mockRestore();
  });

  it("reloads the page when the manual button is pressed", () => {
    vi.mocked(chunkReload.isChunkLoadError).mockReturnValue(true);
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ChunkErrorBoundary>
        <ChunkBomb />
      </ChunkErrorBoundary>,
    );
    fireEvent.click(screen.getByText("Перезавантажити"));
    expect(reloadMock).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  it("re-throws non-chunk errors to the parent boundary", () => {
    vi.mocked(chunkReload.isChunkLoadError).mockReturnValue(false);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <CatchAll>
        <ChunkErrorBoundary>
          <PlainBomb />
        </ChunkErrorBoundary>
      </CatchAll>,
    );

    expect(screen.getByText("outer-caught:kaboom-not-chunk")).toBeTruthy();
    // The chunk recovery card must NOT appear for non-chunk errors.
    expect(screen.queryByText("Перезавантажити")).toBeNull();
    expect(chunkReload.reloadOnceForChunkError).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});
