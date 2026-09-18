/**
 * Navigation helpers for the full Detox suites. Thin wrappers around
 * the existing `tapWhenVisible` / `waitForVisibleById` so each suite
 * reads as a flat sequence of intent-revealing calls.
 */
import { tapWhenVisible, waitForVisibleById } from "../helpers";

/** Tap the **Хаб** tab and assert the dashboard is rendered. */
export async function goToHubTab(): Promise<void> {
  await tapWhenVisible("tab-hub");
  await waitForVisibleById("dashboard-hero-slot");
}

/** Tap the **Рутина** tab and assert the routine shell is rendered. */
export async function goToRoutineTab(): Promise<void> {
  await tapWhenVisible("tab-routine");
  await waitForVisibleById("routine-shell");
}

/** Tap the **ФІЗРУК** tab and assert the dashboard is rendered. */
export async function goToFizrukTab(): Promise<void> {
  await tapWhenVisible("tab-fizruk");
  await waitForVisibleById("fizruk-dashboard-scroll");
}

/** Tap the **ФІНІК** tab and assert the overview is rendered. */
export async function goToFinykTab(): Promise<void> {
  await tapWhenVisible("tab-finyk");
  await waitForVisibleById("finyk-overview-scroll");
}

/** Tap the **Їжа** tab and assert the nutrition shell is rendered. */
export async function goToNutritionTab(): Promise<void> {
  await tapWhenVisible("tab-nutrition");
  await waitForVisibleById("nutrition-shell");
}
