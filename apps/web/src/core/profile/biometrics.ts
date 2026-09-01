/**
 * Hub-level biometric parameters for nutrition / fitness calculations.
 *
 * Lives in Profile (not in Fizruk) so a user without the Fizruk module
 * still has the inputs needed for BMR / TDEE — the user's own
 * requirement when shaping the storage layer (see
 * `biometrics-storage-plan.md`). Persisted under
 * `STORAGE_KEYS.HUB_BIOMETRICS` (`hub_biometrics_v1`).
 *
 * AI-DANGER: **це device-local кеш, а не джерело істини.** Рішення власника
 * 2026-08-04 (W1-WEIGHT-SOT, стадії 3-4; ADR-0080): **fizruk-журнал
 * (`fizruk_measurements`) — канонічне сховище ваги; профіль лишається
 * головним ВХОДОМ** (місце, де людина керує вагою — зокрема без модуля
 * fizruk, де вона все одно потрібна для КБЖВ), а `weightKg` тут — похідний
 * кеш останнього відомого значення, не незалежний запис.
 *
 * Чому кеш, а не SoT: `hub_biometrics` — localStorage браузера, без
 * серверної таблиці й без історії (одне число, не часовий ряд):
 *
 *   - немає в `OP_LOG_TABLE_REGISTRY` (`apps/server/src/modules/sync/syncV2.ts`)
 *     і в жодній PG-міграції;
 *   - `SYNC_MODULES.profile` (`packages/shared/src/sync/modules.ts`) —
 *     tombstone: жоден рантайм його не споживає;
 *   - серверної таблиці `kv_store` теж немає.
 *
 * Практичний наслідок: «поточна вага» тут НЕ переживає зміну пристрою
 * чи очистку браузера. Історія ваги, яка переживає, живе у fizruk-таблицях
 * (`fizruk_daily_log` + `fizruk_measurements`) — читай її через
 * `selectLatestBodyWeight` з `@sergeant/fizruk-domain`. Для юзера, чия вага
 * лишилась тільки тут (записана до cutover-у), клієнтський bootstrap
 * (`bodyWeightBootstrap.ts`, стадія 4) одноразово й ідемпотентно сідить
 * fizruk-журнал цим значенням при boot-і.
 *
 * Weight is treated as the "current weight" snapshot for Nutrition
 * (Mifflin-St Jeor uses one number, not a time-series) і як фолбек для
 * юзера без модуля fizruk, коли fizruk-журнал ще порожній (офлайн / до
 * першого boot-bootstrap-у). Fizruk keeps the canonical journal. The two
 * stay in lockstep:
 *
 *   - Profile → Fizruk: `BiometricsSection` calls
 *     `useDailyLog.addEntry({ weightKg })` on save when weight
 *     changes — going through the canonical fizruk hook keeps the
 *     SQLite overlay (PR #030, storage-roadmap) transparent, and
 *     `useDailyLog.addEntry` itself funnels through `recordBodyWeight()`
 *     (stage 2), so this is the SAME writer as every other Fizruk-side
 *     weigh-in — there is no separate bypass path.
 *   - Fizruk → Profile: усі писачі ваги (обидва хуки + три AI-тули)
 *     ходять через `recordBodyWeight()` (`./recordBodyWeight.ts`), який
 *     інкапсулює `mirrorWeightToBiometrics`.
 *
 * Both directions converge on Last-Write-Wins via `weightUpdatedAt`.
 */
import { z } from "zod";
import { STORAGE_KEYS } from "@sergeant/shared";
import { safeReadLSValidated, safeWriteLS } from "@shared/lib/storage/storage";

export const BIOMETRICS_KEY = STORAGE_KEYS.HUB_BIOMETRICS;

export const SEX_VALUES = ["male", "female"] as const;
export type Sex = (typeof SEX_VALUES)[number];

/**
 * Mifflin-St Jeor 5-tier activity ladder (sedentary → very_active).
 * Multipliers live in the Nutrition consumer (PR #2) — this module only
 * persists the chosen tier name so the calculation lives next to the
 * formula, not the storage key.
 */
export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/**
 * Valid input ranges for height/weight — single source of truth shared by
 * BOTH the `BiometricsSchema` bounds below AND `BiometricsSection.tsx`'s
 * `<Input min max>` attributes (imported from here, not redeclared).
 *
 * Audit finding D5 (profile-settings-deep-audit, 2026-08-08): before this,
 * the same two numbers lived in THREE places — the UI's local constants,
 * the i18n error copy, and inline numbers in this schema — and only the
 * first two were kept in lockstep by a pin test. A schema left behind on
 * an old range is the worst kind of drift: `readBiometrics()` parses every
 * read through `safeReadLSValidated`, which falls back to
 * `BIOMETRICS_DEFAULT` — silently dropping the ENTIRE record (birth date,
 * sex, activity level, weight, not just the one out-of-sync field) — the
 * moment a value inside the new-but-not-yet-validated range gets written.
 */
