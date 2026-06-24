// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionSyncPill } from "./TransactionSyncPill";

describe("TransactionSyncPill", () => {
  it("renders nothing when idle with no lastUpdated", () => {
    const { container } = render(
      <TransactionSyncPill syncState={{ status: "idle" }} lastUpdated={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the success pill with network source and account counts", () => {
    render(
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
    expect(screen.getByText("мережа")).toBeInTheDocument();
    expect(screen.getByText("6/6")).toBeInTheDocument();
  });

  it("renders the error pill", () => {
    render(
      <TransactionSyncPill
        syncState={{ status: "error", source: "cache" }}
        lastUpdated={null}
      />,
    );
    expect(screen.getByText("помилка")).toBeInTheDocument();
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

  it("renders the last-updated timestamp even when idle", () => {
    render(
      <TransactionSyncPill
        syncState={{ status: "idle" }}
        lastUpdated={new Date("2026-06-03T10:55:00+03:00")}
      />,
    );
    expect(screen.getByText(/оновлено ·/)).toBeInTheDocument();
  });
});
