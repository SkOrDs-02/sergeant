export function fmt(n: number | string | null | undefined, digits = 0): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}
