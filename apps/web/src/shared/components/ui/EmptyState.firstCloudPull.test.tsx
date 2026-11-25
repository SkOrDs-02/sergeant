/** @vitest-environment jsdom */
/**
 * Last validated: 2026-11-21
 * Status: Active
 *
 * data-59/60: поки копія не наздогнала акаунт, порожній стан модуля
 * показує «Завантажую з хмари…», а після вичерпаних повторів помилку з
 * «Ще раз» замість заклику «Додай першу…».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ModuleEmptyState } from "./EmptyState";
import {
  __resetInitialPullStateForTests,
  markFirstPullPending,
  markFirstPullSettled,
  noteFirstPullFailure,
} from "../../../core/syncEngine/initialPullState";
import { REQUEST_PULL_EVENT } from "@shared/lib/modules/cloudPullRequest";
import { coreMessages } from "@shared/i18n/uk.core";

const copy = coreMessages.firstCloudPull;
const finykTitle = coreMessages.moduleEmpty.finyk.title;

beforeEach(() => __resetInitialPullStateForTests());
afterEach(() => {
  cleanup();
  __resetInitialPullStateForTests();
});

describe("ModuleEmptyState під час першого pull", () => {
  it("без першого pull показує звичайний порожній стан", () => {
    render(<ModuleEmptyState module="finyk" />);
    expect(screen.getByText(finykTitle)).toBeTruthy();
    expect(screen.queryByText(copy.loadingTitle)).toBeNull();
  });

  it("поки перший pull іде, замість заклику «Завантажую з хмари…»", () => {
    render(<ModuleEmptyState module="routine" onAction={() => {}} />);
    act(() => markFirstPullPending());
    expect(screen.getByText(copy.loadingTitle)).toBeTruthy();
    expect(
      screen.queryByText(coreMessages.moduleEmpty.routine.title),
    ).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();

    act(() => markFirstPullSettled());
    expect(
      screen.getByText(coreMessages.moduleEmpty.routine.title),
    ).toBeTruthy();
  });

  it("після вичерпаних повторів: помилка з «Ще раз», що запускає pull", () => {
    render(<ModuleEmptyState module="finyk" />);
    act(() => {
      markFirstPullPending();
      noteFirstPullFailure(0);
    });
    expect(screen.getByText(copy.failedTitle)).toBeTruthy();
    expect(screen.queryByText(finykTitle)).toBeNull();

    const onRequest = vi.fn();
    window.addEventListener(REQUEST_PULL_EVENT, onRequest);
    try {
      fireEvent.click(screen.getByRole("button", { name: copy.retry }));
      expect(onRequest).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(REQUEST_PULL_EVENT, onRequest);
    }
  });
});
