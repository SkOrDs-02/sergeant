/**
 * Canonical injury-site keyspace for the Fizruk "не можна" model.
 *
 * AI-CONTEXT: The keyspace is deliberately WIDER than `BODY_ATLAS_MUSCLE_IDS`.
 * The atlas draws 18 muscle groups and has no joints or tendons — yet knees,
 * elbows, shoulders, wrists and achilles are the typical strength-training
 * injuries. A muscle-only injury model cannot name what actually hurts, so it
 * reports "травму враховано" while still recommending the movement that caused
 * it. That failure mode (false sense of protection on a physical-harm surface)
 * is why ADR-0083 puts injury marks on the ZONE, with the atlas muscle set as
 * one input rather than the whole ontology.
 *
 * See `docs/04-governance/adr/0083-injury-model-zone-level.md` and audit E-4 in
 * `docs/90-work/audits/product-knowledge-fizruk.md`.
 */

import {
  BODY_ATLAS_MUSCLE_IDS,
  BODY_ATLAS_MUSCLE_LABELS_UK,
  type BodyAtlasMuscleId,
} from "./bodyAtlas.js";

/**
 * Joints and spinal segments the body atlas cannot express.
 *
 * AI-DANGER: Removing an id from this list silently un-blocks every exercise
 * that was blocked through it — a user carrying that injury mark starts being
 * recommended the movement again with no visible change. Treat additions as
 * cheap and removals as a data migration.
 */
export const INJURY_ZONE_IDS = [
  "shoulder",
  "elbow",
  "wrist",
  "hip",
  "knee",
  "ankle",
  "achilles",
  "spine-lumbar",
  "spine-cervical",
] as const;

/** Joints / spinal segments — the half of the keyspace the atlas lacks. */
export type InjuryZoneId = (typeof INJURY_ZONE_IDS)[number];

/**
 * Every place a user can pin an injury: the 18 atlas muscle groups plus the
 * joints and spinal segments above.
 */
export type InjurySiteId = BodyAtlasMuscleId | InjuryZoneId;

/** All injury sites, muscles first (atlas order), then zones. */
export const INJURY_SITE_IDS: readonly InjurySiteId[] = [
  ...BODY_ATLAS_MUSCLE_IDS,
  ...INJURY_ZONE_IDS,
];

/** Ukrainian labels for the joint / spine half of the keyspace. */
export const INJURY_ZONE_LABELS_UK: Record<InjuryZoneId, string> = {
  shoulder: "Плечовий суглоб",
  elbow: "Лікоть",
  wrist: "Запʼясток",
  hip: "Кульшовий суглоб",
  knee: "Коліно",
  ankle: "Гомілковостоп",
  achilles: "Ахіллове сухожилля",
  "spine-lumbar": "Поперек",
  "spine-cervical": "Шийний відділ",
};

/** Ukrainian labels for the whole injury keyspace (muscles + zones). */
export const INJURY_SITE_LABELS_UK: Record<InjurySiteId, string> = {
  ...BODY_ATLAS_MUSCLE_LABELS_UK,
  ...INJURY_ZONE_LABELS_UK,
};

/** Type guard for the joint / spine half of the keyspace. */
export function isInjuryZoneId(value: unknown): value is InjuryZoneId {
  return (
    typeof value === "string" &&
    (INJURY_ZONE_IDS as readonly string[]).includes(value)
  );
}

/** Type guard for any injury site (muscle group or zone). */
export function isInjurySiteId(value: unknown): value is InjurySiteId {
  return (
    typeof value === "string" &&
    (INJURY_SITE_IDS as readonly string[]).includes(value)
  );
}

/** Ukrainian label for an injury site; falls back to the raw id. */
export function injurySiteLabelUk(site: string): string {
  return isInjurySiteId(site) ? INJURY_SITE_LABELS_UK[site] : site;
}
