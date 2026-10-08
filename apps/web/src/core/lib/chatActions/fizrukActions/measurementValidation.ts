/**
 * Межі полів заміру для fizruk-екзекуторів чату.
 *
 * AI-CONTEXT: сервер (`apps/server/src/modules/sync/fizruk/applyMisc.ts`)
 * реджектить УВЕСЬ рядок заміру, якщо хоч одне поле поза `MEASUREMENT_BOUNDS`
 * (`invalid_${column}`). Клієнтський екзекутор без тієї ж перевірки мовчки
 * пише рядок, який ніколи не синхронізується, і ще й перезаписує профіль/цілі
 * КБЖВ нереальною вагою. Межі тут — ті самі `MEASUREMENT_BOUNDS`, а не копія.
 */
import { MEASUREMENT_BOUNDS, formatNumberUk } from "@sergeant/shared";

type BoundId = keyof typeof MEASUREMENT_BOUNDS;

interface FieldMeta {
  bound: BoundId;
  label: string;
  unit: string;
}

/** Поле заміру (ключ `MeasurementEntry`) → ключ у `MEASUREMENT_BOUNDS`, підпис, одиниця. */
const FIELDS: Record<string, FieldMeta> = {
  weightKg: { bound: "weightKg", label: "Вага", unit: "кг" },
  bodyFatPct: { bound: "bodyFatPct", label: "Відсоток жиру", unit: "%" },
  neckCm: { bound: "neckCm", label: "Шия", unit: "см" },
  chestCm: { bound: "chestCm", label: "Груди", unit: "см" },
  waistCm: { bound: "waistCm", label: "Талія", unit: "см" },
  hipsCm: { bound: "hipsCm", label: "Стегна (обхват)", unit: "см" },
  bicepLCm: { bound: "bicepLCm", label: "Лівий біцепс", unit: "см" },
  bicepRCm: { bound: "bicepRCm", label: "Правий біцепс", unit: "см" },
  forearmLCm: { bound: "forearmLCm", label: "Ліве передпліччя", unit: "см" },
  forearmRCm: { bound: "forearmRCm", label: "Праве передпліччя", unit: "см" },
  thighLCm: { bound: "thighLCm", label: "Ліве стегно", unit: "см" },
  thighRCm: { bound: "thighRCm", label: "Праве стегно", unit: "см" },
  calfLCm: { bound: "calfLCm", label: "Ліва гомілка", unit: "см" },
  calfRCm: { bound: "calfRCm", label: "Права гомілка", unit: "см" },
};

/**
 * Людське повідомлення про вихід значення за межі або `null`, якщо значення в
 * межах (або поле не має меж). `value` має бути вже скінченним числом.
 * Текст ваги збігається з `log_wellbeing` дослівно: одна відмова на всі
 * писачі ваги.
 */
export function measurementRangeMessage(
  field: string,
  value: number,
): string | null {
  const meta = FIELDS[field];
  if (!meta) return null;
  const { min, max } = MEASUREMENT_BOUNDS[meta.bound];
  if (value >= min && value <= max) return null;
  return `${meta.label} має бути від ${formatNumberUk(min)} до ${formatNumberUk(max)} ${meta.unit}. Перевір число і спробуй ще раз.`;
}
