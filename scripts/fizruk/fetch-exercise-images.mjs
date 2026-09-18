import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { format } from "prettier";
import sharp from "sharp";

// Джерело: https://github.com/yuhonas/free-exercise-db, Unlicense.
// Пари звірено вручну за назвою, обладнанням і основними м'язами.
const EXERCISE_IMAGE_SOURCE_IDS = {
  bench_press_barbell: "Barbell_Bench_Press_-_Medium_Grip",
  bench_press_dumbbell: "Dumbbell_Bench_Press",
  incline_bench_press: "Barbell_Incline_Bench_Press_-_Medium_Grip",
  incline_dumbbell_press: "Incline_Dumbbell_Press",
  decline_bench_press: "Decline_Barbell_Bench_Press",
  dumbbell_flyes: "Dumbbell_Flyes",
  incline_dumbbell_flyes: "Incline_Dumbbell_Flyes",
  pushup: "Pushups",
  pushup_wide: "Push-Up_Wide",
  diamond_pushup: null,
  dips_chest: "Dips_-_Chest_Version",
  cable_crossover: "Cable_Crossover",
  machine_chest_press: "Leverage_Chest_Press",
  pec_deck: "Butterfly",
  pullup: "Pullups",
  chinup: "Chin-Up",
  neutral_pullup: "V-Bar_Pullup",
  barbell_row: "Bent_Over_Barbell_Row",
  dumbbell_row: "One-Arm_Dumbbell_Row",
  cable_lat_pulldown: "Wide-Grip_Lat_Pulldown",
  close_grip_lat_pulldown: "Close-Grip_Front_Lat_Pulldown",
  cable_seated_row: "Seated_Cable_Rows",
  t_bar_row: "T-Bar_Row_with_Handle",
  hyperextension: "Hyperextensions_Back_Extensions",
  inverted_row: "Inverted_Row",
  straight_arm_pulldown: "Straight-Arm_Pulldown",
  machine_row: "Leverage_Iso_Row",
  overhead_press_barbell: "Barbell_Shoulder_Press",
  overhead_press_dumbbell: "Dumbbell_Shoulder_Press",
  seated_dumbbell_press: "Seated_Dumbbell_Press",
  arnold_press: "Arnold_Dumbbell_Press",
  lateral_raise: "Side_Lateral_Raise",
  cable_lateral_raise: "Cable_Seated_Lateral_Raise",
  front_raise: "Front_Dumbbell_Raise",
  reverse_flyes: "Reverse_Flyes",
  upright_row: "Upright_Barbell_Row",
  cable_face_pull: "Face_Pull",
  shrugs: "Barbell_Shrug",
  machine_shoulder_press: "Machine_Shoulder_Military_Press",
  band_pull_apart: "Band_Pull_Apart",
  bicep_curl_barbell: "Barbell_Curl",
  bicep_curl_dumbbell: "Dumbbell_Bicep_Curl",
  hammer_curl: "Hammer_Curls",
  concentration_curl: "Concentration_Curls",
  preacher_curl: "Preacher_Curl",
  cable_curl: "Standing_Biceps_Cable_Curl",
  incline_dumbbell_curl: "Incline_Dumbbell_Curl",
  spider_curl: "Spider_Curl",
  ez_bar_curl: "EZ-Bar_Curl",
  band_bicep_curl: null,
  tricep_pushdown: "Triceps_Pushdown",
  skull_crusher: "EZ-Bar_Skullcrusher",
  dips_tricep: "Dips_-_Triceps_Version",
  overhead_tricep_extension: "Standing_Dumbbell_Triceps_Extension",
  close_grip_bench_press: "Close-Grip_Barbell_Bench_Press",
  tricep_kickback: "Tricep_Dumbbell_Kickback",
  rope_pushdown: "Triceps_Pushdown_-_Rope_Attachment",
  bench_dips: "Bench_Dips",
  band_tricep_pushdown: null,
  wrist_curl: "Seated_Palm-Up_Barbell_Wrist_Curl",
  reverse_wrist_curl: "Seated_Palms-Down_Barbell_Wrist_Curl",
  reverse_curl: "Reverse_Barbell_Curl",
  crunch: "Crunches",
  plank: "Plank",
  leg_raise: "Flat_Bench_Lying_Leg_Raise",
  bicycle_crunch: "Air_Bike",
  russian_twist: "Russian_Twist",
  hanging_leg_raise: "Hanging_Leg_Raise",
  side_plank: "Side_Bridge",
  ab_wheel_rollout: "Ab_Roller",
  cable_woodchop: "Standing_Cable_Wood_Chop",
  squat_barbell: "Barbell_Squat",
  front_squat: "Front_Barbell_Squat",
  squat_goblet: "Goblet_Squat",
  squat_bodyweight: "Bodyweight_Squat",
  leg_press: "Leg_Press",
  leg_extension: "Leg_Extensions",
  lunge: "Dumbbell_Lunges",
  reverse_lunge: "Dumbbell_Rear_Lunge",
  walking_lunge: "Bodyweight_Walking_Lunge",
  bulgarian_split_squat: null,
  hack_squat: "Hack_Squat",
  sissy_squat: null,
  step_up: "Dumbbell_Step_Ups",
  leg_curl: "Lying_Leg_Curls",
  romanian_deadlift: "Romanian_Deadlift",
  stiff_leg_deadlift: "Stiff-Legged_Barbell_Deadlift",
  good_morning: "Good_Morning",
  nordic_curl: null,
  single_leg_deadlift: "Kettlebell_One-Legged_Deadlift",
  kettlebell_swing: null,
  band_leg_curl: null,
  calf_raise_standing: "Standing_Calf_Raises",
  calf_raise_seated: "Seated_Calf_Raise",
  donkey_calf_raise: "Donkey_Calf_Raises",
  single_leg_calf_raise: null,
  hip_thrust: "Barbell_Hip_Thrust",
  glute_bridge: "Butt_Lift_Bridge",
  cable_kickback: "One-Legged_Cable_Kickback",
  sumo_deadlift: "Sumo_Deadlift",
  abductor_machine: "Thigh_Abductor",
  adductor_machine: "Thigh_Adductor",
  banded_clamshell: null,
  single_leg_hip_thrust: null,
  running: null,
  cycling: null,
  jump_rope: null,
  burpee: null,
  box_jump: null,
  rowing_machine: null,
  stairclimber: null,
  battle_ropes: null,
  deadlift: "Barbell_Deadlift",
  clean_and_press: "Clean_and_Press",
  turkish_getup: null,
  farmers_walk: null,
  thruster: null,
  snatch: "Snatch",
  man_maker: null,
  smith_bench_press: "Smith_Machine_Bench_Press",
  incline_pushup: "Incline_Push-Up",
  decline_pushup: "Decline_Push-Up",
  dumbbell_pullover: "Straight-Arm_Dumbbell_Pullover",
  band_chest_press: null,
  plyometric_pushup: "Plyo_Push-up",
  pendlay_row: null,
  rack_pull: "Rack_Pulls",
  barbell_row_underhand: "Reverse_Grip_Bent-Over_Rows",
  chest_supported_row: "Dumbbell_Incline_Row",
  single_arm_lat_pulldown: "One_Arm_Lat_Pulldown",
  band_row: null,
  band_lat_pulldown: null,
  pullup_negative: null,
  superman: "Superman",
  landmine_press: null,
  pike_pushup: null,
  band_lateral_raise: "Lateral_Raise_-_With_Bands",
  plate_front_raise: "Front_Plate_Raise",
  handstand_pushup: "Handstand_Push-Ups",
  rear_delt_machine: "Reverse_Machine_Flyes",
  zottman_curl: "Zottman_Curl",
  cable_rope_hammer_curl: "Cable_Hammer_Curls_-_Rope_Attachment",
  seated_dumbbell_curl: "Seated_Dumbbell_Curl",
  twenty_one_curl: null,
  single_arm_pushdown: null,
  french_press_seated: null,
  machine_tricep_extension: "Machine_Triceps_Extension",
  band_overhead_extension: "Speed_Band_Overhead_Triceps",
  farmers_hold: null,
  plate_pinch: "Plate_Pinch",
  dead_hang: null,
  wrist_roller: "Wrist_Roller",
  behind_back_wrist_curl:
    "Standing_Palms-Up_Barbell_Behind_The_Back_Wrist_Curl",
  band_wrist_extension: null,
  towel_hang: null,
  hollow_hold: null,
  mountain_climber: null,
  dead_bug: "Dead_Bug",
  bird_dog: null,
  reverse_crunch: "Reverse_Crunch",
  cable_crunch: "Cable_Crunch",
  pallof_press: "Pallof_Press",
  v_up: "Jackknife_Sit-Up",
  box_squat: "Box_Squat",
  wall_sit: null,
  jump_squat: "Freehand_Jump_Squat",
  split_squat: "Split_Squat_with_Dumbbells",
  pistol_squat: null,
  smith_squat: "Smith_Machine_Squat",
  glute_ham_raise: "Glute_Ham_Raise",
  seated_leg_curl: "Seated_Leg_Curl",
  cable_pull_through: "Pull_Through",
  kettlebell_deadlift: null,
  sliding_leg_curl: null,
  band_good_morning: "Band_Good_Morning",
  reverse_hyperextension: "Reverse_Hyperextension",
  calf_raise_leg_press: "Calf_Press_On_The_Leg_Press_Machine",
  dumbbell_calf_raise: "Standing_Dumbbell_Calf_Raise",
  calf_raise_stairs: null,
  tibialis_raise: null,
  band_calf_raise: "Calf_Raises_-_With_Bands",
  pogo_hops: null,
  band_kickback: "Hip_Extension_with_Bands",
  fire_hydrant: null,
  curtsy_lunge: null,
  sumo_squat: null,
  frog_pump: null,
  machine_hip_thrust: null,
  lateral_band_walk: null,
  walking: null,
  incline_treadmill_walk: null,
  swimming: null,
  elliptical: null,
  sprint_intervals: null,
  trap_bar_deadlift: "Trap_Bar_Deadlift",
  kettlebell_clean: "Kettlebell_Hang_Clean",
  wall_ball: null,
  sled_push: "Sled_Push",
  bear_crawl: null,
};

