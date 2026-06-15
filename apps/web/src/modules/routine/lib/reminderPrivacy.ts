/**
 * Reminder-notification privacy mode (page-audit-09 F9).
 *
 * A routine reminder notification is rendered to the OS lock screen and
 * any paired smartwatch. By default it carries the habit name in plain
 * text (`✓ Therapy`) — for users with sensitive habits that broadcasts
 * private context to a shoulder-surfer. `routineReminderPrivacy` lets a
 * user opt the habit name out: in `"minimal"` mode the notification
 * shows a generic title/body and the user opens the app to see which
 * habit it was.
 *
 * The pref lives on `RoutinePrefs` via its open index signature
 * (`[k: string]: unknown`), so reading it requires a narrow coercion
 * helper rather than a domain-type change. Default is `"full"` — the
 * existing behaviour — so the toggle is purely additive.
 *
 * @lifecycle active
 * @owner @Skords-01
 */

import type { Habit, RoutinePrefs } from "./types";

export type RoutineReminderPrivacy = "full" | "minimal";

export interface ReminderNotificationContent {
  title: string;
  body: string;
}

/**
 * Read `prefs.routineReminderPrivacy` defensively. Any value other than
 * the explicit `"minimal"` opt-in resolves to `"full"` so a malformed or
 * absent pref never accidentally hides habit names the user expects.
 */
export function getRoutineReminderPrivacy(
  prefs: RoutinePrefs | undefined,
): RoutineReminderPrivacy {
  // Bracket access required: `routineReminderPrivacy` lives on the open
  // `[k: string]: unknown` index signature of `RoutinePrefs`, and
  // `noPropertyAccessFromIndexSignature` forbids dot access there.
  return prefs?.["routineReminderPrivacy"] === "minimal" ? "minimal" : "full";
}

/**
 * Build the `{ title, body }` for a habit reminder, honouring the
 * privacy mode. In `"minimal"` mode the habit name and emoji are
 * withheld; in `"full"` mode the title is `${emoji} ${name}` (with a `✓`
 * fallback emoji) as before.
 */
export function reminderNotificationContent(
  habit: Pick<Habit, "name" | "emoji">,
  privacy: RoutineReminderPrivacy,
): ReminderNotificationContent {
  if (privacy === "minimal") {
    return {
      title: "Нагадування",
      body: "Час для запланованої звички",
    };
  }
  return {
    title: `${habit.emoji || "✓"} ${habit.name}`,
    body: "Нагадування про звичку",
  };
}
