// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { HubSpendHero } from "./HubSpendHero";

vi.mock("@shared/lib/storage/storage", () => ({ safeReadStringLS: vi.fn() }));
afterEach(cleanup);

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
});
