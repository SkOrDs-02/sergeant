/**
 * Cross-store selector for **body weight** — the one place every surface
 * (web Body / web Progress / mobile Body / nutrition TDEE) reads a
 * weigh-in from.
 *
 * ## Навіщо це існує
 *
 * Вага тіла сьогодні пишеться у два незалежні сховища:
 *
 *  - `fizruk_daily_log.weight_kg` — журнал самопочуття (екран «Тіло» на web,
 *    AI-тули `log_weight` / `log_wellbeing`);
 *  - `fizruk_measurements.weight_kg` — антропометрія (екран «Заміри» на web
 *    і mobile, AI-тул `log_measurement`).
 *
 * Мостів між ними немає, тому кожен екран показував свій підмножинний зріз
 * історії: зважився в «Замірах» → графік Progress оновився, а «Тіло» і
 * КБЖВ-цілі — ні. Цей модуль **не обирає** канонічну таблицю (це рішення
 * founder-а, окремий ADR) — він робить union на **читанні**, тож жоден
 * запис користувача не зникає з жодного екрана.
 *
 * ## Правило дедупу (піде в майбутній ADR)
 *
 *  1. Ключ дедупу — **календарний день у Europe/Kyiv** (домен-інваріант:
 *     межі доби — Kyiv local, не UTC; інакше вечірнє зважування після
 *     21:00 Kyiv поїхало б у сусідній день).
 *  2. При колізії за один день виграє запис із **новішим `at`**
 *     (`measured_at` — синонім-фолбек).
 *  3. Якщо `at` збігається до мілісекунди і значення однакове — це один і
 *     той самий weigh-in, віддзеркалений у два сховища; беремо будь-який.
 *  4. Якщо `at` збігається, а значення різні — виграє `measurements`.
 *     Тай-брейк **тимчасовий** і тримається за канон fizruk §3, який мапить
 *     «вага тіла» саме на сутність Measurement; фінальне слово — за ADR.
 *
 * Записи з проставленим `deleted_at` / `deletedAt` не враховуються взагалі
 * (обидві таблиці мають tombstone-колонку).
 *
 * DOM-free, React-free — чистий TS, як і решта `@sergeant/fizruk-domain`.
 */
import { toLocalISODate } from "@sergeant/shared";

import type { MobileMeasurementEntry } from "../measurements/types.js";
import {
  MEASUREMENT_TREND_WINDOW,
  formatTickLabel,
} from "../progress/seriesFormat.js";
import type { MeasurementPoint } from "../progress/types.js";

/** Яке сховище дало семпл. Діагностичне поле — UI його не показує. */
export type BodyWeightSourceId = "dailyLog" | "measurements";

/**
 * Мінімальна форма запису, з якої селектор уміє дістати вагу. Свідомо
 * широка: і `DailyLogEntry`, і `MeasurementEntry`, і `MobileMeasurementEntry`,
 * і сирий рядок SQLite (`weight_kg` / `measured_at` / `deleted_at`) проходять
 * без адаптера.
 *
 * Index signature тут навмисно НЕМАЄ: `MobileMeasurementEntry` її не має, і
 * з нею mobile Body не скомпілювався б. Snake_case-поля читаються через
 * {@link asRecord}.
 */
export interface BodyWeightRecordInput {
  readonly id?: string | undefined;
  readonly at?: string | null | undefined;
  readonly measuredAt?: string | null | undefined;
  readonly weightKg?: number | string | null | undefined;
  readonly deletedAt?: string | null | undefined;
}

/** Один нормалізований weigh-in після union + дедупу. */
export interface BodyWeightSample {
  /** Id вихідного запису (або синтетичний `<source>:<at>`, якщо його немає). */
  readonly id: string;
  /** ISO timestamp зважування. */
  readonly at: string;
  /** Календарний день у Europe/Kyiv (`YYYY-MM-DD`) — ключ дедупу. */
  readonly dayKey: string;
  /** Вага в кілограмах (додатне скінченне число). */
  readonly weightKg: number;
  /** Сховище, з якого прийшов семпл. */
  readonly source: BodyWeightSourceId;
}

type WeightRecords = readonly BodyWeightRecordInput[] | null | undefined;

function readString(raw: unknown): string | null {
  return typeof raw === "string" && raw !== "" ? raw : null;
}

/** Погляд на запис як на мапу — для snake_case-полів сирого SQLite-рядка. */
function asRecord(rec: BodyWeightRecordInput): Record<string, unknown> {
  return rec as unknown as Record<string, unknown>;
}

