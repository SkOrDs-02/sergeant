/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HubModals } from "./HubModals";

const hubSearchProps = vi.hoisted(() => ({
  latest: null as null | {
    onClose: () => void;
    onOpenModule: (id: string | null | undefined) => void;
  },
}));

vi.mock("../lib/lazyImport", () => ({
  lazyImport: () =>
    function MockHubSearch(props: {
      onClose: () => void;
      onOpenModule: (id: string | null | undefined) => void;
    }) {
      hubSearchProps.latest = props;
      return <div data-testid="hub-search-modal" />;
    },
}));

describe("HubModals", () => {
  afterEach(() => {
    cleanup();
    hubSearchProps.latest = null;
  });

  it("renders nothing when search is closed", () => {
    const { container } = render(
      <HubModals
        searchOpen={false}
        onCloseSearch={vi.fn()}
        onOpenModule={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
    expect(hubSearchProps.latest).toBeNull();
  });

  it("renders HubSearch with close and module handlers when search is open", () => {
    const onCloseSearch = vi.fn();
    const onOpenModule = vi.fn();
    render(
      <HubModals
        searchOpen
        onCloseSearch={onCloseSearch}
        onOpenModule={onOpenModule}
      />,
    );

    expect(screen.getByTestId("hub-search-modal")).toBeInTheDocument();

    hubSearchProps.latest?.onClose();
    hubSearchProps.latest?.onOpenModule("nutrition");

    expect(onCloseSearch).toHaveBeenCalledTimes(1);
    expect(onOpenModule).toHaveBeenCalledWith("nutrition");
  });
});
