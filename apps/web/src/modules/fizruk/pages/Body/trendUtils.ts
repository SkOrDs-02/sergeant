export function lastValidValue<T extends { value: number | null }>(
  data: readonly T[],
): number | null {
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i]!.value;
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

export function firstValidValue<T extends { value: number | null }>(
  data: readonly T[],
): number | null {
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!.value;
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
