/**
 * Canonical fixtures for the nutrition meal-log contract — the
 * `log_meal` AI tool (chat tool-def in
 * `apps/server/src/modules/chat/toolDefs/nutrition.ts`) that writes to
 * the `nutrition_meals` table via the sync-v2 op-log
 * (`POST /api/v2/sync/push` with `table: "nutrition_meals"`).
 *
 * The tool result is executed client-side (the AI tool itself dispatches
 * to local storage + enqueues a sync-v2 push op); the server's
 * `applyNutritionMeals` function in
 * `apps/server/src/modules/sync/syncV2.ts` is the canonical consumer of
 * each op's `row` payload. The `row` shape defines the contract between
 * the client meal-log writer and the server apply-path.
 *
 * `nutrition_meals` row fields (all optional except `id`, `user_id`,
 * `eaten_at` which the apply-path requires):
 *   - `id` — UUID string (client-generated)
 *   - `user_id` — Better Auth user ID string
 *   - `eaten_at` — ISO-8601 timestamp (REQUIRED by apply-path)
 *   - `meal_type` — `"breakfast" | "lunch" | "dinner" | "snack"`
 *   - `name` — display name of the dish / product
 *   - `label` — short label (may match `name` for simple entries)
 *   - `kcal` — integer kcal (optional, null when unknown)
 *   - `protein_g` — grams of protein (optional, null)
 *   - `fat_g` — grams of fat (optional, null)
 *   - `carbs_g` — grams of carbs (optional, null)
 *   - `source` — `"manual"` | `"ai"` | `"barcode"` | `"off"` | `"usda"`
 *   - `macro_source` — where macros came from: `"manual"` | `"ai"` | `"off"` | `"usda"`
 *   - `amount_g` — portion size in grams (optional)
 *   - `food_id` — product ID from food-search / barcode (optional)
 *   - `is_demo` — boolean flag for demo data
 *   - `created_at` — ISO-8601 string (optional; apply-path uses client_ts if absent)
 *   - `deleted_at` — ISO-8601 string | null (soft-delete)
 *
 * BIGINT NOTE: The `nutrition_meals` table uses no bigint columns for
 * macro fields — `kcal` is `integer`, `protein_g`/`fat_g`/`carbs_g` are
 * `real`. No Hard Rule #1 coercion needed here. All numeric fields in the
 * sync-v2 `row` payload are plain JS numbers per the op-log schema.
 *
 * Named cases (sync-v2 push ops, each carrying a `nutrition_meals` row):
 *
 * - `insertFullMacros` — inserting a meal with all macros known (AI-logged
 *   from chat, source `"ai"`).
 * - `insertPartialMacros` — inserting a meal where only kcal is present
 *   (partial AI estimate or manual entry without macro breakdown).
 * - `insertFromBarcode` — inserting a meal from a barcode scan; `source`
 *   is `"off"` (Open Food Facts), `food_id` set.
 * - `softDelete` — delete op for a meal (tombstone); `row` carries only
 *   `id`, `user_id`, and `deleted_at` (apply-path checks these).
 *
 * Closes contract slice T-2 from
 * `docs/planning/pr-plan-testing-devx-2026-05.md`.
 */

// NOTE: `packages/shared` must not import from `packages/api-client`
// (circular dependency). The inline types below mirror the `nutrition_meals`
// row shape as consumed by `applyNutritionMeals` in
// `apps/server/src/modules/sync/syncV2.ts`. They MUST stay in sync with the
// apply-path logic.
//
// The outer push-op envelope mirrors `SyncV2PushOp` from
// `packages/api-client/src/endpoints/syncV2.ts`.

/** A `nutrition_meals` row as carried in a sync-v2 push op. */
export interface NutritionMealRowFixture {
  id: string;
  user_id: string;
  eaten_at: string;
  meal_type?: string;
  name?: string;
  label?: string;
  kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  source?: string;
  macro_source?: string;
  amount_g?: number | null;
  food_id?: string | null;
  is_demo?: boolean;
  created_at?: string;
  deleted_at?: string | null;
}

