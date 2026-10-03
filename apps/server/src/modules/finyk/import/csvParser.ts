/**
 * Фінансовий парсер суми для масового імпорту. Generic CSV-примітиви
 * живуть у `@sergeant/tabular-import`.
 */
export function parseSignedAmountKopiykas(
  raw: string,
  opts: { decimalComma?: boolean | undefined } = {},
): number | null {
  let s = raw.trim();
  if (!s) return null;
  // Прибираємо пробіли/NBSP і валютні суфікси/префікси захисно: custom
  // mapping може вказати на колонку з "1 234,56 грн".
  s = s.replace(/[\s\u00A0]+/g, "").replace(/(uah|грн\.?)/gi, "");
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let normalized = s;
  if (opts.decimalComma === true) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (opts.decimalComma === false) {
    normalized = s.replace(/,/g, "");
  } else if (hasComma && hasDot) {
    normalized =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (hasComma) {
    normalized = s.replace(",", ".");
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
