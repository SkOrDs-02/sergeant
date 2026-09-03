// @vitest-environment jsdom
/**
 * Регресія з browser-QA 2026-09-02: вибір модулів в онбордингу писався лише
 * локально. `useActiveModulesSync` гідратує рівно раз на `userId` за сесію, і
 * для свіжого акаунта та гідрація вже відпрацювала ДО онбордингу, коли обидві
 * сторони порожні. Тож до наступного буту сервер вибору не знав, і вхід із
 * другого пристрою показував дефолтні «4 з 4».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import {
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  ONBOARDING_GOAL_FIRST_EXPERIMENT,
  ONBOARDING_HERO_COPY_EXPERIMENT,
  overrideVariant,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

const pushActiveModulesMock = vi.fn();
vi.mock("../hub/activeModulesSync", () => ({
  pushActiveModules: (ids: readonly string[]) => pushActiveModulesMock(ids),
}));

import { useOnboardingWizardState } from "./useOnboardingWizardState";

describe("useOnboardingWizardState — активні модулі їдуть на акаунт", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    pushActiveModulesMock.mockClear();
    overrideVariant(webKVStore, ONBOARDING_HERO_COPY_EXPERIMENT.id, "outcome");
    overrideVariant(webKVStore, ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id, "none");
    overrideVariant(webKVStore, ONBOARDING_GOAL_FIRST_EXPERIMENT.id, "control");
  });

  it("пушить вибір одразу після завершення візарда", () => {
    const { result } = renderHook(() =>
      useOnboardingWizardState({
        onDone: vi.fn(),
        onSecondaryAction: vi.fn(),
      }),
    );

    act(() => {
      result.current.togglePick("finyk");
      result.current.togglePick("routine");
    });
    act(() => {
      result.current.finish();
    });

    expect(pushActiveModulesMock).toHaveBeenCalledTimes(1);
    expect(pushActiveModulesMock.mock.calls[0]![0]).toEqual([
      "finyk",
      "routine",
    ]);
  });
});
