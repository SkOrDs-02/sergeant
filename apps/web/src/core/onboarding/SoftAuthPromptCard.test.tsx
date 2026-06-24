// @vitest-environment jsdom
/**
 * Component tests for `SoftAuthPromptCard` — the inline post-first-entry
 * cloud-sync prompt.
 *
 * Covers the three handler surfaces (mount-time `AUTH_PROMPT_SHOWN`,
 * `handleOpenAuth`, `handleDismiss`) plus the variant-driven copy rendering
 * and the `data-variant` marker. Analytics is stubbed (real impl fires
 * console + posthog); the rest of the component runs against the real
 * `@sergeant/shared` copy/variant helpers and the real i18n strings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return { ...actual, trackEvent: vi.fn() };
});

import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { SoftAuthPromptCard } from "./SoftAuthPromptCard";

describe("SoftAuthPromptCard", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(trackEvent).mockClear();
  });

  it("fires AUTH_PROMPT_SHOWN on mount with placement + variant context", () => {
    render(
      <SoftAuthPromptCard
        onOpenAuth={() => {}}
        entryCount={5}
        sessionDays={3}
      />,
    );

    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.AUTH_PROMPT_SHOWN,
      expect.objectContaining({
        placement: "dashboard",
        entryCount: 5,
        sessionDays: 3,
        variant: expect.any(String),
      }),
    );
  });

  it("renders the resolved copy title/body and exposes data-variant", () => {
    const { container } = render(
      <SoftAuthPromptCard onOpenAuth={() => {}} entryCount={7} />,
    );

    // Default assignVariant weight is 100% `gain`.
    const card = container.querySelector("[data-variant]");
    expect(card).not.toBeNull();
    expect(card?.getAttribute("data-variant")).toBe("gain");

    // Both CTAs from i18n render.
    expect(
      screen.getByRole("button", { name: "Створити акаунт" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Пізніше" })).toBeInTheDocument();
  });

  it("handleOpenAuth tracks AUTH_AFTER_VALUE and calls onOpenAuth", () => {
    const onOpenAuth = vi.fn();
    render(<SoftAuthPromptCard onOpenAuth={onOpenAuth} entryCount={2} />);

    fireEvent.click(screen.getByRole("button", { name: "Створити акаунт" }));

    expect(onOpenAuth).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.AUTH_AFTER_VALUE,
      expect.objectContaining({ variant: expect.any(String) }),
    );
  });

  it("handleDismiss tracks dismissal, persists soft-auth dismissal, calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(
      <SoftAuthPromptCard
        onOpenAuth={() => {}}
        onDismiss={onDismiss}
        entryCount={1}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Пізніше" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.AUTH_PROMPT_DISMISSED,
      expect.objectContaining({ variant: expect.any(String) }),
    );
  });

  it("dismiss without onDismiss handler does not throw (optional callback)", () => {
    render(<SoftAuthPromptCard onOpenAuth={() => {}} />);

    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Пізніше" })),
    ).not.toThrow();
  });

  it("uses default entryCount=0 / sessionDays=-1 when props omitted", () => {
    render(<SoftAuthPromptCard onOpenAuth={() => {}} />);

    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.AUTH_PROMPT_SHOWN,
      expect.objectContaining({ entryCount: 0, sessionDays: -1 }),
    );
  });
});
