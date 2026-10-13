// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  vi.mocked(isFinykBalanceHidden).mockReturnValue(false);
});

describe("HubSpendHero money presentation", () => {
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
