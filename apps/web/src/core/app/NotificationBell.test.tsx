/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotificationBell, type HubNotification } from "./NotificationBell";

function note(overrides: Partial<HubNotification> = {}): HubNotification {
  return {
    id: "sw-update",
    icon: "refresh-cw",
    title: "Доступна нова версія",
    actionLabel: "Оновити",
    onAction: vi.fn(),
    ...overrides,
  };
}

describe("NotificationBell", () => {
  afterEach(() => cleanup());

  it("renders nothing when there are no notifications", () => {
    const { container } = render(<NotificationBell notifications={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a bell with the pending count badge", () => {
    render(<NotificationBell notifications={[note(), note({ id: "b" })]} />);
    const trigger = screen.getByRole("button", { name: "Сповіщення: 2" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("2");
  });

  it("opens the dropdown menu on click and lists notifications", () => {
    render(
      <NotificationBell
        notifications={[
          note({
            title: "Доступна нова версія",
            description: "Опис оновлення",
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Сповіщення/ }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Доступна нова версія")).toBeInTheDocument();
    expect(screen.getByText("Опис оновлення")).toBeInTheDocument();
  });

  it("invokes onAction and closes the menu", () => {
    const onAction = vi.fn();
    render(<NotificationBell notifications={[note({ onAction })]} />);

    fireEvent.click(screen.getByRole("button", { name: /Сповіщення/ }));
    fireEvent.click(screen.getByText("Оновити"));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders the dismiss affordance only when onDismiss is provided", () => {
    const onDismiss = vi.fn();
    render(
      <NotificationBell
        notifications={[note({ onDismiss, actionLabel: "Встановити" })]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Сповіщення/ }));

    const later = screen.getByText("Пізніше");
    fireEvent.click(later);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // Dismiss does NOT close the popover (only onAction does).
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on Escape and on outside click", () => {
    render(<NotificationBell notifications={[note()]} />);
    const trigger = screen.getByRole("button", { name: /Сповіщення/ });

    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    // Re-open then click outside.
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("collapses the popover when the last notification clears", () => {
    const { rerender } = render(<NotificationBell notifications={[note()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Сповіщення/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    rerender(<NotificationBell notifications={[]} />);
    // Whole component unmounts once count hits 0.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Сповіщення/ }),
    ).not.toBeInTheDocument();
  });
});
