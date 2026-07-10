/** @vitest-environment jsdom */
/**
 * Shell / render smoke for `HubModals` — lazy HubSearch wiring inside
 * ErrorBoundary + Suspense. Heavy search engine behaviour is covered under
 * `core/hub/search/`; here we only assert mount safety and the dialog
 * landmark when search is open.
 */
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../lib/lazyImport", () => ({
  lazyImport: (
    _factory: unknown,
    name: string,
  ): ComponentType<{
    onClose: () => void;
    onOpenModule: (id: string) => void;
  }> => {
    const Stub = ({
      onClose,
    }: {
      onClose: () => void;
      onOpenModule: (id: string) => void;
    }) => (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Глобальний пошук"
        data-testid={`lazy-${name}`}
      >
        <button type="button" onClick={onClose}>
          close
        </button>
      </div>
    );
    Stub.displayName = name;
    return Stub;
  },
}));

import { HubModals } from "./HubModals";

describe("HubModals — shell smoke", () => {
  afterEach(() => cleanup());

  it("renders nothing when search is closed", () => {
    const { container } = render(
      <HubModals
        searchOpen={false}
        onCloseSearch={vi.fn()}
        onOpenModule={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("mounts HubSearch when search is open and exposes the dialog landmark", () => {
    expect(() =>
      render(
        <HubModals
          searchOpen={true}
          onCloseSearch={vi.fn()}
          onOpenModule={vi.fn()}
        />,
      ),
    ).not.toThrow();

    const dialog = screen.getByRole("dialog", { name: "Глобальний пошук" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByTestId("lazy-HubSearch")).toBeInTheDocument();
  });
});
