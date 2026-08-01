/**
 * Mobile port of `useMondayAutoDigest` (see
 * `apps/web/src/core/hub/HubDashboard.tsx`).
 *
 * The web hook auto-fires the weekly-digest generate mutation the
 * first time the hub mounts on a Monday when the user has opted in
 * via the `WEEKLY_DIGEST_MONDAY_AUTO` preference and no digest
 * exists yet for the current week. It waits 3 seconds so the user
 * can cancel / navigate away if the hub is loaded in passing.
 *
 * `generate` надає `useWeeklyDigest().generate` з `HubDashboard`.
 */

import { useEffect, useRef } from "react";

import { STORAGE_KEYS, getWeekKey } from "@sergeant/shared";

import { safeReadLS } from "@/lib/storage";

import { loadDigest } from "./weeklyDigestStorage";

const AUTO_DIGEST_DELAY_MS = 3000;

export interface UseMondayAutoDigestOptions {
  /**
   * Fires once when the Monday-auto rule passes. Supplied by the
   * caller so the hook stays independent of the mutation layer.
   */
  generate: () => void;
  /** Clock injection for tests. Defaults to `new Date()` per tick. */
  now?: Date;
  /**
   * Disables the effect entirely (useful in tests or when the hook
   * is mounted on a non-hub screen).
   */
  enabled?: boolean;
}

export function useMondayAutoDigest({
  generate,
  now,
  enabled = true,
}: UseMondayAutoDigestOptions): void {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (firedRef.current) return;

    const current = now ?? new Date();
    // Rule 1: must be Monday.
    if (current.getDay() !== 1) return;

    // Rule 2: user has the preference opted in.
    // Читаємо саме як рядок: `AIDigestSection` (web і mobile) персистить
    // `"1"` / `"0"`, а не boolean. Прочитане як `boolean`, вимкнене `"0"`
    // виявлялось truthy — автогенерація спрацьовувала при вимкненому
    // тумблері й палила AI-квоту. Web-хук уже звіряється з `=== "1"`.
    const autoEnabled =
      safeReadLS<string>(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, "") === "1";
    if (!autoEnabled) return;

    // Rule 3: no digest already present for this week.
    const weekKey = getWeekKey(current);
    if (loadDigest(weekKey)) return;

    firedRef.current = true;
    const timer = setTimeout(() => {
      generate();
    }, AUTO_DIGEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, generate, now]);
}
