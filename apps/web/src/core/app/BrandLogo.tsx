/**
 * Brand logo mark — Sergeant "Operative" mark + wordmark.
 *
 * The mark combines three upward-pointing chevrons (sergeant rank insignia)
 * with a small status dot above the top chevron — evoking both military rank
 * and an "active/operational" status indicator. Minimalist, memorable, and
 * instantly associative with the "Sergeant · Operational Center" identity.
 *
 * Variants:
 *   - "badge" (default): Mark inside an emerald rounded badge + wordmark.
 *     Used in AuthPage, ResetPasswordPage, OnboardingWizard.
 *   - "inline":          Mark inline with text (no badge).
 *     Used in OnboardingWizard inside a sentence.
 *   - "mark":            Raw mark only — no badge, no wordmark.
 *     Used in HubHeader for the V2E operational-center layout.
 *
 * Sizes:
 *   - "lg": hub header — bigger mark + 22px wordmark.
 *   - "md": auth/onboarding — smaller mark + 18px wordmark.
 */

interface OperativeMarkProps {
  size: number;
}

/**
 * The "Operative" mark — three sergeant chevrons + status dot.
 *
 * The dot above the chevrons communicates "active / operational" and
 * differentiates the mark from a generic military insignia. Together
 * the shapes create a strong, unique silhouette that works at any size.
 */
function OperativeMark({ size }: OperativeMarkProps) {
  return (
    <svg
      viewBox="0 0 24 26"
      width={size}
      height={size * (26 / 24)}
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Status dot — "operational / active" */}
      <circle cx="12" cy="3" r="2.2" fill="currentColor" />
      {/* Three sergeant chevrons */}
      <path
        d="M4 13 L12 8 L20 13"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 18 L12 13 L20 18"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 23 L12 18 L20 23"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type TagName = "span" | "h1" | "h2" | "h3" | "div";

interface BrandLogoProps {
  /** Extra Tailwind classes for the outer wrapper. */
  className?: string;
  /** Size variant. "lg" is the hub header, "md" is auth/onboarding. */
  size?: "lg" | "md";
  /** HTML element for the outer wrapper (default "span"). Use "h1" on pages that need a heading landmark. */
  as?: TagName;
  /**
   * "badge" (default) renders the mark inside an emerald rounded square
   * next to the wordmark. "inline" renders a flat mark icon next to the
   * wordmark — used when the logo appears mid-sentence. "mark" renders
   * only the raw mark without wordmark — for the hub header.
   */
  variant?: "badge" | "inline" | "mark";
}

export function BrandLogo({
  className,
  size = "lg",
  as: Tag = "span",
  variant = "badge",
}: BrandLogoProps) {
  const wordmarkCls =
    size === "lg"
      ? "text-xl leading-none font-extrabold tracking-tight"
      : "text-lg leading-none font-extrabold tracking-tight";

  if (variant === "mark") {
    const iconSize = size === "lg" ? 26 : 22;
    return (
      <Tag
        className={`inline-flex items-center select-none text-brand-500 ${className ?? ""}`}
      >
        <OperativeMark size={iconSize} />
      </Tag>
    );
  }

  if (variant === "inline") {
    const iconSize = size === "lg" ? 20 : 18;
    return (
      <Tag
        className={`inline-flex items-center gap-1.5 select-none text-brand-500 ${className ?? ""}`}
      >
        <OperativeMark size={iconSize} />
        <span className={`${wordmarkCls} text-text`}>Sergeant</span>
      </Tag>
    );
  }

  const badgePx = size === "lg" ? 32 : 28;
  const chevronPx = size === "lg" ? 18 : 16;
  const radiusPx = size === "lg" ? 10 : 9;
  const gapCls = size === "lg" ? "gap-2.5" : "gap-2";

  return (
    <Tag
      className={`inline-flex items-center select-none ${gapCls} ${className ?? ""}`}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center bg-brand-strong text-white shadow-[0_1px_2px_rgba(16,185,129,0.25),0_4px_12px_-2px_rgba(16,185,129,0.35)]"
        style={{
          width: badgePx,
          height: badgePx,
          borderRadius: radiusPx,
        }}
      >
        <OperativeMark size={chevronPx} />
      </span>
      <span className={`${wordmarkCls} text-text`}>Sergeant</span>
    </Tag>
  );
}
