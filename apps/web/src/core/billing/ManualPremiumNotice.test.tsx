/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { planState } = vi.hoisted(() => ({
  planState: {
    state: "pro" as string,
    provider: "manual" as string | null,
    currentPeriodEnd: null as string | null,
  },
}));

vi.mock("./usePlan", () => ({
  usePlan: () => ({
    access: { state: planState.state },
    subscription: {
      provider: planState.provider,
      currentPeriodEnd: planState.currentPeriodEnd,
    },
  }),
}));

import {
  ManualPremiumNotice,
  manualPremiumNoticeState,
} from "./ManualPremiumNotice";

const NOW = new Date("2026-11-18T10:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  planState.state = "pro";
  planState.provider = "manual";
  planState.currentPeriodEnd = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("manualPremiumNoticeState", () => {
  const base: {
    accessState: string;
    provider: string;
    currentPeriodEnd: string | null;
  } = { accessState: "pro", provider: "manual", currentPeriodEnd: null };

  it.each([
    [240, "granted"],
    [36, "warning"],
    [12, "sticky"],
  ])("кінець через %i год: %s", (hours, stage) => {
    expect(
      manualPremiumNoticeState(
        { ...base, currentPeriodEnd: iso(NOW + hours * HOUR) },
        NOW,
      )?.stage,
    ).toBe(stage);
  });

  it.each([
    ["без кінця (founder, безстроковий грант)", { currentPeriodEnd: null }],
    [
      "reverse trial",
      { accessState: "trial", currentPeriodEnd: iso(NOW + HOUR) },
    ],
    [
      "платна підписка",
      { provider: "liqpay", currentPeriodEnd: iso(NOW + HOUR) },
    ],
    ["уже скінчився", { currentPeriodEnd: iso(NOW - HOUR) }],
  ])("%s: рядка немає", (_l, over) => {
    expect(manualPremiumNoticeState({ ...base, ...over }, NOW)).toBeNull();
  });
});

describe("ManualPremiumNotice", () => {
  it("кінець через 10 днів: «відкрито до», після закриття не повертається", () => {
    planState.currentPeriodEnd = iso(NOW + 240 * HOUR);
    const { unmount } = render(<ManualPremiumNotice />);
    expect(screen.getByTestId("manual-premium-notice")).toHaveTextContent(
      /^Premium відкрито до 28 листопада 2026/,
    );
    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(screen.queryByTestId("manual-premium-notice")).toBeNull();
    unmount();
    render(<ManualPremiumNotice />);
    expect(screen.queryByTestId("manual-premium-notice")).toBeNull();
  });

  it("кінець через 36 год: попередження, яке можна закрити", () => {
    planState.currentPeriodEnd = iso(NOW + 36 * HOUR);
    render(<ManualPremiumNotice />);
    expect(screen.getByTestId("manual-premium-notice")).toHaveTextContent(
      /^Premium діє до/,
    );
    expect(screen.getByRole("button", { name: "Закрити" })).toBeTruthy();
  });

  it("закритий рядок видачі не ховає попередження тієї ж видачі", () => {
    const end = iso(NOW + 36 * HOUR);
    localStorage.setItem(
      "hub_manual_premium_notice_dismissed_v1",
      `${end}|granted`,
    );
    planState.currentPeriodEnd = end;
    render(<ManualPremiumNotice />);
    expect(screen.getByTestId("manual-premium-notice")).toHaveTextContent(
      /Premium діє до/,
    );
  });

  it("кінець через 12 год: попередження без кнопки закриття і попри закриття", () => {
    const end = iso(NOW + 12 * HOUR);
    localStorage.setItem(
      "hub_manual_premium_notice_dismissed_v1",
      `${end}|warning`,
    );
    planState.currentPeriodEnd = end;
    render(<ManualPremiumNotice />);
    expect(screen.getByTestId("manual-premium-notice")).toHaveTextContent(
      /Premium діє до/,
    );
    expect(screen.queryByRole("button", { name: "Закрити" })).toBeNull();
  });

  it.each([
    ["currentPeriodEnd: null", { currentPeriodEnd: null }],
    [
      "state: trial",
      { state: "trial", currentPeriodEnd: iso(NOW + 36 * HOUR) },
    ],
  ])("%s: нуль рядків", (_l, over) => {
    Object.assign(planState, over);
    const { container } = render(<ManualPremiumNotice />);
    expect(container.innerHTML).toBe("");
  });
});
