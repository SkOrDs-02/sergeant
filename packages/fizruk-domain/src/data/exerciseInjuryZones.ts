/**
 * Explicit "which joints does this movement load" registry for the built-in
 * exercise catalog.
 *
 * AI-CONTEXT: This map is the half of the injury model that muscle data cannot
 * express (ADR-0083). It is deliberately an explicit per-exercise registry and
 * NOT derived from `primaryGroup` / `equipment`: a heuristic miss here costs a
 * joint, not a pixel. `exerciseInjuryZones.test.ts` fails when a catalog
 * exercise has no entry, so a new exercise cannot silently ship without a
 * safety mapping.
 *
 * Coverage bias is intentional: a movement is listed under a zone when it
 * meaningfully loads it, including isometric and grip load. Over-blocking costs
 * the user one recommendation; under-blocking costs them the joint.
 *
 * AI-DANGER: This registry is not a medical claim and must never be presented
 * as one. It answers "does this movement load the marked zone", never "is this
 * safe for you" (канон fizruk §5 — медичних порад не даємо).
 */

import type { InjuryZoneId } from "./injurySites.js";

/** Catalog exercise id → joints / spinal segments the movement loads. */
export const EXERCISE_INJURY_ZONES: Record<string, readonly InjuryZoneId[]> = {
  // ── chest ────────────────────────────────────────────────────────────────
  bench_press_barbell: ["shoulder", "elbow", "wrist"],
  bench_press_dumbbell: ["shoulder", "elbow", "wrist"],
  incline_bench_press: ["shoulder", "elbow", "wrist"],
  incline_dumbbell_press: ["shoulder", "elbow", "wrist"],
  decline_bench_press: ["shoulder", "elbow", "wrist"],
  dumbbell_flyes: ["shoulder", "elbow"],
  incline_dumbbell_flyes: ["shoulder", "elbow"],
  pushup: ["shoulder", "elbow", "wrist"],
  pushup_wide: ["shoulder", "elbow", "wrist"],
  diamond_pushup: ["shoulder", "elbow", "wrist"],
  dips_chest: ["shoulder", "elbow", "wrist"],
  cable_crossover: ["shoulder", "elbow"],
  machine_chest_press: ["shoulder", "elbow"],
  pec_deck: ["shoulder"],
  smith_bench_press: ["shoulder", "elbow", "wrist"],
  incline_pushup: ["shoulder", "elbow", "wrist"],
  decline_pushup: ["shoulder", "elbow", "wrist"],
  dumbbell_pullover: ["shoulder", "elbow"],
  band_chest_press: ["shoulder", "elbow", "wrist"],
  plyometric_pushup: ["shoulder", "elbow", "wrist"],

  // ── back ─────────────────────────────────────────────────────────────────
  pullup: ["shoulder", "elbow", "wrist"],
  chinup: ["shoulder", "elbow", "wrist"],
  neutral_pullup: ["shoulder", "elbow", "wrist"],
  barbell_row: ["shoulder", "elbow", "wrist", "hip", "spine-lumbar"],
  dumbbell_row: ["shoulder", "elbow", "wrist", "spine-lumbar"],
  cable_lat_pulldown: ["shoulder", "elbow", "wrist"],
  close_grip_lat_pulldown: ["shoulder", "elbow", "wrist"],
  cable_seated_row: ["shoulder", "elbow", "wrist", "spine-lumbar"],
  t_bar_row: ["shoulder", "elbow", "wrist", "hip", "spine-lumbar"],
  hyperextension: ["hip", "spine-lumbar"],
  inverted_row: ["shoulder", "elbow", "wrist"],
  straight_arm_pulldown: ["shoulder"],
  machine_row: ["shoulder", "elbow", "wrist"],
  pendlay_row: ["shoulder", "elbow", "wrist", "hip", "spine-lumbar"],
  rack_pull: ["shoulder", "wrist", "hip", "spine-lumbar"],
  barbell_row_underhand: ["shoulder", "elbow", "wrist", "hip", "spine-lumbar"],
  chest_supported_row: ["shoulder", "elbow", "wrist"],
  single_arm_lat_pulldown: ["shoulder", "elbow", "wrist"],
  band_row: ["shoulder", "elbow", "wrist"],
  band_lat_pulldown: ["shoulder", "elbow", "wrist"],
  pullup_negative: ["shoulder", "elbow", "wrist"],
  superman: ["spine-lumbar", "shoulder"],

  // ── shoulders ────────────────────────────────────────────────────────────
  overhead_press_barbell: ["shoulder", "elbow", "wrist", "spine-lumbar"],
  overhead_press_dumbbell: ["shoulder", "elbow", "wrist", "spine-lumbar"],
  seated_dumbbell_press: ["shoulder", "elbow", "wrist"],
  arnold_press: ["shoulder", "elbow", "wrist"],
  lateral_raise: ["shoulder"],
  cable_lateral_raise: ["shoulder"],
  front_raise: ["shoulder"],
  reverse_flyes: ["shoulder"],
  upright_row: ["shoulder", "elbow", "wrist"],
  cable_face_pull: ["shoulder", "elbow"],
  shrugs: ["shoulder", "wrist", "spine-cervical"],
  machine_shoulder_press: ["shoulder", "elbow"],
  band_pull_apart: ["shoulder"],
  landmine_press: ["shoulder", "elbow", "wrist", "spine-lumbar"],
  pike_pushup: ["shoulder", "elbow", "wrist"],
  band_lateral_raise: ["shoulder"],
  plate_front_raise: ["shoulder", "wrist"],
  handstand_pushup: ["shoulder", "elbow", "wrist", "spine-cervical"],
  rear_delt_machine: ["shoulder"],

  // ── biceps ───────────────────────────────────────────────────────────────
  bicep_curl_barbell: ["elbow", "wrist"],
  bicep_curl_dumbbell: ["elbow", "wrist"],
  hammer_curl: ["elbow", "wrist"],
  concentration_curl: ["elbow", "wrist"],
  preacher_curl: ["elbow", "wrist"],
  cable_curl: ["elbow", "wrist"],
  incline_dumbbell_curl: ["shoulder", "elbow", "wrist"],
  spider_curl: ["elbow", "wrist"],
  ez_bar_curl: ["elbow", "wrist"],
  band_bicep_curl: ["elbow", "wrist"],
  zottman_curl: ["elbow", "wrist"],
  cable_rope_hammer_curl: ["elbow", "wrist"],
  seated_dumbbell_curl: ["elbow", "wrist"],
  twenty_one_curl: ["elbow", "wrist"],

  // ── triceps ──────────────────────────────────────────────────────────────
  tricep_pushdown: ["elbow", "wrist"],
  skull_crusher: ["shoulder", "elbow", "wrist"],
  dips_tricep: ["shoulder", "elbow", "wrist"],
  overhead_tricep_extension: ["shoulder", "elbow", "wrist"],
  close_grip_bench_press: ["shoulder", "elbow", "wrist"],
  tricep_kickback: ["shoulder", "elbow"],
  rope_pushdown: ["elbow", "wrist"],
  bench_dips: ["shoulder", "elbow", "wrist"],
  band_tricep_pushdown: ["elbow", "wrist"],
  single_arm_pushdown: ["elbow", "wrist"],
  french_press_seated: ["shoulder", "elbow", "wrist"],
  machine_tricep_extension: ["elbow", "wrist"],
  band_overhead_extension: ["shoulder", "elbow", "wrist"],

  // ── forearms ─────────────────────────────────────────────────────────────
  wrist_curl: ["elbow", "wrist"],
  reverse_wrist_curl: ["elbow", "wrist"],
  reverse_curl: ["elbow", "wrist"],
  farmers_hold: ["wrist", "shoulder", "spine-lumbar"],
  plate_pinch: ["wrist", "elbow"],
  dead_hang: ["wrist", "elbow", "shoulder"],
  wrist_roller: ["wrist", "elbow", "shoulder"],
  behind_back_wrist_curl: ["wrist", "elbow"],
  band_wrist_extension: ["wrist", "elbow"],
  towel_hang: ["wrist", "elbow", "shoulder"],

  // ── core ─────────────────────────────────────────────────────────────────
  crunch: ["spine-lumbar", "spine-cervical"],
  plank: ["shoulder", "elbow", "spine-lumbar"],
  leg_raise: ["hip", "spine-lumbar"],
  bicycle_crunch: ["hip", "spine-lumbar", "spine-cervical"],
  russian_twist: ["spine-lumbar"],
  hanging_leg_raise: ["shoulder", "wrist", "hip", "spine-lumbar"],
  side_plank: ["shoulder", "spine-lumbar"],
  ab_wheel_rollout: ["shoulder", "spine-lumbar"],
  cable_woodchop: ["shoulder", "spine-lumbar"],
  hollow_hold: ["spine-lumbar", "hip"],
  mountain_climber: ["shoulder", "wrist", "hip", "spine-lumbar"],
  dead_bug: ["spine-lumbar", "hip"],
  bird_dog: ["spine-lumbar", "shoulder", "hip"],
  reverse_crunch: ["spine-lumbar", "hip"],
  cable_crunch: ["spine-lumbar", "hip"],
  pallof_press: ["shoulder", "spine-lumbar"],
  v_up: ["spine-lumbar", "hip"],

  // ── quadriceps ───────────────────────────────────────────────────────────
  squat_barbell: ["hip", "knee", "ankle", "spine-lumbar"],
  front_squat: ["wrist", "hip", "knee", "ankle", "spine-lumbar"],
  squat_goblet: ["hip", "knee", "ankle", "spine-lumbar"],
  squat_bodyweight: ["hip", "knee", "ankle"],
  leg_press: ["hip", "knee"],
  leg_extension: ["knee"],
  lunge: ["hip", "knee", "ankle"],
  reverse_lunge: ["hip", "knee", "ankle"],
  walking_lunge: ["hip", "knee", "ankle"],
  bulgarian_split_squat: ["hip", "knee", "ankle"],
  hack_squat: ["hip", "knee", "ankle"],
  sissy_squat: ["knee", "ankle"],
  step_up: ["hip", "knee", "ankle"],
  box_squat: ["hip", "knee", "ankle", "spine-lumbar"],
  wall_sit: ["knee", "hip"],
  jump_squat: ["hip", "knee", "ankle", "achilles"],
  split_squat: ["hip", "knee", "ankle"],
  pistol_squat: ["hip", "knee", "ankle"],
  smith_squat: ["hip", "knee", "ankle", "spine-lumbar"],

  // ── hamstrings ───────────────────────────────────────────────────────────
  leg_curl: ["knee"],
  romanian_deadlift: ["hip", "knee", "spine-lumbar"],
  stiff_leg_deadlift: ["hip", "spine-lumbar"],
  good_morning: ["hip", "spine-lumbar"],
  nordic_curl: ["knee"],
  single_leg_deadlift: ["hip", "knee", "ankle", "spine-lumbar"],
  kettlebell_swing: ["shoulder", "hip", "spine-lumbar"],
  band_leg_curl: ["knee"],
  glute_ham_raise: ["knee", "hip", "spine-lumbar"],
  seated_leg_curl: ["knee"],
  cable_pull_through: ["hip", "spine-lumbar"],
  kettlebell_deadlift: ["hip", "knee", "spine-lumbar", "wrist"],
  sliding_leg_curl: ["knee", "hip", "spine-lumbar"],
  band_good_morning: ["hip", "spine-lumbar"],
  reverse_hyperextension: ["hip", "spine-lumbar"],

  // ── calves ───────────────────────────────────────────────────────────────
  calf_raise_standing: ["ankle", "achilles"],
  calf_raise_seated: ["knee", "ankle", "achilles"],
  donkey_calf_raise: ["ankle", "achilles", "spine-lumbar"],
  single_leg_calf_raise: ["ankle", "achilles"],
  calf_raise_leg_press: ["ankle", "achilles", "knee"],
  dumbbell_calf_raise: ["ankle", "achilles", "wrist"],
  calf_raise_stairs: ["ankle", "achilles"],
  tibialis_raise: ["ankle"],
  band_calf_raise: ["ankle", "achilles"],
  pogo_hops: ["ankle", "achilles", "knee"],

  // ── glutes ───────────────────────────────────────────────────────────────
  hip_thrust: ["hip", "knee", "spine-lumbar"],
  glute_bridge: ["hip", "knee", "spine-lumbar"],
  cable_kickback: ["hip"],
  sumo_deadlift: ["wrist", "hip", "knee", "spine-lumbar"],
  abductor_machine: ["hip"],
  adductor_machine: ["hip"],
  banded_clamshell: ["hip"],
  single_leg_hip_thrust: ["hip", "knee", "spine-lumbar"],
  band_kickback: ["hip"],
  fire_hydrant: ["hip"],
  curtsy_lunge: ["hip", "knee", "ankle"],
  sumo_squat: ["hip", "knee", "ankle", "spine-lumbar"],
  frog_pump: ["hip", "knee"],
  machine_hip_thrust: ["hip", "knee", "spine-lumbar"],
  lateral_band_walk: ["hip", "knee"],

  // ── cardio ───────────────────────────────────────────────────────────────
  running: ["hip", "knee", "ankle", "achilles"],
  cycling: ["hip", "knee"],
  jump_rope: ["wrist", "knee", "ankle", "achilles"],
  burpee: ["shoulder", "elbow", "wrist", "knee", "ankle", "spine-lumbar"],
  box_jump: ["hip", "knee", "ankle", "achilles"],
  rowing_machine: ["shoulder", "elbow", "hip", "knee", "spine-lumbar"],
  stairclimber: ["hip", "knee", "ankle"],
  battle_ropes: ["shoulder", "elbow", "wrist"],
  walking: ["hip", "knee", "ankle"],
  incline_treadmill_walk: ["hip", "knee", "ankle", "achilles"],
  swimming: ["shoulder", "spine-lumbar"],
  elliptical: ["hip", "knee", "ankle"],
  sprint_intervals: ["hip", "knee", "ankle", "achilles"],

  // ── full body ────────────────────────────────────────────────────────────
  deadlift: ["shoulder", "wrist", "hip", "knee", "spine-lumbar"],
  clean_and_press: [
    "shoulder",
    "elbow",
    "wrist",
    "hip",
    "knee",
    "ankle",
    "spine-lumbar",
  ],
  turkish_getup: ["shoulder", "elbow", "wrist", "hip", "knee", "spine-lumbar"],
  farmers_walk: ["shoulder", "wrist", "spine-lumbar", "spine-cervical"],
  thruster: [
    "shoulder",
    "elbow",
    "wrist",
    "hip",
    "knee",
    "ankle",
    "spine-lumbar",
  ],
  snatch: [
    "shoulder",
    "elbow",
    "wrist",
    "hip",
    "knee",
    "ankle",
    "spine-lumbar",
  ],
  man_maker: ["shoulder", "elbow", "wrist", "hip", "knee", "spine-lumbar"],
  trap_bar_deadlift: ["shoulder", "wrist", "hip", "knee", "spine-lumbar"],
  kettlebell_clean: [
    "shoulder",
    "elbow",
    "wrist",
    "hip",
    "knee",
    "spine-lumbar",
  ],
  wall_ball: ["shoulder", "elbow", "wrist", "hip", "knee", "spine-lumbar"],
  sled_push: ["shoulder", "hip", "knee", "ankle", "achilles"],
  bear_crawl: ["shoulder", "wrist", "hip", "knee"],
};

/**
 * Joints loaded by an exercise, or `null` when the exercise is not in the
 * registry (custom user exercises).
 *
 * `null` is NOT "no joints" — it is "unknown", and callers must surface that
 * difference. Collapsing the two is exactly the false-protection failure
 * ADR-0083 exists to prevent.
 */
export function injuryZonesForExercise(
  exerciseId: string | null | undefined,
): readonly InjuryZoneId[] | null {
  if (!exerciseId) return null;
  return EXERCISE_INJURY_ZONES[exerciseId] ?? null;
}
