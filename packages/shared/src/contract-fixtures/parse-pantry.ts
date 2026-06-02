/**
 * Canonical fixtures for `POST /api/nutrition/parse-pantry`.
 *
 * The route lives in `apps/server/src/routes/nutrition.ts`, handled by
 * `apps/server/src/modules/nutrition/parse-pantry.ts`. The server returns
 * `{ items, rawText }` where `items` is the AI-normalised array of pantry
 * entries and `rawText` is the raw Anthropic output (kept for debugging).
 *
 * The response type is `NutritionParsePantryResponse` in
 * `packages/api-client/src/endpoints/nutrition.ts`. There is no dedicated
 * Zod schema for the response in `@sergeant/shared` (the parse-pantry
 * request schema lives in `@sergeant/shared/schemas/api` as
 * `ParsePantrySchema`, but the response shape is defined in the api-client).
 * These fixtures document the golden wire shape until a shared response
 * schema is added (tracked in PR-T30 scope expansion).
 *
 * Named cases:
 *
 * - `twoItemsWithQty` — clean input: two items with quantities and units.
 * - `itemsWithNullQty` — items where qty/unit are not specified → null.
 * - `itemWithNotes` — item with notes field (e.g. allergies, brand).
 * - `emptyItems` — Anthropic parsed the input but found no items
 *   (`items: []`); `rawText` preserves the model reply for audit.
 *
 * Closes contract slice PR-T30 from
 * `docs/testing/2026-05-05-tests-pr-plan.md` (web `/api/nutrition/parse-pantry`
 * consumer contract).
 */

// NutritionParsePantryResponse shape:
// { items: Array<{ name: string; qty: number|null; unit: string|null; notes: string|null }>;
//   rawText: string | null }

/** A single normalised pantry item as the server emits it. */
export interface ParsePantryItemFixture {
  name: string;
  qty: number | null;
  unit: string | null;
  notes: string | null;
}

/** Success response shape for `POST /api/nutrition/parse-pantry`. */
export interface ParsePantryResponseFixture {
  items: ParsePantryItemFixture[];
  rawText: string | null;
}

export const parsePantryFixtures = {
  twoItemsWithQty: {
    items: [
      { name: "молоко", qty: 1, unit: "л", notes: null },
      { name: "яйця", qty: 6, unit: "шт", notes: null },
    ],
    rawText:
      '{"items":[{"name":"молоко","qty":1,"unit":"л","notes":null},{"name":"яйця","qty":6,"unit":"шт","notes":null}]}',
  },
  itemsWithNullQty: {
    items: [
      { name: "сіль", qty: null, unit: null, notes: null },
      { name: "перець", qty: null, unit: null, notes: null },
    ],
    rawText:
      '{"items":[{"name":"сіль","qty":null,"unit":null,"notes":null},{"name":"перець","qty":null,"unit":null,"notes":null}]}',
  },
  itemWithNotes: {
    items: [
      {
        name: "сир",
        qty: 200,
        unit: "г",
        notes: "без лактози",
      },
    ],
    rawText:
      '{"items":[{"name":"сир","qty":200,"unit":"г","notes":"без лактози"}]}',
  },
  emptyItems: {
    items: [],
    rawText: '{"items":[]}',
  },
} as const satisfies Record<string, ParsePantryResponseFixture>;

export type ParsePantryFixtureCase = keyof typeof parsePantryFixtures;

/**
 * Same fixtures, but typed as `unknown` — feed these to runtime validation
 * paths. The `as const satisfies …` shape above proves the static types;
 * the `unknown` view proves a runtime parser accepts the JSON.
 */
export const parsePantryRawFixtures: Record<ParsePantryFixtureCase, unknown> =
  parsePantryFixtures;

/**
 * Cheap self-check: every named fixture must be structurally valid.
 * Because there is no `ParsePantryResponseSchema` yet in `@sergeant/shared`,
 * this check validates the invariants manually instead of calling
 * `Schema.safeParse`. When a dedicated Zod schema is added (PR-T30 follow-
 * up), replace this function body with a schema parse loop.
 */
export function assertParsePantryFixturesValid(): void {
  for (const [name, fixture] of Object.entries(parsePantryFixtures)) {
    if (!Array.isArray(fixture.items)) {
      throw new Error(
        `Contract fixture "parse-pantry.${name}": "items" must be an array`,
      );
    }
    for (const item of fixture.items) {
      if (typeof item.name !== "string" || item.name.length === 0) {
        throw new Error(
          `Contract fixture "parse-pantry.${name}": every item must have a non-empty "name"`,
        );
      }
      if (item.qty !== null && typeof item.qty !== "number") {
        throw new Error(
          `Contract fixture "parse-pantry.${name}": item.qty must be number or null`,
        );
      }
    }
    if (fixture.rawText !== null && typeof fixture.rawText !== "string") {
      throw new Error(
        `Contract fixture "parse-pantry.${name}": "rawText" must be string or null`,
      );
    }
  }
}
