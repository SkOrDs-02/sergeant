import { safeReadStringLS } from "@shared/lib/storage/storage";

export interface PerfMark {
  name: string;
  t: number;
}

function isPerfEnabled(): boolean {
  // Раніше був try/catch навколо `localStorage.getItem("hub_perf")` —
  // приватний режим Safari / quota wedge кидають. `safeReadStringLS`
  // вже повертає `null` у всіх цих випадках (див.
  // shared/lib/storage/storage.ts) і жодного об'єкта не кидає,
  // тому семантика є біт в біт тою ж, що була.
  return safeReadStringLS("hub_perf") === "1";
}

export function perfMark(name: string): PerfMark | null {
  if (!isPerfEnabled()) return null;
  const t = performance.now();
  return { name, t };
}

export function perfEnd(
  mark: PerfMark | null,
  extra: unknown = null,
): number | undefined {
  if (!mark || !isPerfEnabled()) return;
  const dt = performance.now() - mark.t;
  try {
    // keep it compact; visible only when enabled via localStorage flag
    console.debug(`[perf] ${mark.name}: ${dt.toFixed(1)}ms`, extra ?? "");
  } catch {
    /* ignore */
  }
  return dt;
}
