/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { BillingStatusResponse } from "@sergeant/shared";

const { statusMock } = vi.hoisted(() => ({
  statusMock:
    vi.fn<
      (opts?: { signal?: AbortSignal }) => Promise<BillingStatusResponse>
    >(),
}));

vi.mock("@shared/api", () => ({
  billingApi: { status: statusMock, createCheckout: vi.fn() },
}));

import { TrialBanner } from "./TrialBanner";
import { accessFixture } from "../../test/helpers/billingAccess";

function LocationProbe({ onChange }: { onChange: (path: string) => void }) {
  const location = useLocation();
  onChange(`${location.pathname}${location.search}`);
  return null;
}

function Wrapper({
  onLocationChange,
  children,
}: {
  onLocationChange?: (path: string) => void;
  children: ReactNode;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                {onLocationChange && (
                  <LocationProbe onChange={onLocationChange} />
                )}
                {children}
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const NOW = new Date("2026-05-13T12:00:00.000Z").getTime();
const fixedNow = () => NOW;

function trialingResponse(daysFromNow: number): BillingStatusResponse {
  const periodEnd = new Date(
    NOW + daysFromNow * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    subscription: {
      id: 7,
      provider: "manual",
      plan: "pro",
      status: "trialing",
      active: true,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
    access: accessFixture(daysFromNow >= 0 ? "trial" : "free", {
      trialEndsAt: daysFromNow >= 0 ? periodEnd : null,
    }),
  };
}

describe("TrialBanner (спека access-tiers)", () => {
  beforeEach(() => {
    statusMock.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing when a trial still has more than 2 days left", async () => {
    statusMock.mockResolvedValue(trialingResponse(3));
    const { container, findByText } = render(
      <Wrapper>
        <TrialBanner now={fixedNow} />
        <p>placeholder</p>
      </Wrapper>,
    );
    await findByText("placeholder");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("renders nothing while the billing status query is in flight", () => {
    statusMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <Wrapper>
        <TrialBanner now={fixedNow} />
      </Wrapper>,
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("renders nothing for a free / unauthenticated caller (status query rejects)", async () => {
    statusMock.mockRejectedValue(new Error("Not authenticated"));
    const { container, findByText } = render(
      <Wrapper>
        <TrialBanner now={fixedNow} />
        <p>placeholder</p>
      </Wrapper>,
    );
    await findByText("placeholder");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("renders nothing for an active (non-trialing) Pro subscription", async () => {
    statusMock.mockResolvedValue({
      subscription: {
        id: 11,
        provider: "stripe",
        plan: "pro",
        status: "active",
        active: true,
        currentPeriodEnd: new Date(
          NOW + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        cancelAtPeriodEnd: false,
      },
      access: accessFixture("pro"),
    });
    const { container, findByText } = render(
      <Wrapper>
        <TrialBanner now={fixedNow} />
        <p>placeholder</p>
      </Wrapper>,
    );
    await findByText("placeholder");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("renders the inline variant when the trial has 2 days left", async () => {
    statusMock.mockResolvedValue(trialingResponse(2));
    render(
      <Wrapper>
        <TrialBanner now={fixedNow} />
      </Wrapper>,
    );
    const banner = await screen.findByRole("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(banner.getAttribute("data-trial-banner-variant")).toBe("inline");
    expect(banner.textContent).toContain("2 дні");
    expect(
      screen.getByRole("button", { name: /Перейти на Premium/ }),
    ).toBeTruthy();
  });

  it("switches to the sticky variant when only 1 day remains", async () => {
    statusMock.mockResolvedValue(trialingResponse(1));
    render(
      <Wrapper>
        <TrialBanner now={fixedNow} />
      </Wrapper>,
    );
    const banner = await screen.findByRole("status");
    expect(banner.getAttribute("data-trial-banner-variant")).toBe("sticky");
    expect(banner.textContent).toContain("1 день");
  });

  it("renders nothing once the trial ended and the state is free", async () => {
    statusMock.mockResolvedValue(trialingResponse(-1));
    const { container, findByText } = render(
      <Wrapper>
        <TrialBanner now={fixedNow} />
        <p>placeholder</p>
      </Wrapper>,
    );
    await findByText("placeholder");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("grace: оплата не пройшла, банер з датою кінця grace", async () => {
    statusMock.mockResolvedValue({
      subscription: {
        id: 9,
        provider: "liqpay",
        plan: "pro",
        status: "past_due",
        active: true,
        currentPeriodEnd: "2026-05-12T12:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      access: accessFixture("grace", {
        graceEndsAt: "2026-05-15T12:00:00.000Z",
      }),
    });
    render(
      <Wrapper>
        <TrialBanner now={fixedNow} />
      </Wrapper>,
    );
    const banner = await screen.findByRole("status");
    expect(banner.textContent).toContain("Оплата не пройшла");
    expect(banner.textContent).toContain("15 травня");
  });

  it("navigates to /pricing?source=trial_banner when the CTA is pressed", async () => {
    statusMock.mockResolvedValue(trialingResponse(1));
    const locations: string[] = [];
    render(
      <Wrapper onLocationChange={(p) => locations.push(p)}>
        <TrialBanner now={fixedNow} />
      </Wrapper>,
    );
    const cta = await screen.findByRole("button", {
      name: /Перейти на Premium/,
    });
    fireEvent.click(cta);
    expect(locations.at(-1)).toBe("/pricing?source=trial_banner");
  });
});
