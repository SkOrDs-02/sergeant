// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FinykStatsStrip } from "./FinykStatsStrip";

const todayStart = new Date(2026, 5, 1);

describe("FinykStatsStrip", () => {
  it("renders nothing when there is no data to show", () => {
    const { container } = render(
      <FinykStatsStrip
        subsMonthly={0}
        subsCount={0}
        nextCharge={null}
        urgentLiability={null}
        todayStart={todayStart}
        showBalance
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the subscriptions tile and fires its handler", () => {
    const onOpenSubs = vi.fn();
    render(
      <FinykStatsStrip
        subsMonthly={1200}
        subsCount={3}
        nextCharge={null}
        todayStart={todayStart}
        showBalance
        onOpenSubs={onOpenSubs}
      />,
    );
    expect(screen.getByText("Підписки · міс")).toBeInTheDocument();
    expect(screen.getByText(/3 активних/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Підписки · міс"));
    expect(onOpenSubs).toHaveBeenCalled();
  });

  it("masks amounts when showBalance is false", () => {
    render(
      <FinykStatsStrip
        subsMonthly={1200}
        subsCount={1}
        nextCharge={null}
        todayStart={todayStart}
        showBalance={false}
      />,
    );
    // Masked value and singular hint.
    expect(screen.getByText("••••")).toBeInTheDocument();
    expect(screen.getByText(/1 активна/)).toBeInTheDocument();
  });

  it("renders the next-charge tile", () => {
    render(
      <FinykStatsStrip
        subsMonthly={0}
        subsCount={0}
        nextCharge={{
          sign: "-",
          amount: 500,
          label: "Spotify",
          dueDate: new Date(2026, 5, 5),
        }}
        todayStart={todayStart}
        showBalance
      />,
    );
    expect(screen.getByText("Наступний платіж")).toBeInTheDocument();
    expect(screen.getByText(/Spotify/)).toBeInTheDocument();
  });
});
