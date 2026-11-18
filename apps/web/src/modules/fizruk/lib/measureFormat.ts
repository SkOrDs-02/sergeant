import { formatDurShort, type WorkoutSet } from "@sergeant/fizruk-domain";
import {
  isSetCompleted,
  itemMeasure,
  itemUsesSetRows,
  measureFields,
  type MeasureSetsItemLike,
} from "@sergeant/fizruk-domain/domain";
import { messages } from "@shared/i18n/uk";
import { fmtLoose } from "./numberFmt";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Підсумок вправи з підходами на час, дистанцію чи лише повтори: «3 × 30 с»,
 * «3 × 400 м», «2 × 40 м · 24 кг», «12, 10» (спека типу виміру, зріз 4).
 * Друкуються лише зараховані підходи (`isSetCompleted`), як плитка
 * «Підходів». `null` — вага × повтори і записи без рядків (старе поле на
 * вправі): там у викликача свій формат.
 */
export function formatMeasureSets(item: MeasureSetsItemLike): string | null {
  if (!itemUsesSetRows(item)) return null;
  const m = itemMeasure(item);
  if (m === "weight_reps") return null;
  const f = measureFields(m);
  const t = messages.fizruk.measureSummary;
  const done = (item.sets || []).filter((s: WorkoutSet) =>
    isSetCompleted(s, item),
  );
  if (done.length === 0) return "—";

  const core = (s: WorkoutSet): string => {
    if (f.reps) return String(num(s.reps));
    if (f.distance) {
      const base = `${num(s.distanceM)} ${t.meters}`;
      const sec = num(s.durationSec);
      return f.time && sec > 0
        ? `${base} ${t.over} ${formatDurShort(sec)}`
        : base;
    }
    return formatDurShort(num(s.durationSec));
  };
  const weights = done.map((s) => num(s.weightKg));
  const sameWeight = weights.every((w) => w === weights[0]);
  const perSetWeight = f.weight && !sameWeight;
  const parts = done.map((s) =>
    perSetWeight
      ? `${core(s)} · ${fmtLoose(num(s.weightKg))} ${t.kg}`
      : core(s),
  );
  const first = parts[0] ?? "";
  const body =
    parts.length > 1 && parts.every((p) => p === first)
      ? `${parts.length} × ${first}`
      : parts.join(", ");
  const w0 = weights[0] ?? 0;
  return f.weight && sameWeight && w0 > 0
    ? `${body} · ${fmtLoose(w0)} ${t.kg}`
    : body;
}
