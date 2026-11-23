// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { openHubModuleWithAction } from "@shared/lib/modules/hubNav";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { isFinykBalanceHidden } from "../../modules/finyk/lib/balanceVisibility";
import { HubSpendHero } from "./HubSpendHero";
import {
  __resetInitialPullStateForTests,
  markFirstPullPending,
  noteFirstPullFailure,
} from "../syncEngine/initialPullState";
import { coreMessages } from "@shared/i18n/uk.core";

vi.mock("@shared/lib/storage/storage", () => ({ safeReadStringLS: vi.fn() }));
vi.mock(
  "../../modules/finyk/lib/balanceVisibility",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    isFinykBalanceHidden: vi.fn(() => false),
  }),
);
vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModuleWithAction: vi.fn(),
}));
afterEach(() => {
  cleanup();
  __resetInitialPullStateForTests();
  vi.mocked(openHubModuleWithAction).mockClear();
  vi.useRealTimers();
  vi.mocked(isFinykBalanceHidden).mockReturnValue(false);
});

describe("HubSpendHero quick expense action", () => {
  it("кнопка «Додати витрату» поруч із числом викликає інтент add_expense", () => {
    vi.mocked(safeReadStringLS).mockReturnValue(
      JSON.stringify({ todaySpent: 250, dayPlan: 1000, todayPoints: [] }),
    );
    render(<HubSpendHero />);
    const btn = screen.getByRole("button", { name: "Додати витрату" });
    expect(btn).toHaveTextContent("Витрата");
    fireEvent.click(btn);
    expect(openHubModuleWithAction).toHaveBeenCalledWith(
      "finyk",
      "add_expense",
      "hub_dashboard",
    );
  });

  it("порожній день (0 ₴) лишає кнопку: число показано нулем", () => {
    vi.mocked(safeReadStringLS).mockReturnValue(
      JSON.stringify({ todaySpent: 0, dayPlan: null, todayPoints: [] }),
    );
    render(<HubSpendHero />);
    expect(
      screen.getByRole("button", { name: "Додати витрату" }),
    ).toBeInTheDocument();
  });

  it("без знімка hero немає, а отже немає й кнопки", () => {
    vi.mocked(safeReadStringLS).mockReturnValue(null);
    render(<HubSpendHero />);
    expect(screen.queryByRole("button", { name: "Додати витрату" })).toBeNull();
  });

  it("при прихованих сумах кнопка лишається, суми замасковані", () => {
    vi.mocked(isFinykBalanceHidden).mockReturnValue(true);
    vi.mocked(safeReadStringLS).mockReturnValue(
      JSON.stringify({ todaySpent: 1234, dayPlan: null, todayPoints: [] }),
    );
    render(<HubSpendHero />);
    expect(
      screen.getByRole("button", { name: "Додати витрату" }),
    ).toBeInTheDocument();
  });
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

describe("HubSpendHero під час першого pull (bv-first-pull-gaps)", () => {
  const copy = coreMessages.firstCloudPull;

  it("нуль дня до кінця першого pull: «Завантажую з хмари…», а не «0 ₴»", () => {
    vi.mocked(safeReadStringLS).mockReturnValue(
      JSON.stringify({ todaySpent: 0, dayPlan: 1000, todayPoints: [] }),
    );
    render(<HubSpendHero />);
    expect(screen.getByText("0")).toBeInTheDocument();

    act(() => markFirstPullPending());
    expect(screen.getByText(copy.loadingTitle)).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("вичерпані повтори: помилка з «Ще раз»", () => {
    vi.mocked(safeReadStringLS).mockReturnValue(
      JSON.stringify({ todaySpent: 0, dayPlan: null, todayPoints: [] }),
    );
    render(<HubSpendHero />);
    act(() => {
      markFirstPullPending();
      for (let i = 0; i < 4; i += 1) noteFirstPullFailure(3);
    });
    expect(screen.getByText(copy.failedTitle)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: copy.retry }),
    ).toBeInTheDocument();
  });

  it("ненульові витрати під час pull показуються як є", () => {
    vi.mocked(safeReadStringLS).mockReturnValue(
      JSON.stringify({ todaySpent: 250, dayPlan: null, todayPoints: [] }),
    );
    render(<HubSpendHero />);
    act(() => markFirstPullPending());
    expect(screen.queryByText(copy.loadingTitle)).toBeNull();
    expect(screen.getByText("250")).toBeInTheDocument();
  });
});
