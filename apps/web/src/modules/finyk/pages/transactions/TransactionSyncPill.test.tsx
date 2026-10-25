// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SYNC_FLASH_MS, TransactionSyncPill } from "./TransactionSyncPill";

describe("TransactionSyncPill", () => {
  it("renders nothing when idle with no lastUpdated", () => {
    const { container } = render(
      <TransactionSyncPill syncState={{ status: "idle" }} lastUpdated={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a steady success", () => {
    const { container } = render(
      <TransactionSyncPill
        syncState={{
          status: "success",
          source: "network",
          accountsOk: 6,
          accountsTotal: 6,
        }}
        lastUpdated={new Date()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("flashes success after a refresh, then hides", () => {
    vi.useFakeTimers();
    const { rerender, container } = render(
      <TransactionSyncPill
        syncState={{ status: "loading" }}
        lastUpdated={null}
      />,
    );
    rerender(
      <TransactionSyncPill
        syncState={{
          status: "success",
          source: "network",
          accountsOk: 6,
          accountsTotal: 6,
        }}
        lastUpdated={null}
      />,
    );
    expect(screen.getByText("синхронізовано")).toBeInTheDocument();
    expect(screen.getByText("6/6")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(SYNC_FLASH_MS);
    });
    expect(container.firstChild).toBeNull();
    vi.useRealTimers();
  });

  it("renders the error pill", () => {
    render(
      <TransactionSyncPill
        syncState={{ status: "error", source: "cache" }}
        lastUpdated={null}
      />,
    );
    expect(screen.getByText("не синхронізовано")).toBeInTheDocument();
    expect(screen.getByText("кеш")).toBeInTheDocument();
  });

  it("renders the partial and loading labels", () => {
    const { rerender } = render(
      <TransactionSyncPill
        syncState={{ status: "partial", source: "none" }}
        lastUpdated={null}
      />,
    );
    expect(screen.getByText("частково")).toBeInTheDocument();
    // source=none → "нема"
    expect(screen.getByText("нема")).toBeInTheDocument();

    rerender(
      <TransactionSyncPill
        syncState={{ status: "loading" }}
        lastUpdated={null}
      />,
    );
    expect(screen.getByText("оновлення…")).toBeInTheDocument();
  });

  it("hides the last-updated timestamp when idle", () => {
    const { container } = render(
      <TransactionSyncPill
        syncState={{ status: "idle" }}
        lastUpdated={new Date("2026-06-03T10:55:00+03:00")}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
