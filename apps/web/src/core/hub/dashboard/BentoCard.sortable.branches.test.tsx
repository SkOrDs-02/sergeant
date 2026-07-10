/** @vitest-environment jsdom */
/**
 * Branch coverage for SortableCard — inactive cards route to settings and
 * edit mode wires dnd-kit activators separately from navigation.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SortableCard } from "./BentoCard";

const openSettingsMock = vi.fn();

vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubSettingsSection: (...args: unknown[]) => openSettingsMock(...args),
}));

vi.mock("../../lib/intentPrefetch", () => ({
  getModulePrefetchProps: () => ({ "data-prefetch": "finyk" }),
}));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: { "data-sortable": "yes" },
    listeners: { onPointerDown: vi.fn() },
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

describe("SortableCard", () => {
  afterEach(() => {
    cleanup();
    openSettingsMock.mockReset();
  });

  it("opens dashboard settings when an inactive card is clicked", () => {
    render(<SortableCard id="finyk" onOpenModule={vi.fn()} inactive />);
    fireEvent.click(screen.getByRole("button", { name: /неактивний модуль/i }));
    expect(openSettingsMock).toHaveBeenCalledWith("dashboard");
  });

  it("opens the module when the card is active", () => {
    const onOpenModule = vi.fn();
    render(<SortableCard id="finyk" onOpenModule={onOpenModule} />);
    fireEvent.click(screen.getByRole("button", { name: /Фінік/i }));
    expect(onOpenModule).toHaveBeenCalledWith("finyk");
  });
});
