export type PantryPromptItemFormat =
  | "nameOnly"
  | "nameQuantity"
  | "nameQuantityNotes";

export interface PantryPromptFormatOptions {
  itemFormat: PantryPromptItemFormat;
  limit?: number;
  joinWith?: string;
  fallbackWhenEmpty?: string;
}

const FIELD_SEPARATOR = " \u2014 ";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function truthyField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return value ? String(value) : "";
}

function quantityUnit(
  record: Record<string, unknown>,
  omitEmptyQuantity: boolean,
): string {
  const qty =
    record.qty != null && (!omitEmptyQuantity || record.qty !== "")
      ? String(record.qty)
      : "";
  const unit = truthyField(record, "unit");
  return qty && unit ? `${qty} ${unit}` : qty || unit;
}

function formatPantryItem(
  item: unknown,
  itemFormat: PantryPromptItemFormat,
): string {
  if (typeof item === "string") return item;

  const record = asRecord(item);
  if (!record) return "";

  const name = truthyField(record, "name");
  if (itemFormat === "nameOnly") return name;

  const amount = quantityUnit(record, itemFormat === "nameQuantityNotes");
  if (itemFormat === "nameQuantity") {
    return [name, amount].filter(Boolean).join(FIELD_SEPARATOR);
  }

  const notes = truthyField(record, "notes");
  return [name, amount, notes].filter(Boolean).join(FIELD_SEPARATOR);
}

export function formatPantryForPrompt(
  pantry: unknown,
  {
    itemFormat,
    limit,
    joinWith = "\n- ",
    fallbackWhenEmpty,
  }: PantryPromptFormatOptions,
): string {
  const items = Array.isArray(pantry) ? pantry : [];
  if (items.length === 0 && fallbackWhenEmpty !== undefined) {
    return fallbackWhenEmpty;
  }

  return items
    .map((item) => formatPantryItem(item, itemFormat))
    .filter(Boolean)
    .slice(0, limit)
    .join(joinWith);
}
