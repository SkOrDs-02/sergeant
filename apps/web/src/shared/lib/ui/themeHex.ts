/**
 * Hex для inline-стилів (SVG, body-highlighter), збігаються з
 * tailwind.config.js theme.extend.colors.* (success, danger, warning).
 *
 * Джерело істини — `@sergeant/design-tokens/tokens` (`statusHex`
 * дзеркало `statusColors`, які також заведено в Tailwind preset).
 * Тут лише ре-експорт + звужений web-only зріз (success / danger /
 * warning) для сумісності з існуючими імпортерами.
 */
import { statusHex } from "@sergeant/design-tokens/tokens";

export const THEME_HEX = {
  success: statusHex.success,
  danger: statusHex.danger,
  warning: statusHex.warning,
} as const;
