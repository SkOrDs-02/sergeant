export interface PerfMark {
  name: string;
  t: number;
}

function isPerfEnabled(): boolean {
  try {
    return localStorage.getItem("hub_perf") === "1";
  } catch {
    return false;
  }
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
