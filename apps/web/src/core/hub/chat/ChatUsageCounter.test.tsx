/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BillingAccess } from "@sergeant/shared";
import { accessFixture } from "../../../test/helpers/billingAccess";

const { usePlanMock } = vi.hoisted(() => ({ usePlanMock: vi.fn() }));
vi.mock("../../billing/usePlan", () => ({ usePlan: () => usePlanMock() }));

import { ChatUsageCounter } from "./ChatUsageCounter";

function withMeter(used: number, limit: number | null): BillingAccess {
  const a = accessFixture(limit == null ? "pro" : "free");
  return {
    ...a,
    meters: {
      ...a.meters,
      aiActions: { used, limit, resetsAt: "2026-06-14T21:00:00.000Z" },
    },
  };
}

describe("ChatUsageCounter (тижневий лічильник зі знімка доступу)", () => {
  beforeEach(() => {
    usePlanMock.mockReset();
  });

  it("renders nothing while the billing snapshot is not loaded", () => {
    usePlanMock.mockReturnValue({ access: null });
    render(<ChatUsageCounter />);
    expect(screen.queryByTestId("chat-usage-counter")).not.toBeInTheDocument();
  });

  it("renders nothing for Premium (no weekly limit)", () => {
    usePlanMock.mockReturnValue({ access: withMeter(4, null) });
    render(<ChatUsageCounter />);
    expect(screen.queryByTestId("chat-usage-counter")).not.toBeInTheDocument();
  });

  it("shows x/20 and the Monday reset for a Free plan", () => {
    usePlanMock.mockReturnValue({ access: withMeter(3, 20) });
    render(<ChatUsageCounter />);
    const pill = screen.getByTestId("chat-usage-counter");
    expect(pill).toHaveTextContent("3/20");
    expect(pill).toHaveTextContent("понеділок");
  });

  it("shows the exhausted CTA with a pricing link when the week is used up", () => {
    usePlanMock.mockReturnValue({ access: withMeter(20, 20) });
    render(<ChatUsageCounter />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/pricing");
  });
});
