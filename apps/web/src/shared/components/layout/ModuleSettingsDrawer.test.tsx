// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

type SwipeMock = {
  dragging: boolean;
  dragOffset: number;
  bind: Record<string, unknown>;
};

const { useDialogFocusTrap, useBodyScrollLock, useSwipeToDismiss } = vi.hoisted(
  () => ({
    useDialogFocusTrap: vi.fn(),
    useBodyScrollLock: vi.fn(),
    useSwipeToDismiss: vi.fn(),
  }),
);

vi.mock("@shared/hooks/useDialogFocusTrap", () => ({ useDialogFocusTrap }));
vi.mock("@shared/hooks/useBodyScrollLock", () => ({ useBodyScrollLock }));
vi.mock("@shared/hooks/useSwipeToDismiss", () => ({ useSwipeToDismiss }));

import { ModuleSettingsDrawer } from "./ModuleSettingsDrawer";

const idleSwipe: SwipeMock = {
  dragging: false,
  dragOffset: 0,
  bind: { "data-testid": "drawer-drag-handle" },
};

describe("ModuleSettingsDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSwipeToDismiss.mockReturnValue(idleSwipe);
  });

  it("returns null while closed but still wires hooks with disabled swipe", () => {
    const { container } = render(
      <ModuleSettingsDrawer open={false} onClose={vi.fn()} title="Settings">
        Hidden
      </ModuleSettingsDrawer>,
    );

    expect(container.firstChild).toBeNull();
    expect(useDialogFocusTrap).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ current: null }),
      expect.objectContaining({ inertBackground: true }),
    );
    expect(useBodyScrollLock).toHaveBeenCalledWith(false);
    expect(useSwipeToDismiss).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, direction: "right" }),
    );
  });

  it("renders an accessible right-side drawer and closes from both affordances", () => {
    const onClose = vi.fn();
    render(
      <ModuleSettingsDrawer
        open
        onClose={onClose}
        title="Фінік налаштування"
        className="extra-drawer"
      >
        <button type="button">Зберегти</button>
      </ModuleSettingsDrawer>,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Фінік налаштування",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.className).toContain("extra-drawer");
    expect(
      screen.getByRole("button", { name: "Зберегти" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("drawer-drag-handle")).toHaveTextContent(
      "Фінік налаштування",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Закрити налаштування" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(useDialogFocusTrap).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ current: expect.any(HTMLDivElement) }),
      expect.objectContaining({ onEscape: onClose, inertBackground: true }),
    );
    expect(useBodyScrollLock).toHaveBeenCalledWith(true);
    expect(useSwipeToDismiss).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, direction: "right" }),
    );
  });

  it("moves the panel while a right-swipe dismissal is active", () => {
    useSwipeToDismiss.mockReturnValue({
      dragging: true,
      dragOffset: 48,
      bind: { "data-testid": "drawer-drag-handle" },
    });

    render(
      <ModuleSettingsDrawer open onClose={vi.fn()} title="Drawer">
        Body
      </ModuleSettingsDrawer>,
    );

    expect(screen.getByRole("dialog")).toHaveStyle({
      transform: "translate3d(48px, 0, 0)",
      transition: "none",
    });
  });
});
