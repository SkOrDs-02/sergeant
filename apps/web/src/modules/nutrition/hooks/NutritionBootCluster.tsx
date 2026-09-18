/**
 * Status: Active
 *
 * Side-effect-only boot cluster for the Nutrition
 * module, extracted out of `core/app/RootLayout.tsx` so it can be reached
 * through `React.lazy()`.
 *
 * The three hooks below transitively reach `core/db/sqlite.ts` and
 * `@sergeant/db-schema/sqlite`, which statically import `drizzle-orm`.
 * While `RootLayout` imported them eagerly, Vite's `vendor-sqlite` manual
 * chunk (all of `drizzle-orm`, ~69 kB brotli) sat on the critical path.
 */
import { useNutritionDualWriteBoot } from "./useNutritionDualWriteBoot";
import { useNutritionSqliteReadBoot } from "./useNutritionSqliteReadBoot";
import { useNutritionQuickStatsBoot } from "./useNutritionQuickStatsBoot";

export default function NutritionBootCluster(): null {
  useNutritionDualWriteBoot();
  useNutritionSqliteReadBoot();
  useNutritionQuickStatsBoot();
  return null;
}
