/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@shared/components/ui/Sheet", () => ({
  Sheet: ({
    open,
    onClose,
    title,
    description,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children?: ReactNode;
  }) =>
    open ? (
      <section role="dialog" aria-label={title}>
        {description && <p>{description}</p>}
        <button type="button" onClick={onClose}>
          Закрити
        </button>
        {children}
      </section>
    ) : null,
}));

import { SyncStatusSheet } from "./SyncStatusSheet";

describe("SyncStatusSheet", () => {
  afterEach(() => cleanup());

  it("renders nothing while closed", () => {
    render(
      <SyncStatusSheet
        open={false}
        onClose={vi.fn()}
        online
        pending={0}
        deadLetter={0}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("summarizes healthy online sync state without a retry button", () => {
    render(
      <SyncStatusSheet
        open
        onClose={vi.fn()}
        online
        pending={0}
        deadLetter={0}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Синхронізація" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Стан збереження даних у хмару"),
    ).toBeInTheDocument();
    expect(screen.getByText("Онлайн")).toBeInTheDocument();
    expect(screen.getByText("Нічого не чекає")).toBeInTheDocument();
    expect(screen.getByText("Немає")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Повторити синхронізацію" }),
    ).not.toBeInTheDocument();
  });

  it("shows offline queue/errors and retries before closing", () => {
    const onClose = vi.fn();
    const onRetry = vi.fn(() => Promise.resolve());
    render(
      <SyncStatusSheet
        open
        onClose={onClose}
        online={false}
        pending={3}
        deadLetter={2}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Офлайн")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Повторити синхронізацію" }),
    );

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
