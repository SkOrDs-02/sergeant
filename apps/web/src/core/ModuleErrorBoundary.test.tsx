// @vitest-environment jsdom
/**
 * Last validated: 2026-07-09
 * Status: Active
 * Unit tests for ModuleErrorBoundary — error catch / retry / back-to-hub flows.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ModuleErrorBoundary from "./ModuleErrorBoundary";
import * as chunkReload from "./lib/chunkReload";

vi.mock("./lib/chunkReload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/chunkReload")>()),
  reloadOnceForChunkError: vi.fn(),
}));

vi.mock("./observability/analytics", () => ({
  trackEvent: vi.fn(),
  ANALYTICS_EVENTS: {
    ERROR_BOUNDARY_REQUEST_ID_COPIED: "error_boundary_request_id_copied",
  },
}));

vi.mock("./observability/requestId", () => ({
  extractRequestId: vi.fn(() => undefined),
  isServerLikeError: vi.fn(() => false),
  copyRequestIdToClipboard: vi.fn((_id: string, cb: () => void) => cb()),
  makeCopyDoneCallback: vi.fn(
    (setState: (u: { copied: boolean }) => void) => () =>
      setState({ copied: true }),
  ),
}));

function ChunkBomb(): never {
  throw new Error("Failed to fetch dynamically imported module: /x.js");
}

function Bomb(): never {
  throw new Error("boom-module-failure");
}

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("ModuleErrorBoundary", () => {
  beforeEach(() => {
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when there is no error", () => {
    render(
      <ModuleErrorBoundary onBackToHub={vi.fn()}>
        <p data-testid="child">OK content</p>
      </ModuleErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("OK content")).toBeInTheDocument();
  });

  it("wraps children in a div.contents keyed by retryRev", () => {
    const { container } = render(
      <ModuleErrorBoundary onBackToHub={vi.fn()}>
        <p>child</p>
      </ModuleErrorBoundary>,
    );
    const wrapper = container.querySelector("div.contents");
    expect(wrapper).toBeInTheDocument();
  });

  it("catches a render error and shows the fallback UI with retry + back buttons", () => {
    render(
      <ModuleErrorBoundary onBackToHub={vi.fn()}>
        <Bomb />
      </ModuleErrorBoundary>,
    );

    expect(screen.getByText("Помилка в модулі")).toBeInTheDocument();
    // Button text is "Спробувати ще"; aria-label is "Спробувати ще раз"
    expect(screen.getByText("Спробувати ще")).toBeInTheDocument();
    expect(screen.getByText("До вибору модуля")).toBeInTheDocument();
  });

  it("calls onBackToHub when 'До вибору модуля' is clicked", () => {
    const onBackToHub = vi.fn();
    render(
      <ModuleErrorBoundary onBackToHub={onBackToHub}>
        <Bomb />
      </ModuleErrorBoundary>,
    );

    fireEvent.click(screen.getByText("До вибору модуля"));
    expect(onBackToHub).toHaveBeenCalledTimes(1);
  });

  it("retry button clears error — fallback disappears after retry click", () => {
    let shouldThrow = true;

    function MaybeThrow() {
      if (shouldThrow) throw new Error("err");
      return <p data-testid="recovered">Recovered</p>;
    }

    const { rerender } = render(
      <ModuleErrorBoundary onBackToHub={vi.fn()}>
        <MaybeThrow />
      </ModuleErrorBoundary>,
    );

    expect(screen.getByText("Помилка в модулі")).toBeInTheDocument();

    // Stop throwing, then click retry so boundary clears error and remounts
    shouldThrow = false;
    fireEvent.click(screen.getByText("Спробувати ще"));

    // Rerender with the same boundary (now MaybeThrow won't throw)
    rerender(
      <ModuleErrorBoundary onBackToHub={vi.fn()}>
        <MaybeThrow />
      </ModuleErrorBoundary>,
    );

    expect(screen.getByTestId("recovered")).toBeInTheDocument();
    expect(screen.queryByText("Помилка в модулі")).not.toBeInTheDocument();
  });

  it("does not show requestId panel when error has no requestId", () => {
    render(
      <ModuleErrorBoundary onBackToHub={vi.fn()}>
        <Bomb />
      </ModuleErrorBoundary>,
    );
    expect(
      screen.queryByTestId("module-error-request-id"),
    ).not.toBeInTheDocument();
  });

  describe("chunk-load error", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("shows a reload button (not retry) and reloads the page on click", () => {
      const reloadMock = vi.fn();
      vi.stubGlobal("location", { reload: reloadMock });
      render(
        <ModuleErrorBoundary onBackToHub={vi.fn()}>
          <ChunkBomb />
        </ModuleErrorBoundary>,
      );

      expect(screen.queryByText("Спробувати ще")).not.toBeInTheDocument();
      expect(screen.queryByText("Помилка в модулі")).not.toBeInTheDocument();
      expect(
        screen.getByText("Ця секція впала, але інші частини модуля працюють."),
      ).toBeInTheDocument();
      expect(screen.getByText("До вибору модуля")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Перезавантажити"));
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it("triggers the guarded auto-reload once on catch", () => {
      render(
        <ModuleErrorBoundary onBackToHub={vi.fn()}>
          <ChunkBomb />
        </ModuleErrorBoundary>,
      );
      expect(chunkReload.reloadOnceForChunkError).toHaveBeenCalledTimes(1);
    });

    it("does not reload or swap the retry button for a non-chunk error", () => {
      render(
        <ModuleErrorBoundary onBackToHub={vi.fn()}>
          <Bomb />
        </ModuleErrorBoundary>,
      );
      expect(chunkReload.reloadOnceForChunkError).not.toHaveBeenCalled();
      expect(screen.queryByText("Перезавантажити")).not.toBeInTheDocument();
      expect(screen.getByText("Спробувати ще")).toBeInTheDocument();
    });
  });
});