const FEDB_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const FEDB_IMAGE_ROOT =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
const EXPECTED_FEDB_COUNT = 876;
const IMAGE_BUDGET_BYTES = 12 * 1024 * 1024;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPath = join(
  repoRoot,
  "packages/fizruk-domain/src/data/exercises.gymup.json",
);
const registryPath = resolve(
  repoRoot,
  "packages/fizruk-domain/src/data/exerciseImages.ts",
);
const outputRoot = join(repoRoot, "apps/web/public/exercises");

async function fetchOrThrow(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response;
}

function imageUrl(pathname) {
  return `${FEDB_IMAGE_ROOT}${pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

async function mapWithConcurrency(values, concurrency, task) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        await task(values[index]);
      }
    },
  );
  await Promise.all(workers);
}

async function directorySize(pathname) {
  let total = 0;
  for (const entry of await readdir(pathname, { withFileTypes: true })) {
    const entryPath = join(pathname, entry.name);
    total += entry.isDirectory()
      ? await directorySize(entryPath)
      : (await stat(entryPath)).size;
  }
  return total;
}

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const catalogIds = catalog.exercises.map((exercise) => exercise.id);
const mappingIds = Object.keys(EXERCISE_IMAGE_SOURCE_IDS);
const missingMappingIds = catalogIds.filter(
  (id) => !(id in EXERCISE_IMAGE_SOURCE_IDS),
);
const unknownMappingIds = mappingIds.filter((id) => !catalogIds.includes(id));
if (missingMappingIds.length > 0 || unknownMappingIds.length > 0) {
  throw new Error(
    `Mapping mismatch. Missing: ${missingMappingIds.join(", ")}; unknown: ${unknownMappingIds.join(", ")}`,
  );
}

const fedb = await (await fetchOrThrow(FEDB_URL)).json();
if (fedb.length !== EXPECTED_FEDB_COUNT) {
  throw new Error(
    `Expected ${EXPECTED_FEDB_COUNT} fedb records, got ${fedb.length}`,
  );
}
const fedbById = new Map(fedb.map((exercise) => [exercise.id, exercise]));
const mappedExercises = catalog.exercises
  .map((exercise) => ({
    exercise,
    sourceId: EXERCISE_IMAGE_SOURCE_IDS[exercise.id],
  }))
  .filter(({ sourceId }) => sourceId !== null);

const duplicateSourceIds = mappedExercises
  .map(({ sourceId }) => sourceId)
  .filter((sourceId, index, all) => all.indexOf(sourceId) !== index);
if (duplicateSourceIds.length > 0) {
  throw new Error(`Duplicate fedb ids: ${duplicateSourceIds.join(", ")}`);
}

for (const { exercise, sourceId } of mappedExercises) {
  const source = fedbById.get(sourceId);
  if (!source || source.images.length < 2) {
    throw new Error(
      `Missing two source images for ${exercise.id}: ${sourceId}`,
    );
  }
}

await rm(outputRoot, { recursive: true, force: true });
const sourceBuffers = new Map();

async function renderImages(width, quality) {
  await mapWithConcurrency(
    mappedExercises,
    8,
    async ({ exercise, sourceId }) => {
      const source = fedbById.get(sourceId);
      const destination = join(outputRoot, exercise.id);
      await mkdir(destination, { recursive: true });
      await Promise.all(
        source.images.slice(0, 2).map(async (sourcePath, index) => {
          const url = imageUrl(sourcePath);
          let input = sourceBuffers.get(url);
          if (!input) {
            input = Buffer.from(await (await fetchOrThrow(url)).arrayBuffer());
            sourceBuffers.set(url, input);
          }
          await sharp(input)
            .resize({ width, withoutEnlargement: true })
            .webp({ quality })
            .toFile(join(destination, `${index}.webp`));
        }),
      );
    },
  );
}

await renderImages(480, 80);
let totalBytes = await directorySize(outputRoot);
let profile = "480px/q80";
if (totalBytes > IMAGE_BUDGET_BYTES) {
  await rm(outputRoot, { recursive: true, force: true });
  await renderImages(400, 75);
  totalBytes = await directorySize(outputRoot);
  profile = "400px/q75";
}
if (totalBytes > IMAGE_BUDGET_BYTES) {
  throw new Error(
    `Image budget exceeded: ${totalBytes} bytes > ${IMAGE_BUDGET_BYTES} bytes`,
  );
}

// Каталог імпортується статично, тож усе в ньому потрапляє в JS-бандл.
// Повні шляхи коштували там 16 кБ при запасі бюджету менш ніж 10 кБ, а шлях
// однозначно виводиться з id. Тому в репозиторій іде тільки перелік id.
const coveredIds = catalog.exercises
  .filter((exercise) => EXERCISE_IMAGE_SOURCE_IDS[exercise.id])
  .map((exercise) => exercise.id)
  .sort();

const registrySource = [
  "/**",
  " * Реєстр вправ, для яких у `apps/web/public/exercises/` лежать ілюстрації.",
  " *",
  " * Тут лише перелік id, а не готові шляхи: шлях детермінований, і 278",
  " * повних рядків у каталозі коштували 16 кБ у бандлі при запасі бюджету",
  " * менш ніж 10 кБ. Каталог імпортується статично, тож усе, що в ньому",
  " * лежить, потрапляє в JS.",
  " *",
  " * AI-GENERATED: scripts/fizruk/fetch-exercise-images.mjs",
  " */",
  "",
  "const IDS = [",
  ...coveredIds.map((id) => `  "${id}",`),
  "] as const;",
  "",
  "export const EXERCISE_IMAGE_IDS: ReadonlySet<string> = new Set(IDS);",
  "",
  "/** Два кадри руху, або порожньо, якщо ілюстрацій для вправи немає. */",
  "export function exerciseImagePaths(id: string): string[] {",
  "  if (!EXERCISE_IMAGE_IDS.has(id)) return [];",
  "  return [`/exercises/${id}/0.webp`, `/exercises/${id}/1.webp`];",
  "}",
  "",
].join("\n");

await writeFile(
  registryPath,
  await format(registrySource, { parser: "typescript" }),
  "utf8",
);

const nullByPrimaryGroup = Object.fromEntries(
  Object.entries(
    catalog.exercises
      .filter((exercise) => EXERCISE_IMAGE_SOURCE_IDS[exercise.id] === null)
      .reduce((counts, exercise) => {
        counts[exercise.primaryGroup] =
          (counts[exercise.primaryGroup] ?? 0) + 1;
        return counts;
      }, {}),
  ).sort(([left], [right]) => left.localeCompare(right)),
);

console.log(
  JSON.stringify(
    {
      mapped: mappedExercises.length,
      unmapped: catalog.exercises.length - mappedExercises.length,
      nullByPrimaryGroup,
      profile,
      totalBytes,
      totalMiB: Number((totalBytes / 1024 / 1024).toFixed(2)),
    },
    null,
    2,
  ),
);