/** A single sync-v2 push op targeting `nutrition_meals`. */
export interface NutritionLogPushOpFixture {
  table: "nutrition_meals";
  op: "insert" | "update" | "delete";
  row: NutritionMealRowFixture;
  client_ts: string;
  idempotency_key: string;
}

/** Server response to a sync-v2 push — mirrors `SyncV2PushResponse`. */
export interface NutritionLogPushResponseFixture {
  accepted: number;
  last_op_id: number;
  results: Array<{
    idempotency_key: string;
    status: "applied" | "duplicate" | "rejected";
    reason?: string;
  }>;
}

// ── Push op fixtures (client → server) ───────────────────────────────────────

export const nutritionLogPushOpFixtures = {
  insertFullMacros: {
    table: "nutrition_meals",
    op: "insert",
    row: {
      id: "meal-pact-001",
      user_id: "user-pact-001",
      eaten_at: "2026-05-13T08:30:00.000Z",
      meal_type: "breakfast",
      name: "Вівсянка з бананом",
      label: "Вівсянка з бананом",
      kcal: 380,
      protein_g: 9,
      fat_g: 6,
      carbs_g: 72,
      source: "ai",
      macro_source: "ai",
      amount_g: 250,
      food_id: null,
      is_demo: false,
      created_at: "2026-05-13T08:30:00.000Z",
      deleted_at: null,
    },
    client_ts: "2026-05-13T08:30:00.000Z",
    idempotency_key: "01HZPACT00000000000000000A",
  },
  insertPartialMacros: {
    table: "nutrition_meals",
    op: "insert",
    row: {
      id: "meal-pact-002",
      user_id: "user-pact-001",
      eaten_at: "2026-05-13T13:00:00.000Z",
      meal_type: "lunch",
      name: "Борщ",
      label: "Борщ",
      kcal: 280,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
      source: "manual",
      macro_source: "manual",
      amount_g: null,
      food_id: null,
      is_demo: false,
      created_at: "2026-05-13T13:00:00.000Z",
      deleted_at: null,
    },
    client_ts: "2026-05-13T13:00:00.000Z",
    idempotency_key: "01HZPACT00000000000000000B",
  },
  insertFromBarcode: {
    table: "nutrition_meals",
    op: "insert",
    row: {
      id: "meal-pact-003",
      user_id: "user-pact-001",
      eaten_at: "2026-05-13T16:00:00.000Z",
      meal_type: "snack",
      name: "Молоко 2.5% Яготинське",
      label: "Молоко 2.5%",
      kcal: 104,
      protein_g: 5.6,
      fat_g: 5.0,
      carbs_g: 9.4,
      source: "off",
      macro_source: "off",
      amount_g: 200,
      food_id: "off_1a2b3c4d",
      is_demo: false,
      created_at: "2026-05-13T16:00:00.000Z",
      deleted_at: null,
    },
    client_ts: "2026-05-13T16:00:00.000Z",
    idempotency_key: "01HZPACT00000000000000000C",
  },
  softDelete: {
    table: "nutrition_meals",
    op: "delete",
    row: {
      id: "meal-pact-001",
      user_id: "user-pact-001",
      eaten_at: "2026-05-13T08:30:00.000Z",
      deleted_at: "2026-05-13T09:00:00.000Z",
    },
    client_ts: "2026-05-13T09:00:00.000Z",
    idempotency_key: "01HZPACT00000000000000000D",
  },
} as const satisfies Record<string, NutritionLogPushOpFixture>;

export type NutritionLogPushOpFixtureCase =
  keyof typeof nutritionLogPushOpFixtures;

// ── Push response fixtures (server → client) ──────────────────────────────────

