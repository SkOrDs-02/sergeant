/**
 * Нормалізує сирі дані зі сканера (EAN-8/13, UPC-A/E) до 8–14 цифр.
 */
export function normalizeBarcodeRaw(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}
