/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HubHeaderMenu, type HubHeaderMenuLabels } from "./HubHeaderMenu";

const hapticTapMock = vi.fn();

vi.mock("@shared/components/ui/Icon", () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock("@shared/components/ui/ThemeSwitcher", () => ({
  ThemeSwitcher: () => <div data-testid="theme-switcher" />,
}));

vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: () => hapticTapMock(),
}));

const labels: HubHeaderMenuLabels = {
  trigger: "Open hub menu",
  menu: "Hub menu",
  theme: "Theme",
  privacy: "Privacy",
  privacyDetail: "Data stays on this device",
};

describe("HubHeaderMenu", () => {
  afterEach(() => {
    cleanup();
    hapticTapMock.mockClear();
  });

  it("toggles the popover and renders secondary controls", () => {
    render(<HubHeaderMenu labels={labels} triggerClassName="custom-trigger" />);

    const trigger = screen.getByRole("button", { name: labels.trigger });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: labels.menu })).toBeInTheDocument();
    expect(screen.getByText(labels.theme)).toBeInTheDocument();
    expect(screen.getByTestId("theme-switcher")).toBeInTheDocument();
    expect(screen.queryByText(labels.privacy)).toBeNull();
  });

  it("opens the privacy detail row with haptics and then closes", () => {
    const onOpenPrivacy = vi.fn();
    render(<HubHeaderMenu labels={labels} onOpenPrivacy={onOpenPrivacy} />);

    fireEvent.click(screen.getByRole("button", { name: labels.trigger }));
    fireEvent.click(
      screen.getByRole("button", {
        name: `${labels.privacy}${labels.privacyDetail}`,
      }),
    );

    expect(hapticTapMock).toHaveBeenCalledTimes(1);
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu", { name: labels.menu })).toBeNull();
  });

  it("closes on outside click and Escape while restoring trigger focus", () => {
    render(
      <div>
        <button type="button">outside</button>
        <HubHeaderMenu labels={labels} />
      </div>,
    );

    const trigger = screen.getByRole("button", { name: labels.trigger });
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(screen.queryByRole("menu", { name: labels.menu })).toBeNull();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu", { name: labels.menu })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