export const HEIGHT_CM_RANGE = { min: 80, max: 260 } as const;
export const WEIGHT_KG_RANGE = { min: 20, max: 400 } as const;

const SexSchema = z.enum(SEX_VALUES).nullable();
const ActivityLevelSchema = z.enum(ACTIVITY_LEVELS).nullable();
const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .nullable();
const IsoTimestampSchema = z.string().min(1);

export const BiometricsSchema = z.object({
  heightCm: z
    .number()
    .min(HEIGHT_CM_RANGE.min)
    .max(HEIGHT_CM_RANGE.max)
    .nullable(),
  birthDate: IsoDateSchema,
  sex: SexSchema,
  activityLevel: ActivityLevelSchema,
  weightKg: z
    .number()
    .min(WEIGHT_KG_RANGE.min)
    .max(WEIGHT_KG_RANGE.max)
    .nullable(),
  /**
   * ISO timestamp when `weightKg` was last set. Used as the LWW marker
   * for Profile ↔ Fizruk weight sync — the latest write wins,
   * regardless of which surface initiated it.
   */
  weightUpdatedAt: IsoTimestampSchema.nullable(),
  /**
   * Чи враховувати спалене на тренуваннях у денній нормі КБЖВ.
   *
   * AI-DANGER: дефолт `false` навмисний і принциповий. Множник рівня
   * активності в TDEE ВЖЕ враховує тренування оптом наперед, тож додавання
   * спаленого зверху рахує їх удруге і дозволяє зʼїсти зайве - класична
   * пастка MyFitnessPal. Увімкнений тумблер перемикає розрахунок на
   * `sedentary` плюс фактичні витрати дня, а не додає до чинної норми.
   *
   * `.catch(false)` - зворотна сумісність: записи, зроблені до появи поля,
   * не мають провалювати парс і зносити ВЕСЬ профіль у дефолт
   * (`safeReadLSValidated` при помилці схеми відкидає рядок цілком).
   */
  countWorkoutsInGoal: z.boolean().catch(false),
  /** ISO timestamp of the last write to ANY field in this record. */
  updatedAt: IsoTimestampSchema,
});

export type Biometrics = z.infer<typeof BiometricsSchema>;

/**
 * Extends the persisted `hub_biometrics_v1` blob with the Better Auth user
 * id that wrote it, WITHOUT extending the public {@link Biometrics} type
 * consumed everywhere else in the app (BMR calc, dual-write mirrors, and
 * critically `pushBiometricsToServer`'s wire payload — `ownerId` must
 * never reach the server). `readBiometrics()` still parses through
 * {@link BiometricsSchema}, which silently drops unknown keys, so every
 * existing caller keeps getting exactly the shape it always has.
 *
 * A missing `ownerId` (a value written before this field existed) parses
 * to `null` — "unknown owner". See `profileWriteThrough.ts`'s
 * cross-account upload guard (CodeRabbit PR #627) for why that must never
 * be treated as "belongs to the current user".
 */
const StoredBiometricsSchema = BiometricsSchema.extend({
  ownerId: z.string().nullable().default(null),
});

/**
 * The Better Auth user id of the CURRENT device session, or `null` when
 * signed out / anonymous. Set once per session change (mirrors
 * `setSqliteUser`'s pattern in `core/db/sqlite.ts`) — see
 * {@link setBiometricsOwner}.
 */
let currentBiometricsOwner: string | null = null;

/**
 * Records which user the CURRENT device session belongs to. Every
 * subsequent {@link writeBiometrics} call — whether triggered by
 * `BiometricsSection`, a Fizruk weigh-in mirror, or `profileWriteThrough`'s
 * own server-hydrate — stamps its `ownerId` with this value, so a later
 * reconcile on a SHARED device can tell whose data is actually sitting in
 * this single global localStorage key. Called by `useProfileWriteThroughBoot`
 * on every `userId` change, and defensively by `reconcileBiometricsWithServerProfile`
 * itself (CodeRabbit PR #627).
 */
export function setBiometricsOwner(userId: string | null): void {
  currentBiometricsOwner = userId;
}

/**
 * The Better Auth user id last stamped onto the CURRENTLY persisted
 * `hub_biometrics_v1` blob, or `null` when unknown — either a legacy value
 * written before this field existed, or one written while signed
 * out/anonymous.
 */
export function readBiometricsOwnerId(): string | null {
  return safeReadLSValidated(BIOMETRICS_KEY, StoredBiometricsSchema, {
    ...BIOMETRICS_DEFAULT,
    ownerId: null,
  }).ownerId;
}

const EPOCH = new Date(0).toISOString();

