/**
 * Resolve "не можна" — whether an active injury mark blocks an exercise.
 *
 * AI-CONTEXT: Two independent paths reach a block (ADR-0083):
 *   1. muscle — the exercise trains a muscle group the user marked, resolved
 *      through `mapDomainMuscleToAtlas` into the shared atlas keyspace;
 *   2. zone — the movement loads a joint / spinal segment the user marked,
 *      read from the explicit `EXERCISE_INJURY_ZONES` registry.
 *
 * Path 2 is the whole point. Path 1 alone is the ratified-but-broken model
 * from audit E-4: shoulder pain marked on `front-deltoids` left bench press
 * (primary `chest`) recommended, and knee pain had nothing to mark at all.
 *
 * This module answers "does this movement touch what you marked". It never
 * answers "is this safe for you" — канон fizruk §5, медичних порад не даємо.
 */

import { mapDomainMuscleToAtlas } from "../data/bodyAtlas.js";
import { injuryZonesForExercise } from "../data/exerciseInjuryZones.js";
import {
  isInjurySiteId,
  isInjuryZoneId,
  type InjurySiteId,
  type InjuryZoneId,
} from "../data/injurySites.js";

/** A user-placed injury mark. Cleared marks keep a `clearedAt` timestamp. */
export interface InjuryMark {
  id: string;
  site: string;
  startedAt: string;
  clearedAt?: string | null;
  note?: string;
  deletedAt?: string | null;
}

/** Minimal exercise shape the block resolver needs. */
export interface InjuryCheckableExercise {
  id?: string;
  exerciseId?: string;
  muscles?: { primary?: string[]; secondary?: string[] };
  musclesPrimary?: string[];
  musclesSecondary?: string[];
}

/**
 * How much of the exercise the injury model could actually inspect.
 *
 * `"muscle-only"` means the exercise is absent from the zone registry (a
 * custom user exercise), so joint marks could not be checked against it. That
 * is a real gap in the guarantee and callers MUST surface it rather than
 * present the result as a clean pass.
 */
export type InjuryCoverage = "muscle-and-zone" | "muscle-only";

/** Outcome of checking one exercise against the active injury marks. */
export interface InjuryBlock {
  blocked: boolean;
  /** Atlas muscle ids that matched an active mark. */
  viaMuscles: InjurySiteId[];
  /** Joints / spinal segments that matched an active mark. */
  viaZones: InjuryZoneId[];
  coverage: InjuryCoverage;
}

/** An unmarked, fully-inspected exercise. */
const CLEAR: InjuryBlock = {
  blocked: false,
  viaMuscles: [],
  viaZones: [],
  coverage: "muscle-and-zone",
};

/**
 * Sites with an injury mark that is still open — not cleared, not tombstoned.
 *
 * There is no time-based auto-expiry: канон §5 says the mark holds «до зняття
 * позначки», so clearing is a deliberate user action. The known consequence
 * (a forgotten mark silently drops a zone from advice forever) is recorded in
 * ADR-0083 § Наслідки.
 */
export function activeInjurySites(
  marks: readonly InjuryMark[] | null | undefined,
): Set<InjurySiteId> {
  const out = new Set<InjurySiteId>();
  for (const mark of marks || []) {
    if (!mark) continue;
    if (mark.clearedAt) continue;
    if (mark.deletedAt) continue;
    if (isInjurySiteId(mark.site)) out.add(mark.site);
  }
  return out;
}

/**
 * Найпізніше ЗНЯТТЯ позначки, що накривала цю вправу (ISO), або `null`.
 *
 * AI-CONTEXT: це вхід протоколу повернення (канон `fizruk.md` §6,
 * `domain/workouts/oneRmAging.ts`) і закриття розриву E-5 з ADR-0083.
 * Позначка блокувала вправу, а її зняття повертало користувача одразу до
 * повних орієнтирів від піка — найнебезпечніший момент циклу був єдиним,
 * який продукт ніяк не позначав.
 *
 * Симетрично до {@link activeInjurySites}: тут беруться РІВНО протилежні
 * марки — зняті й не видалені. Видалена («не ту зону позначив») не є
 * поверненням після травми, тож у мʼякий режим не вводить.
 */
export function latestClearedInjuryAtForExercise(
  ex: InjuryCheckableExercise | null | undefined,
  marks: readonly InjuryMark[] | null | undefined,
): string | null {
  if (!ex) return null;
  const clearedAtBySite = new Map<InjurySiteId, string>();
  for (const mark of marks || []) {
    if (!mark || mark.deletedAt) continue;
    const clearedAt = mark.clearedAt;
    if (typeof clearedAt !== "string" || clearedAt.length === 0) continue;
    if (!isInjurySiteId(mark.site)) continue;
    const prev = clearedAtBySite.get(mark.site);
    if (prev === undefined || clearedAt > prev) {
      clearedAtBySite.set(mark.site, clearedAt);
    }
  }
  if (clearedAtBySite.size === 0) return null;

  const sites = new Set<InjurySiteId>(clearedAtBySite.keys());
  const block = injuryBlockForExercise(ex, sites);
  let latest: string | null = null;
  for (const site of [...block.viaMuscles, ...block.viaZones]) {
    const at = clearedAtBySite.get(site);
    if (at !== undefined && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

function atlasMusclesOf(ex: InjuryCheckableExercise): Set<InjurySiteId> {
  const raw = [
    ...(ex.muscles?.primary || []),
    ...(ex.muscles?.secondary || []),
    ...(ex.musclesPrimary || []),
    ...(ex.musclesSecondary || []),
  ];
  const out = new Set<InjurySiteId>();
  for (const m of raw) {
    const atlas = mapDomainMuscleToAtlas(m);
    if (atlas) out.add(atlas);
  }
  return out;
}

/**
 * Check one exercise against the active injury marks.
 *
 * Returns `blocked: false` with full coverage when nothing is marked, so the
 * common (healthy) path stays allocation-cheap.
 */
export function injuryBlockForExercise(
  ex: InjuryCheckableExercise | null | undefined,
  activeSites: ReadonlySet<InjurySiteId>,
): InjuryBlock {
  if (!ex || activeSites.size === 0) return CLEAR;

  const viaMuscles: InjurySiteId[] = [];
  for (const muscle of atlasMusclesOf(ex)) {
    if (activeSites.has(muscle)) viaMuscles.push(muscle);
  }

  const exerciseId = ex.exerciseId || ex.id || "";
  const zones = injuryZonesForExercise(exerciseId);
  const viaZones: InjuryZoneId[] = [];
  if (zones) {
    for (const zone of zones) {
      if (activeSites.has(zone)) viaZones.push(zone);
    }
  }

  return {
    blocked: viaMuscles.length > 0 || viaZones.length > 0,
    viaMuscles,
    viaZones,
    // An exercise outside the registry could not be checked against joint
    // marks at all — never report that as a clean "muscle-and-zone" pass.
    coverage: zones ? "muscle-and-zone" : "muscle-only",
  };
}

/**
 * True when the user carries a joint / spine mark that an unregistered
 * exercise could not be checked against.
 *
 * Drives the honesty caveat in the UI: with only muscle marks open, a custom
 * exercise is fully checked and no caveat is warranted.
 */
export function hasUncheckableZoneMarks(
  block: InjuryBlock,
  activeSites: ReadonlySet<InjurySiteId>,
): boolean {
  if (block.coverage !== "muscle-only") return false;
  for (const site of activeSites) {
    if (isInjuryZoneId(site)) return true;
  }
  return false;
}