export const nutritionLogPushResponseFixtures = {
  allApplied: {
    accepted: 1,
    // bigint-backed BIGSERIAL coerced to number (Hard Rule #1)
    last_op_id: 2001,
    results: [
      {
        idempotency_key: "01HZPACT00000000000000000A",
        status: "applied",
      },
    ],
  },
  duplicate: {
    accepted: 0,
    last_op_id: 2001,
    results: [
      {
        idempotency_key: "01HZPACT00000000000000000A",
        status: "duplicate",
      },
    ],
  },
  rejected: {
    accepted: 0,
    last_op_id: 2001,
    results: [
      {
        idempotency_key: "01HZPACT00000000000000000E",
        status: "rejected",
        reason: "user_id_mismatch",
      },
    ],
  },
} as const satisfies Record<string, NutritionLogPushResponseFixture>;

export type NutritionLogPushResponseFixtureCase =
  keyof typeof nutritionLogPushResponseFixtures;

// ── Raw unknown views — feed to runtime parsers ──────────────────────────────

export const nutritionLogPushOpRawFixtures: Record<
  NutritionLogPushOpFixtureCase,
  unknown
> = nutritionLogPushOpFixtures;

export const nutritionLogPushResponseRawFixtures: Record<
  NutritionLogPushResponseFixtureCase,
  unknown
> = nutritionLogPushResponseFixtures;

// ── Self-check ────────────────────────────────────────────────────────────────

/**
 * Cheap self-check: validate the invariants documented in the apply-path.
 * When dedicated Zod schemas are added for `NutritionMealRow` and the
 * push-op envelope in `@sergeant/shared`, replace the manual checks with
 * schema parse loops.
 */
export function assertNutritionLogFixturesValid(): void {
  for (const [name, fixture] of Object.entries(nutritionLogPushOpFixtures)) {
    if (fixture.table !== "nutrition_meals") {
      throw new Error(
        `Contract fixture "nutrition-log.pushOp.${name}": "table" must be "nutrition_meals"`,
      );
    }
    if (!["insert", "update", "delete"].includes(fixture.op)) {
      throw new Error(
        `Contract fixture "nutrition-log.pushOp.${name}": "op" must be insert|update|delete`,
      );
    }
    if (typeof fixture.row.id !== "string" || fixture.row.id.length === 0) {
      throw new Error(
        `Contract fixture "nutrition-log.pushOp.${name}": "row.id" must be a non-empty string`,
      );
    }
    if (
      typeof fixture.row.user_id !== "string" ||
      fixture.row.user_id.length === 0
    ) {
      throw new Error(
        `Contract fixture "nutrition-log.pushOp.${name}": "row.user_id" must be a non-empty string`,
      );
    }
    if (
      typeof fixture.row.eaten_at !== "string" ||
      fixture.row.eaten_at.length === 0
    ) {
      throw new Error(
        `Contract fixture "nutrition-log.pushOp.${name}": "row.eaten_at" must be a non-empty ISO-8601 string`,
      );
    }
    if (typeof fixture.idempotency_key !== "string") {
      throw new Error(
        `Contract fixture "nutrition-log.pushOp.${name}": "idempotency_key" must be a string`,
      );
    }
  }
  for (const [name, fixture] of Object.entries(
    nutritionLogPushResponseFixtures,
  )) {
    if (typeof fixture.accepted !== "number") {
      throw new Error(
        `Contract fixture "nutrition-log.pushResponse.${name}": "accepted" must be a number`,
      );
    }
    if (typeof fixture.last_op_id !== "number") {
      throw new Error(
        `Contract fixture "nutrition-log.pushResponse.${name}": "last_op_id" must be a number (Hard Rule #1 — bigint coercion)`,
      );
    }
    if (!Array.isArray(fixture.results)) {
      throw new Error(
        `Contract fixture "nutrition-log.pushResponse.${name}": "results" must be an array`,
      );
    }
  }
}
