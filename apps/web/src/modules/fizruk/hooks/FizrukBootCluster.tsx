/**
 * Status: Active
 *
 * Side-effect-only boot cluster for the Fizruk
 * module, extracted out of `core/app/RootLayout.tsx` so it can be reached
 * through `React.lazy()`.
 */
import { useFizrukDualWriteBoot } from "./useFizrukDualWriteBoot";
import { useFizrukSqliteReadBoot } from "./useFizrukSqliteReadBoot";
import { useFizrukQuickStatsBoot } from "./useFizrukQuickStatsBoot";

export default function FizrukBootCluster(): null {
  useFizrukDualWriteBoot();
  useFizrukSqliteReadBoot();
  // Знімок quick-stats для бенто-картки хаба. Без нього картка лишалася на
  // empty-state-обіцянці до першого відкриття модуля — рівно як було у
  // Фініка до `useFinykQuickStatsBoot` (browser QA 2026-08-05, F-007).
  useFizrukQuickStatsBoot();
  return null;
}