/** `at` з фолбеком на `measuredAt` / `measured_at`; невалідні дати — `null`. */
function readTimestamp(rec: BodyWeightRecordInput): string | null {
  const raw =
    readString(rec.at) ??
    readString(rec.measuredAt) ??
    readString(asRecord(rec)["measured_at"]);
  if (raw === null) return null;
  return Number.isFinite(Date.parse(raw)) ? raw : null;
}

/** Tombstone-guard: `deleted_at IS NOT NULL` → запис не існує для UI. */
function isDeleted(rec: BodyWeightRecordInput): boolean {
  const raw = rec.deletedAt ?? asRecord(rec)["deleted_at"];
  return raw != null && raw !== "";
}

function readWeightKg(rec: BodyWeightRecordInput): number | null {
  const raw = rec.weightKg ?? asRecord(rec)["weight_kg"];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Чи `next` перемагає `prev` за правилами 2-4 з docblock-у вище.
 * Обидва семпли вже належать одному Kyiv-дню.
 */
function winsCollision(
  next: BodyWeightSample,
  prev: BodyWeightSample,
): boolean {
  const nextMs = Date.parse(next.at);
  const prevMs = Date.parse(prev.at);
  if (nextMs !== prevMs) return nextMs > prevMs;
  // Той самий інстант: однакове значення — це дзеркало одного weigh-in.
  if (next.weightKg === prev.weightKg) return false;
  return next.source === "measurements";
}

function collectInto(
  byDay: Map<string, BodyWeightSample>,
  records: WeightRecords,
  source: BodyWeightSourceId,
): void {
  if (!Array.isArray(records)) return;
  for (const rec of records) {
    if (rec == null || typeof rec !== "object") continue;
    if (isDeleted(rec)) continue;
    const at = readTimestamp(rec);
    if (at === null) continue;
    const weightKg = readWeightKg(rec);
    if (weightKg === null) continue;
    const dayKey = toLocalISODate(at);
    const sample: BodyWeightSample = {
      id: readString(rec.id) ?? `${source}:${at}`,
      at,
      dayKey,
      weightKg,
      source,
    };
    const prev = byDay.get(dayKey);
    if (prev === undefined || winsCollision(sample, prev)) {
      byDay.set(dayKey, sample);
    }
  }
}

/**
 * Union обох сховищ ваги, дедуплікований за Kyiv-днем і відсортований
 * **новішими вперед**. Порядок вхідних масивів не має значення.
 */
export function selectBodyWeightSamples(
  dailyLog: WeightRecords,
  measurements: WeightRecords,
): BodyWeightSample[] {
  const byDay = new Map<string, BodyWeightSample>();
  collectInto(byDay, dailyLog, "dailyLog");
  collectInto(byDay, measurements, "measurements");
  return Array.from(byDay.values()).sort((a, b) => {
    const d = Date.parse(b.at) - Date.parse(a.at);
    return d !== 0 ? d : b.dayKey.localeCompare(a.dayKey);
  });
}

/**
 * Найсвіжіше зважування з обох сховищ, або `null` коли жодного немає.
 * Це і є «поточна вага» для КБЖВ-розрахунку і для шапки екрана «Тіло».
 */
export function selectLatestBodyWeight(
  dailyLog: WeightRecords,
  measurements: WeightRecords,
): BodyWeightSample | null {
  return selectBodyWeightSamples(dailyLog, measurements)[0] ?? null;
}

/** Чи є хоч одне зважування бодай в одному зі сховищ. */
export function hasAnyBodyWeightSample(
  dailyLog: WeightRecords,
  measurements: WeightRecords,
): boolean {
  return selectBodyWeightSamples(dailyLog, measurements).length > 0;
}

/**
 * Спроєктувати семпли на плоскі measurement-подібні записи, щоб уже наявні
 * селектори (`buildBodySummary`, `buildMeasurementSeries`) працювали без
 * власної копії union-логіки.
 */
export function toBodyWeightEntries(
  samples: readonly BodyWeightSample[],
): MobileMeasurementEntry[] {
  return samples.map((s) => ({ id: s.id, at: s.at, weightKg: s.weightKg }));
}

/**
 * Timeseries ваги для графіків: union обох сховищ, **старіші зліва**,
 * останні `limit` точок (дзеркалить `.slice(-8)` веб-поведінки).
 */
export function buildBodyWeightSeries(
  dailyLog: WeightRecords,
  measurements: WeightRecords,
  limit: number = MEASUREMENT_TREND_WINDOW,
): MeasurementPoint[] {
  const ascending = selectBodyWeightSamples(dailyLog, measurements).reverse();
  const windowed =
    limit > 0 && ascending.length > limit
      ? ascending.slice(ascending.length - limit)
      : ascending;
  return windowed.map((s) => ({
    iso: s.at,
    value: s.weightKg,
    label: formatTickLabel(s.at),
  }));
}
