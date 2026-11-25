/** @vitest-environment jsdom */
/**
 * Last validated: 2026-11-23
 * Status: Active
 *
 * bv-first-pull-gaps: на новому пристрої «0 ₴ Загальний капітал» виглядав
 * як правдивий нуль, поки рахунки ще їдуть з хмари.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AssetsNetworthCard } from "./AssetsNetworthCard";
import {
  __resetInitialPullStateForTests,
  markFirstPullPending,
  noteFirstPullFailure,
} from "../../../core/syncEngine/initialPullState";
import { coreMessages } from "@shared/i18n/uk.core";

const copy = coreMessages.firstCloudPull;

beforeEach(() => __resetInitialPullStateForTests());
afterEach(() => {
  cleanup();
  __resetInitialPullStateForTests();
});

function renderCard(totalAssets: number, totalDebt: number) {
  return render(
    <AssetsNetworthCard
      networth={totalAssets - totalDebt}
      totalAssets={totalAssets}
      totalDebt={totalDebt}
      showBalance
    />,
  );
}

describe("AssetsNetworthCard під час першого pull", () => {
  it("без першого pull нульовий капітал показано як є", () => {
    renderCard(0, 0);
    expect(screen.getByText("Загальний капітал")).toBeInTheDocument();
    expect(screen.queryByText(copy.loadingTitle)).toBeNull();
  });

  it("нульовий капітал до кінця першого pull: «Завантажую з хмари…»", () => {
    renderCard(0, 0);
    act(() => markFirstPullPending());
    expect(screen.getByText(copy.loadingTitle)).toBeInTheDocument();
    expect(screen.queryByText("Загальний капітал")).toBeNull();
  });

  it("вичерпані повтори: помилка з «Ще раз»", () => {
    renderCard(0, 0);
    act(() => {
      markFirstPullPending();
      for (let i = 0; i < 4; i += 1) noteFirstPullFailure(3);
    });
    expect(screen.getByText(copy.failedTitle)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: copy.retry }),
    ).toBeInTheDocument();
  });

  it("ненульовий капітал під час pull лишається на місці", () => {
    renderCard(150_000, 0);
    act(() => markFirstPullPending());
    expect(screen.getByText("Загальний капітал")).toBeInTheDocument();
    expect(screen.queryByText(copy.loadingTitle)).toBeNull();
  });
});
