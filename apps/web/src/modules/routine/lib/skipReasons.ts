/**
 * Ярлики причин пропуску (канон §5 — «зробив / не зміг з причиною / не зробив»).
 *
 * Тон — за `docs/01-product/copy/style-guide.uk.md`: `ти`-звертання, без
 * докору. «Не зміг» у продукті НЕ є провалом, тож і копія не має звучати
 * як виправдання перед застосунком.
 */
import { SKIP_REASONS, type SkipReason } from "@sergeant/routine-domain";

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  sick: "Хворів",
  travel: "У дорозі",
  busy: "Не було часу",
  rest: "Свідомий відпочинок",
  other: "Інше",
};

export const SKIP_REASON_OPTIONS: ReadonlyArray<{
  value: SkipReason;
  label: string;
}> = SKIP_REASONS.map((value) => ({
  value,
  label: SKIP_REASON_LABELS[value],
}));
