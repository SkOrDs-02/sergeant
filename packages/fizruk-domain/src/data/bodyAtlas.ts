/**
 * Canonical muscle-group ids for the Fizruk BodyAtlas.
 *
 * The canonical muscle keys (`chest`, `front-deltoids`, `upper-back`, …)
 * are the shared contract between the web and mobile `BodyAtlas` renderers
 * (both draw the silhouette from `bodyAtlasGeometry.ts`), and feed the same
 * `useRecovery()` snapshot through `mapDomainMuscleToAtlas` /
 * `aggregateRecoveryToAtlas`. The data layer is platform-agnostic; only the
 * SVG host (`<svg>` vs `react-native-svg`) differs.
 */

import type { MuscleState, RecoveryStatus } from "../domain/types.js";

/** Canonical BodyAtlas muscle ids (the shared web/mobile keyspace). */
export const BODY_ATLAS_MUSCLE_IDS = [
  "neck",
  "trapezius",
  "chest",
  "front-deltoids",
  "back-deltoids",
  "biceps",
  "triceps",
  "forearm",
  "abs",
  "obliques",
  "upper-back",
  "lower-back",
  "gluteal",
  "quadriceps",
  "hamstring",
  "adductor",
  "abductors",
  "calves",
] as const;

/** Type-safe union of all canonical atlas muscle ids. */
export type BodyAtlasMuscleId = (typeof BODY_ATLAS_MUSCLE_IDS)[number];

/** Side of the body a muscle group is drawn on. */
export type BodyAtlasSide = "front" | "back";

/** Ukrainian labels for atlas muscle groups (used by `accessibilityLabel`). */
export const BODY_ATLAS_MUSCLE_LABELS_UK: Record<BodyAtlasMuscleId, string> = {
  neck: "Шия",
  trapezius: "Трапеція",
  chest: "Груди",
  "front-deltoids": "Передні дельти",
  "back-deltoids": "Задні дельти",
  biceps: "Біцепс",
  triceps: "Трицепс",
  forearm: "Передпліччя",
  abs: "Прес",
  obliques: "Косі м'язи",
  "upper-back": "Верх спини",
  "lower-back": "Низ спини",
  gluteal: "Сідниці",
  quadriceps: "Квадрицепс",
  hamstring: "Задня поверхня стегна",
  adductor: "Привідні м'язи",
  abductors: "Відвідні м'язи",
  calves: "Литки",
};

/** On which side (front / back / both) each muscle group is rendered. */
export const BODY_ATLAS_MUSCLE_SIDE: Record<
  BodyAtlasMuscleId,
  "front" | "back" | "both"
> = {
  neck: "both",
  trapezius: "both",
  chest: "front",
  "front-deltoids": "front",
  "back-deltoids": "back",
  biceps: "front",
  triceps: "back",
  forearm: "both",
  abs: "front",
  obliques: "front",
  "upper-back": "back",
  "lower-back": "back",
  gluteal: "back",
  quadriceps: "front",
  hamstring: "back",
  adductor: "front",
  abductors: "back",
  calves: "both",
};

/**
 * Type guard for the canonical atlas muscle union. Useful when mapping
 * from a broader domain muscle id space into the atlas keyspace.
 */
export function isBodyAtlasMuscleId(
  value: unknown,
): value is BodyAtlasMuscleId {
  return (
    typeof value === "string" &&
    (BODY_ATLAS_MUSCLE_IDS as readonly string[]).includes(value)
  );
}

/**
 * Maps a `@sergeant/fizruk-domain` muscle id (the stable, snake_case
 * identifiers used by `exercises.gymup.json` and `MuscleState.id`) to
 * the canonical atlas muscle id. Returns `null` for muscles that the
 * atlas does not render (e.g. very fine subdivisions like `teres_major`).
 *
 * The mapping mirrors the inline `map()` function inside
 * `apps/web/src/modules/fizruk/pages/Atlas.tsx` so web and mobile paint
 * the same silhouette from the same recovery data.
 */
export function mapDomainMuscleToAtlas(
  domainMuscleId: string | null | undefined,
): BodyAtlasMuscleId | null {
  if (!domainMuscleId) return null;
  switch (domainMuscleId) {
    case "pectoralis_major":
    case "pectoralis_minor":
      return "chest";
    case "latissimus_dorsi":
    case "rhomboids":
    case "upper_back":
      return "upper-back";
    case "erector_spinae":
      return "lower-back";
    case "trapezius":
      return "trapezius";
    case "biceps":
    case "brachialis":
      return "biceps";
    case "triceps":
      return "triceps";
    case "forearms":
      return "forearm";
    case "front_deltoid":
      return "front-deltoids";
    case "rear_deltoid":
      return "back-deltoids";
    case "rectus_abdominis":
      return "abs";
    case "obliques":
      return "obliques";
    case "quadriceps":
      return "quadriceps";
    case "hamstrings":
      return "hamstring";
    case "calves":
      return "calves";
    case "adductors":
      return "adductor";
    case "abductors":
      return "abductors";
    case "gluteus_maximus":
    case "gluteus_medius":
      return "gluteal";
    case "neck":
      return "neck";
    default:
      return null;
  }
}

/** Recovery-style status used by the web atlas (`green` / `yellow` / `red`). */
export type BodyAtlasStatus = "green" | "yellow" | "red";

/** Convert a 3-level status into a 0..1 highlight intensity. */
export function statusToIntensity(status: BodyAtlasStatus): number {
  switch (status) {
    case "red":
      return 1;
    case "yellow":
      return 0.6;
    case "green":
    default:
      return 0;
  }
}

/** Recovery metrics aggregated onto a single atlas muscle group. */
export interface AtlasMuscleAggregate {
  fatigue: number;
  load7d: number;
  daysSince: number | null;
  status: RecoveryStatus;
}

function worstStatus(a: RecoveryStatus, b: RecoveryStatus): RecoveryStatus {
  if (a === "red" || b === "red") return "red";
  if (a === "yellow" || b === "yellow") return "yellow";
  return "green";
}

/**
 * Fold a list of domain `MuscleState`s onto the canonical atlas keyspace.
 * Several domain muscles can map to one atlas group, so fatigue takes the
 * max, volume sums, recency takes the most recent (min daysSince), and
 * status takes the worst case. The single source of truth for both web and
 * mobile atlas renderers — neither re-implements the domain→atlas fold.
 */
export function aggregateRecoveryToAtlas(
  states: Iterable<MuscleState>,
): Partial<Record<BodyAtlasMuscleId, AtlasMuscleAggregate>> {
  const out: Partial<Record<BodyAtlasMuscleId, AtlasMuscleAggregate>> = {};
  for (const m of states) {
    const key = mapDomainMuscleToAtlas(m.id);
    if (!key) continue;
    const prev = out[key];
    if (!prev) {
      out[key] = {
        fatigue: m.fatigue,
        load7d: m.load7d,
        daysSince: m.daysSince,
        status: m.status,
      };
      continue;
    }
    prev.fatigue = Math.max(prev.fatigue, m.fatigue);
    prev.load7d += m.load7d;
    prev.daysSince =
      m.daysSince == null
        ? prev.daysSince
        : prev.daysSince == null
          ? m.daysSince
          : Math.min(prev.daysSince, m.daysSince);
    prev.status = worstStatus(prev.status, m.status);
  }
  return out;
}
