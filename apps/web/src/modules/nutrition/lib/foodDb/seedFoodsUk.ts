/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { SeedFood } from "./seeds/types";

export type { SeedFood };

import { MEAT_AND_POULTRY } from "./seeds/meatAndPoultry";
import { FISH_AND_SEAFOOD } from "./seeds/fishAndSeafood";
import { EGGS } from "./seeds/eggs";
import { DAIRY } from "./seeds/dairy";
import { GRAINS } from "./seeds/grains";
import { BAKERY } from "./seeds/bakery";
import { LEGUMES } from "./seeds/legumes";
import { VEGETABLES } from "./seeds/vegetables";
import { FRUITS } from "./seeds/fruits";
import { NUTS_AND_SEEDS } from "./seeds/nutsAndSeeds";
import { OILS_AND_FATS } from "./seeds/oilsAndFats";
import { SAUCES_AND_SPICES } from "./seeds/saucesAndSpices";
import { SWEETS } from "./seeds/sweets";
import { BEVERAGES } from "./seeds/beverages";
import { SPORTS_NUTRITION } from "./seeds/sportsNutrition";
import { READY_MEALS } from "./seeds/readyMeals";
import { UKRAINIAN_CUISINE } from "./seeds/ukrainianCuisine";
import { SALADS } from "./seeds/salads";
import { FROZEN_SNACKS } from "./seeds/frozenSnacks";

export const SEED_FOODS_UK: SeedFood[] = [
  ...MEAT_AND_POULTRY,
  ...FISH_AND_SEAFOOD,
  ...EGGS,
  ...DAIRY,
  ...GRAINS,
  ...BAKERY,
  ...LEGUMES,
  ...VEGETABLES,
  ...FRUITS,
  ...NUTS_AND_SEEDS,
  ...OILS_AND_FATS,
  ...SAUCES_AND_SPICES,
  ...SWEETS,
  ...BEVERAGES,
  ...SPORTS_NUTRITION,
  ...READY_MEALS,
  ...UKRAINIAN_CUISINE,
  ...SALADS,
  ...FROZEN_SNACKS,
];
