import type { IconName } from "@shared/components/ui/Icon";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";

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
  type?: string;
  creditLimit?: number;
}

export interface AccountVisual {
  iconName: IconName;
  /** Tailwind classes for the chip surface + icon colour. Uses design tokens only. */
  tone: string;
  /** Label without the leading emoji (e.g. "Біла картка" instead of "⬜ Біла картка"). */
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

const LABEL_BY_TYPE: Record<string, string> = {
  eAid: "Єпідтримка",
  black: "Чорна картка",
  white: "Біла картка",
  platinum: "Платинова",
  iron: "Залізна",
  fop: "ФОП",
};

export function getAccountVisual(acc: AccountLike): AccountVisual {
  const isCredit = (acc.creditLimit ?? 0) > 0;

  if (acc.type === "eAid") {
    return { iconName: "hand-coins", tone: TONE_EAID, name: "Єпідтримка" };
  }
  if (isCredit && acc.type === "black") {
    return {
      iconName: "credit-card",
      tone: TONE_CREDIT,
      name: "Кредитна картка",
    };
  }
  if (isCredit) {
    return { iconName: "credit-card", tone: TONE_CREDIT, name: "Кредит" };
  }
  if (acc.type === "black") {
    return {
      iconName: "credit-card",
      tone: TONE_BLACK,
      name: LABEL_BY_TYPE.black,
    };
  }
  if (acc.type === "white") {
    return {
      iconName: "credit-card",
      tone: TONE_WHITE,
      name: LABEL_BY_TYPE.white,
    };
  }
  if (acc.type === "platinum") {
    return {
      iconName: "credit-card",
      tone: TONE_PLATINUM,
      name: LABEL_BY_TYPE.platinum,
    };
  }
  if (acc.type === "iron") {
    return {
      iconName: "credit-card",
      tone: TONE_IRON,
      name: LABEL_BY_TYPE.iron,
    };
  }
  if (acc.type === "fop") {
    return { iconName: "archive", tone: TONE_FOP, name: LABEL_BY_TYPE.fop };
  }
  return { iconName: "credit-card", tone: TONE_NEUTRAL, name: "Картка" };
}

/**
 * `MonoAccount` is the canonical type used by callers; re-export the narrow
 * surface we actually touch so the helper can be called with a bare `type` +
 * `creditLimit` pair in tests without requiring the full shape.
 */
export type AccountVisualInput = Pick<MonoAccount, "type" | "creditLimit">;
