/**
 * Status: Active
 *
 * Live wrapper around the shared `formatRelativeUk` formatter: re-renders on
 * a ~30s tick so a label like "5 хвилин тому" ages without a page reload —
 * the fix for the "Синхронізовано 21:57" timestamp that looked frozen
 * forever (mobile-audit A6). The formatting itself is delegated so relative
 * timestamps read the same everywhere (sessions, memory, sync pill).
 */
import { useEffect, useState } from "react";
import { formatRelativeUk } from "@shared/lib/format/relativeTime.uk";

const RELATIVE_TICK_MS = 30_000;

export function useRelativeTime(date: Date | null | undefined): string | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!date) return;
    const id = setInterval(() => tick((n) => n + 1), RELATIVE_TICK_MS);
    return () => clearInterval(id);
  }, [date]);
  if (!date) return null;
  return formatRelativeUk(date);
}
