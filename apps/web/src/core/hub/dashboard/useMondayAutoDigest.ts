import { useEffect } from "react";
import { safeReadLS } from "@shared/lib/storage/storage";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  getWeekKey,
  loadDigest,
  useWeeklyDigest,
} from "../../insights/useWeeklyDigest";

/**
 * Auto-generates a weekly digest on Monday if the user has opted in via
 * `WEEKLY_DIGEST_MONDAY_AUTO === "1"` and no digest exists yet for this
 * week. Generation is deferred 3s so the dashboard finishes mounting
 * before the network/AI request kicks off.
 */
export function useMondayAutoDigest() {
  const { generate } = useWeeklyDigest();

  useEffect(() => {
    const enabled =
      safeReadLS<string>(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, "") === "1";
    if (!enabled) return;

    const now = new Date();
    const isMonday = now.getDay() === 1;
    if (!isMonday) return;

    const weekKey = getWeekKey(now);
    const existing = loadDigest(weekKey);
    if (existing) return;

    const timer = setTimeout(() => {
      generate();
    }, 3000);
    return () => clearTimeout(timer);
  }, [generate]);
}
