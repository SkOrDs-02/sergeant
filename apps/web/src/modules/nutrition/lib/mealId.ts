/**
 * Last validated: 2026-06-15
 * Status: Active
 * Centralized meal-id generator. Replaces inline
 * timestamp + pseudo-random suffix sites
 * which drifted between 5- and 6-char random tails (audit F8 —
 * docs/audits/2026-05-13-page-audit-08-nutrition.md).
 *
 * Format: `meal_<uuid>` from `crypto.randomUUID()` — колізії практично
 * виключені, на відміну від старого 5-символьного base36-хвоста (36^5 = 60M),
 * і формат однаковий на всіх call site.
 */
import { generatePrefixedId } from "@sergeant/shared";

export function newMealId(): string {
  return generatePrefixedId("meal");
}
