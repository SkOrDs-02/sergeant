// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SyncStatusBadge } from "./SyncStatusBadge";

describe("SyncStatusBadge", () => {
  it("renders the idle (waiting) label by default", () => {
    render(<SyncStatusBadge />);
    expect(screen.getByText("Очікування")).toBeInTheDocument();
  });

  it("renders the loading label when status=loading", () => {
    render(<SyncStatusBadge syncState={{ status: "loading" }} />);
    expect(screen.getByText("Синхронізація…")).toBeInTheDocument();
  });

  it("renders the loading label when the loading prop is set", () => {
    render(<SyncStatusBadge loading />);
    expect(screen.getByText("Синхронізація…")).toBeInTheDocument();
  });

  it("renders the success label", () => {
    render(<SyncStatusBadge syncState={{ status: "success" }} />);
    expect(screen.getByText("Синхронізовано")).toBeInTheDocument();
  });

  it("shows a retry button on error and fires onRetry", () => {
    const onRetry = vi.fn();
    render(
      <SyncStatusBadge syncState={{ status: "error" }} onRetry={onRetry} />,
    );
    expect(screen.getByText("Помилка синхронізації")).toBeInTheDocument();
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a retry button on partial status", () => {
    const onRetry = vi.fn();
    render(
      <SyncStatusBadge syncState={{ status: "partial" }} onRetry={onRetry} />,
    );
    expect(screen.getByText("Часткова синхронізація")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("does not show a retry button on success even with onRetry", () => {
    render(
      <SyncStatusBadge syncState={{ status: "success" }} onRetry={vi.fn()} />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("formats a valid lastUpdated timestamp as HH:MM", () => {
    render(
      <SyncStatusBadge
        syncState={{ status: "success" }}
        lastUpdated={new Date("2026-06-03T10:05:00+03:00")}
      />,
    );
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it("renders no timestamp for a null or invalid lastUpdated", () => {
    const { container } = render(
      <SyncStatusBadge syncState={{ status: "success" }} lastUpdated={null} />,
    );
    expect(container.querySelector(".tabular-nums")).toBeNull();
  });

  it("renders an inline error message when not loading", () => {
    render(<SyncStatusBadge error="Token expired" />);
    expect(screen.getByText("Token expired")).toBeInTheDocument();
  });
});
