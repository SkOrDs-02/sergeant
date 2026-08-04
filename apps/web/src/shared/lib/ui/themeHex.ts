/**
 * Hex для inline-стилів SVG (теплова мапа BodyAtlas тощо), збігаються з
 * tailwind.config.js theme.extend.colors.* (success, danger, warning).
 *
 * Джерело істини — `@sergeant/design-tokens/tokens` (`statusHex`
 * дзеркало `statusColors`, які також заведено в Tailwind preset).
 * Тут лише ре-експорт + звужений web-only зріз (success / danger /
 * warning) для сумісності з існуючими імпортерами.
 *
 * AI-CONTEXT: ці значення — СТАТИЧНИЙ hex, тем-сліпий (не реагує на
 * `.dark`/`html.hc`). Легітимно лише там, де CSS custom property
 * фізично неможливий (canvas 2D context, native status-bar тощо). Для
 * SVG `fill`/`stroke`/`stopColor` — де рядок можна підставити напряму —
 * НЕ використовуй `THEME_HEX` (BodyAtlas.tsx мігрував heat-ramp з нього
 * на `--c-chart-{success,warning,danger}` через `color-mix()`,
 * design-audit TH1/TH7); бери var-backed `chartStatusSeries` з
 * `@shared/charts` (`chartTheme.ts`).
 */
import { statusHex } from "@sergeant/design-tokens/tokens";

export const THEME_HEX = {
  success: statusHex.success,
  danger: statusHex.danger,
  warning: statusHex.warning,
} as const;
