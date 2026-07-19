/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { PrivacyLockBanner } from "./PrivacyLockBanner";

const openHubSettingsSection = vi.fn();
vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubSettingsSection: (...args: unknown[]) =>
    openHubSettingsSection(...args),
}));

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  openHubSettingsSection.mockClear();
});

describe("PrivacyLockBanner", () => {
  it("renders the banner by default (not dismissed)", () => {
    render(<PrivacyLockBanner />);
    expect(
      screen.getByRole("button", { name: /закрити/i }),
    ).toBeInTheDocument();
  });

  it("opens the privacy settings section when the CTA is clicked", () => {
    render(<PrivacyLockBanner />);
    const buttons = screen.getAllByRole("button");
    const cta = buttons.find((b) => b.getAttribute("aria-label") == null)!;
    fireEvent.click(cta);
    expect(openHubSettingsSection).toHaveBeenCalledWith("privacy");
  });

  it("dismisses and persists the dismissal to localStorage", () => {
    const { container } = render(<PrivacyLockBanner />);
    fireEvent.click(screen.getByRole("button", { name: /закрити/i }));
    expect(container.firstChild).toBeNull();
    expect(localStorage.getItem("sergeant.privacy.lockBanner.dismissed")).toBe(
      "true",
    );
  });

  it("does not render at all when previously dismissed", () => {
    localStorage.setItem("sergeant.privacy.lockBanner.dismissed", "true");
    const { container } = render(<PrivacyLockBanner />);
    expect(container.firstChild).toBeNull();
  });
});
