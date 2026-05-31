import { useEffect, useRef } from "react";
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
 *
 * Idempotency: a mount-scoped ref blocks a second `generate()` call when
 * the `generate` callback identity flips at the Sunday→Monday midnight
 * transition (the original 2× LLM cost risk). A second `loadDigest`
 * check inside the timer mitigates cross-tab races. See
 * `docs/audits/2026-05-13-page-audit-02-hub-dashboard.md § F12`.
 */
export function useMondayAutoDigest() {
  const { generate } = useWeeklyDigest();
  const firedRef = useRef(false);

  useEffect(() => {
    const enabled =
      safeReadLS<string>(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, "") === "1";
    if (!enabled) return;

    const now = new Date();
    const isMonday = now.getDay() === 1;
    if (!isMonday) return;

    const weekKey = getWeekKey(now);
    if (loadDigest(weekKey)) return;
    if (firedRef.current) return;
    firedRef.current = true;

    const timer = setTimeout(() => {
      if (loadDigest(weekKey)) return;
      generate();
    }, 3000);
    return () => clearTimeout(timer);
  }, [generate]);
}
