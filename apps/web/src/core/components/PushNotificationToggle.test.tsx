/** @vitest-environment jsdom */
/**
 * Branch coverage for `PushNotificationToggle` — supported / denied /
 * subscribed / loading states without exercising the full push stack.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushState = {
  supported: true,
  permission: "default" as NotificationPermission,
  subscribed: false,
  loading: false,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
};

vi.mock("@shared/hooks/usePushNotifications", () => ({
  usePushNotifications: () => pushState,
}));

import { PushNotificationToggle } from "./PushNotificationToggle";

describe("PushNotificationToggle", () => {
  afterEach(() => {
    cleanup();
    pushState.supported = true;
    pushState.permission = "default";
    pushState.subscribed = false;
    pushState.loading = false;
    vi.clearAllMocks();
  });

  it("renders nothing when push is unsupported", () => {
    pushState.supported = false;
    const { container } = render(<PushNotificationToggle />);
    expect(container.firstChild).toBeNull();
  });

  it("shows blocked copy and disables the switch when permission is denied", () => {
    pushState.permission = "denied";
    render(<PushNotificationToggle />);

    expect(
      screen.getByText("Заблоковано в налаштуваннях браузера"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Увімкнути push-сповіщення" }),
    ).toBeDisabled();
  });

  it("calls subscribe when toggled on from the off state", async () => {
    const user = userEvent.setup();
    render(<PushNotificationToggle />);

    await user.click(
      screen.getByRole("button", { name: "Увімкнути push-сповіщення" }),
    );
    expect(pushState.subscribe).toHaveBeenCalledTimes(1);
    expect(pushState.unsubscribe).not.toHaveBeenCalled();
  });

  it("calls unsubscribe when toggled off from the on state", async () => {
    pushState.subscribed = true;
    const user = userEvent.setup();
    render(<PushNotificationToggle />);

    expect(
      screen.getByText("Увімкнено — звички, тренування, бюджет"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Вимкнути push-сповіщення" }),
    );
    expect(pushState.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("disables the switch while loading", () => {
    pushState.loading = true;
    render(<PushNotificationToggle />);
    expect(
      screen.getByRole("button", { name: "Увімкнути push-сповіщення" }),
    ).toBeDisabled();
  });
});