export const BIOMETRICS_DEFAULT: Biometrics = {
  heightCm: null,
  birthDate: null,
  sex: null,
  activityLevel: null,
  weightKg: null,
  weightUpdatedAt: null,
  countWorkoutsInGoal: false,
  updatedAt: EPOCH,
};

export function readBiometrics(): Biometrics {
  return safeReadLSValidated(
    BIOMETRICS_KEY,
    BiometricsSchema,
    BIOMETRICS_DEFAULT,
  );
}

/**
 * Same-tab subscribers — `webKVStore.onChange` only fires on cross-tab
 * writes when the underlying adapter is `localStorage` (DOM contract).
 * The SQLite-backed adapter does fire on same-tab writes, but tests
 * and any code path that runs before `bootstrapKvStore()` finishes
 * still need a bridge so a Fizruk Body weigh-in immediately re-renders
 * a Profile section that's currently mounted.
 */
type BiometricsListener = (next: Biometrics) => void;
const biometricsListeners = new Set<BiometricsListener>();

export function subscribeBiometrics(listener: BiometricsListener): () => void {
  biometricsListeners.add(listener);
  return () => {
    biometricsListeners.delete(listener);
  };
}

/**
 * Persists `b`, stamping the CURRENT session's `ownerId` (see
 * {@link setBiometricsOwner}) onto the raw stored blob — invisible to
 * every caller here (they keep getting exactly `Biometrics`, no
 * `ownerId`), but readable back via {@link readBiometricsOwnerId} for
 * `profileWriteThrough.ts`'s cross-account upload guard.
 */
export function writeBiometrics(b: Biometrics): void {
  safeWriteLS(BIOMETRICS_KEY, { ...b, ownerId: currentBiometricsOwner });
  for (const listener of Array.from(biometricsListeners)) {
    try {
      listener(b);
    } catch {
      /* listener errors must not break storage writes */
    }
  }
}

/**
 * Update biometrics from a Fizruk-side weight write. Last-Write-Wins:
 * the caller's `at` becomes the new `weightUpdatedAt`, regardless of any
 * older value already in biometrics.
 *
 * AI-NOTE: не клич це напряму з нового коду — заходь через
 * `recordBodyWeight()` (`./recordBodyWeight.ts`), щоб funnel лишався
 * одним. Публічний експорт збережено для наявних тестів (additive).
 */
export function mirrorWeightToBiometrics(
  weightKg: number,
  at: string = new Date().toISOString(),
): void {
  const cur = readBiometrics();
  if (cur.weightKg === weightKg && cur.weightUpdatedAt === at) return;
  writeBiometrics({
    ...cur,
    weightKg,
    weightUpdatedAt: at,
    updatedAt: at,
  });
}

/**
 * Persist a partial update to biometrics — non-weight fields (or weight
 * itself, if the caller is the canonical Profile writer). The helper
 * auto-bumps `updatedAt`, and bumps `weightUpdatedAt` when `weightKg`
 * is part of the patch (presence-checked via `hasOwnProperty` so an
 * explicit `weightKg: null` "clear" still bumps the LWW marker).
 *
 * The Fizruk daily-log mirror lives in `BiometricsSection` (calls
 * `useDailyLog.addEntry`) — this module no longer owns that
 * dual-write so it doesn't have to reach for the retired
 * `STORAGE_KEYS.FIZRUK_DAILY_LOG` directly (PR #030, storage-roadmap).
 */
export function writeBiometricsPatch(
  patch: Partial<Omit<Biometrics, "updatedAt" | "weightUpdatedAt">>,
  at: string = new Date().toISOString(),
): Biometrics {
  const cur = readBiometrics();
  const weightChanged = Object.prototype.hasOwnProperty.call(patch, "weightKg");
  const merged: Biometrics = {
    ...cur,
    ...patch,
    weightUpdatedAt: weightChanged ? at : cur.weightUpdatedAt,
    updatedAt: at,
  };
  writeBiometrics(merged);
  return merged;
}

/**
 * Compute the user's age (whole years) from their birth-date as of `now`.
 * Returns `null` when birth-date is missing — Nutrition uses this to
 * decide whether it can compute BMR yet.
 */
export function computeAgeYears(
  birthDate: string | null,
  now: Date = new Date(),
): number | null {
  if (!birthDate) return null;
  const bd = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(bd.getTime())) return null;
  let age = now.getUTCFullYear() - bd.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < bd.getUTCMonth() ||
    (now.getUTCMonth() === bd.getUTCMonth() &&
      now.getUTCDate() < bd.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * `true` when biometrics has every field needed to run the Mifflin-St
 * Jeor formula (used by Nutrition in PR #2 to enable the
 * "Розрахувати з профілю" CTA).
 */
export function isBiometricsCompleteForTdee(b: Biometrics): boolean {
  return (
    b.heightCm != null &&
    b.weightKg != null &&
    b.sex != null &&
    b.activityLevel != null &&
    computeAgeYears(b.birthDate) != null
  );
}
