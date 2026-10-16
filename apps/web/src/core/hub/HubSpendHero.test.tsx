// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { isFinykBalanceHidden } from "../../modules/finyk/lib/balanceVisibility";
import { HubSpendHero } from "./HubSpendHero";

vi.mock("@shared/lib/storage/storage", () => ({ safeReadStringLS: vi.fn() }));
vi.mock(
  "../../modules/finyk/lib/balanceVisibility",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    isFinykBalanceHidden: vi.fn(() => false),
  }),
);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.mocked(isFinykBalanceHidden).mockReturnValue(false);
});

describe("HubSpendHero money presentation", () => {
  it("uses the new snapshot's clock instead of the hour when the Hub first mounted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T06:00:00Z"));
    vi.mocked(safeReadStringLS).mockReturnValue(
      JSON.stringify({ todaySpent: 100, dayPlan: null, todayPoints: [] }),
    );
    const { rerender } = render(<HubSpendHero storageBump={0} />);
    expect(screen.getByTestId("hub-spend-hero")).toHaveTextContent("09:00");
    vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    rerender(<HubSpendHero storageBump={1} />);
    expect(screen.getByTestId("hub-spend-hero")).toHaveTextContent("18:00");
  });

  it("rolls the clock over after resuming on a new Kyiv day without a write", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T20:59:00Z"));
    vi.mocked(safeReadStringLS).mockReturnValue(
      JSON.stringify({ todaySpent: 0, dayPlan: null, todayPoints: [] }),
    );
    render(<HubSpendHero />);
    expect(screen.getByTestId("hub-spend-hero")).toHaveTextContent("23:59");
    act(() => {
      vi.setSystemTime(new Date("2026-10-16T06:00:00Z"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByTestId("hub-spend-hero")).toHaveTextContent("09:00");
  });

  it("shows whole hryvnias for fractional plans and expenses, like Finyk", () => {
    vi.mocked(safeReadStringLS).mockReturnValue(
      JSON.stringify({
        todaySpent: 100.55,
        dayPlan: 1666.6667,
        todayPoints: [],
      }),
    );
    render(<HubSpendHero />);
    const hero = screen.getByTestId("hub-spend-hero");
    expect(hero).not.toHaveTextContent(/\d,\d/);
    expect(hero).toHaveTextContent(/1\s667/);
    expect(hero).toHaveTextContent(/1\s566/);
  });
  it("при прихованих сумах не розкриває план, витрати й залишок", () => {
    vi.mocked(isFinykBalanceHidden).mockReturnValue(true);
    vi.mocked(safeReadStringLS).mockReturnValue(
      JSON.stringify({ todaySpent: 1234, dayPlan: 4321, todayPoints: [] }),
    );
    render(<HubSpendHero />);
    const hero = screen.getByTestId("hub-spend-hero");
    expect(hero).not.toHaveTextContent(/1\s234|4\s321|3\s087/);
    expect(hero).toHaveTextContent("••••");
  });
});
