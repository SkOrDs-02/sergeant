/** @vitest-environment jsdom */
/**
 * Branch coverage for HubModulesGrid — edit mode toggle and inactive-module
 * visibility affordance.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HubModulesGrid } from "./HubModulesGrid";

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
  closestCenter: vi.fn(),
  useSensors: () => [],
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => (
    <div data-testid="sortable-context">{children}</div>
  ),
  rectSortingStrategy: vi.fn(),
}));

vi.mock("./dashboard/BentoCard", () => ({
  SortableCard: ({ id }: { id: string }) => (
    <div data-testid={`card-${id}`}>{id}</div>
  ),
}));

vi.mock("@shared/components/ui/Icon", () => ({
  Icon: () => <span />,
}));

function renderGrid(
  overrides: Partial<Parameters<typeof HubModulesGrid>[0]> = {},
) {
  const toggleEditMode = vi.fn();
  const toggleHideInactive = vi.fn();
  const props = {
    density: "comfortable" as const,
    editMode: false,
    toggleEditMode,
    displayOrder: ["finyk", "fizruk"],
    sensors: [],
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    onOpenModule: vi.fn(),
    activeModules: ["finyk", "fizruk"],
    adaptive: { liftedId: null, reason: null },
    hasInactive: true,
    hideInactive: false,
    toggleHideInactive,
    ...overrides,
  };
  render(<HubModulesGrid {...props} />);
  return { toggleEditMode, toggleHideInactive };
}

describe("HubModulesGrid", () => {
  afterEach(() => cleanup());

  it("enters edit mode when the configure button is pressed", () => {
    const { toggleEditMode } = renderGrid();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Налаштувати порядок модулів/i,
      }),
    );
    expect(toggleEditMode).toHaveBeenCalled();
  });

  it("shows the done label while edit mode is active", () => {
    renderGrid({ editMode: true });
    expect(
      screen.getByRole("button", {
        name: /Завершити налаштування порядку модулів/i,
      }),
    ).toHaveTextContent("Готово");
  });

  it("toggles inactive module visibility when the footer link is clicked", () => {
    const { toggleHideInactive } = renderGrid({ hideInactive: true });
    fireEvent.click(
      screen.getByRole("button", { name: /Показати неактивні модулі/i }),
    );
    expect(toggleHideInactive).toHaveBeenCalled();
  });

  it("renders a card per module in displayOrder", () => {
    renderGrid();
    expect(screen.getByTestId("card-finyk")).toBeInTheDocument();
    expect(screen.getByTestId("card-fizruk")).toBeInTheDocument();
  });
});
