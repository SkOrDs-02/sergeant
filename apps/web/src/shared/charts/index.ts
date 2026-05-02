/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Migrate Finyk/Fizruk chart components from `@shared/charts/*` deep
 *           paths to `@shared/charts`. See AGENTS.md → Hard Rule #10.
 *
 * Shared chart theme tokens — declared API surface.
 *
 * Prefer importing from `@shared/charts` instead of deep paths so renames
 * stay cheap and IDE autocomplete surfaces the full API:
 *
 *   import { chartSeries, chartAxis, THEME_HEX } from "@shared/charts";
 */

export {
  brandColors,
  chartAxis,
  chartGradients,
  chartGrid,
  chartHeatmap,
  chartPalette,
  chartPaletteList,
  chartSeries,
  chartTick,
  moduleColors,
  statusColors,
} from "./chartTheme";
