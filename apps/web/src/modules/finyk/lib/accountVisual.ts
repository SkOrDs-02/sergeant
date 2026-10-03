import { getAccountLabel } from "../utils";
import type { IconName } from "@shared/components/ui/Icon";

/**
 * Derive the visual treatment for a Monobank account: an icon glyph, a tone
 * class set for the chip (surface + icon colour), and a clean human label
 * without the leading emoji that `getAccountLabel` prepends.
 *
 * Keeping this on the web side (rather than in `@sergeant/finyk-domain`) is
 * intentional — `tone` is Tailwind-only and would leak design-token coupling
 * into a platform-agnostic package. The domain helper `getAccountLabel` still
 * remains the source of truth for the text label.
 */

interface AccountLike {
  type?: string | undefined;
  creditLimit?: number | undefined;
}

export interface AccountVisual {
  iconName: IconName;
  /** Tailwind classes for the chip surface + icon colour. Uses design tokens only. */
  tone: string;
  /** Підпис рахунку — з `getAccountLabel` домену (єдине джерело тексту). */
  name: string;
}

const TONE_NEUTRAL =
  "bg-surface-muted text-muted dark:bg-surface-muted dark:text-muted";
const TONE_BLACK = "bg-text text-bg dark:bg-text dark:text-bg";
const TONE_WHITE =
  "bg-bg text-text border border-line dark:bg-panel dark:text-text dark:border-line";
const TONE_CREDIT =
  "bg-warning-soft text-warning-strong dark:bg-warning/15 dark:text-warning";
const TONE_PLATINUM =
  "bg-info-soft text-info-strong dark:bg-info/15 dark:text-info";
const TONE_IRON = "bg-panelHi text-muted dark:bg-panelHi dark:text-muted";
const TONE_FOP =
  "bg-finyk/10 text-finyk-strong dark:bg-finyk/15 dark:text-finyk";
const TONE_EAID =
  "bg-info-soft text-info-strong dark:bg-info/15 dark:text-info";

export function getAccountVisual(acc: AccountLike): AccountVisual {
  const name = getAccountLabel(acc);
  const isCredit = (acc.creditLimit ?? 0) > 0;

  if (acc.type === "eAid") {
    return { iconName: "hand-coins", tone: TONE_EAID, name };
  }
  if (isCredit) {
    return { iconName: "credit-card", tone: TONE_CREDIT, name };
  }
  if (acc.type === "fop") {
    return { iconName: "archive", tone: TONE_FOP, name };
  }
  const tone =
    acc.type === "black"
      ? TONE_BLACK
      : acc.type === "white"
        ? TONE_WHITE
        : acc.type === "platinum"
          ? TONE_PLATINUM
          : acc.type === "iron"
            ? TONE_IRON
            : TONE_NEUTRAL;
  return { iconName: "credit-card", tone, name };
}
