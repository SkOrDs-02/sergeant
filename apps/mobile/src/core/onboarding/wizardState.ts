import {
  ONBOARDING_STEPS,
  type DashboardModuleId,
  type OnboardingGoals,
  type OnboardingStepId,
} from "@sergeant/shared";

export interface WizardState {
  step: OnboardingStepId;
  picks: DashboardModuleId[];
  goals: OnboardingGoals;
}

export type WizardAction =
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "TOGGLE_PICK"; id: DashboardModuleId }
  | { type: "SET_GOAL"; key: keyof OnboardingGoals; value: unknown };

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "NEXT": {
      const idx = ONBOARDING_STEPS.indexOf(state.step);
      if (idx < ONBOARDING_STEPS.length - 1) {
        return { ...state, step: ONBOARDING_STEPS[idx + 1]! };
      }
      return state;
    }
    case "BACK": {
      const idx = ONBOARDING_STEPS.indexOf(state.step);
      if (idx > 0) {
        return { ...state, step: ONBOARDING_STEPS[idx - 1]! };
      }
      return state;
    }
    case "TOGGLE_PICK": {
      const picks = state.picks.includes(action.id)
        ? state.picks.filter((p) => p !== action.id)
        : [...state.picks, action.id];
      return { ...state, picks };
    }
    case "SET_GOAL":
      return {
        ...state,
        goals: { ...state.goals, [action.key]: action.value },
      };
    default:
      return state;
  }
}
