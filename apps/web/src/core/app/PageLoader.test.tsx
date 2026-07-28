/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PageLoader } from "./PageLoader";
import { messages } from "@shared/i18n/uk";

describe("PageLoader — Suspense fallback shell", () => {
  afterEach(() => cleanup());

  it("exposes a polite busy status region with the page-loading label", () => {
    render(<PageLoader />);
    const status = screen.getByRole("status", {
      name: messages.loaders.pageLoading,
    });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders skeleton placeholders for the hub header and cards", () => {
    const { container } = render(<PageLoader />);
    const pulses = container.querySelectorAll('[class*="animate-pulse"]');
    const skeletons = container.querySelectorAll('[aria-hidden="true"]');
    expect(pulses).toHaveLength(1);
    expect(skeletons.length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText(messages.status.loading)).toHaveClass("sr-only");
  });
});
