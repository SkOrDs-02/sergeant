/**
 * Sergeant Design System — `InsightCard` (PR-7a).
 *
 * @lifecycle experimental (introduced 2026-05; promoted to active after PR-8)
 * @see docs/design/redesign-v2/governance.md § AI surfaces
 *
 * AI push card — конкретна пропозиція коли AI знайшов щось важливе.
 * Show-once-per-day, dismissible. Поступово рендериться через
 * `useInsightDismissal()` hook що зберігає dismissals у localStorage
 * (`sergeant.v2.insights.dismissed`).
 *
 * Структура:
 *   [✨ amber icon] [Title \n Subtitle (button → activate)] [→ (button → dismiss)]
 *
 * ## A11y refactor vs. handoff JSX
 *
 * Handoff JSX був nested-button: зовнішній `<div>` wrapping і activate
 * button + dismiss button — це OK, але це не group. Sergeant wraps в
 * `<div role="group" aria-labelledby="…">` так що screen readers
 * announce'ять обидві дії як пов'язані.
 *
 * ## Token discipline (Hard Rule #11 — no raw palette in className)
 *
 * Handoff пропонував `bg-em-900/95` (raw em-palette + opacity modifier).
 * У Sergeant це violation #11. Замість того використовуємо `bg-ink-strong`
 * — semantic token що мапиться на emerald-900 в light / white в dark /
 * pure #000 в HC (via PR-1). Контрастний text-bg-base inverts через
 * theme. Amber icon уживає `bg-celebration-soft` token (PR-1).
 *
 * ## Module context
 *
 * `module` prop керує decorative module tint (через accent border) — але
 * primary visual identity лишається AI/celebration (amber + ink-strong),
 * не module accent. Це навмисно: insight reads as "from Sergeant", not
 * "from Finyk/Fizruk/...".
 */

import { useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { useInsightDismissal } from "@shared/lib/insights/useInsightDismissal";
import type { InsightId } from "@shared/lib/insights/types";

export interface InsightCardProps {
  /** Stable id for dismissal tracking (e.g. "finyk-coffee-limit-2026-05"). */
  id: InsightId;
  /** Bold signal headline ("Витрати на каву ↑ 34%"). */
  title: string;
  /** Subtitle / recommended action ("Встановити ліміт?"). */
  subtitle: string;
  /** CTA glyph — defaults to → arrow. */
  ctaLabel?: string;
  /** Called when user taps the activate area. Navigate / open chat etc. */
  onActivate: () => void;
  /** Called after dismissal is persisted (analytics hook). */
  onDismiss?: () => void;
  className?: string;
}

export function InsightCard({
  id,
  title,
  subtitle,
  ctaLabel = "→",
  onActivate,
  onDismiss,
  className,
}: InsightCardProps) {
  const { isDismissed, dismiss } = useInsightDismissal();
  // Local optimistic flag so the card disappears immediately on dismiss
  // even before the hook's localStorage write completes.
  const [hidden, setHidden] = useState(false);

  if (hidden || isDismissed(id)) return null;

  const handleDismiss = () => {
    hapticTap();
    dismiss(id);
    setHidden(true);
    onDismiss?.();
  };

  const handleActivate = () => {
    hapticTap();
    onActivate();
  };

  const titleId = `insight-card-title-${id}`;

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className={cn(
        // v2 push-card chrome — ink-strong solid in light, glass-tinted
        // in dark (mirrors handoff `bg-em-900/95` intent without raw
        // palette). Shadow uses elevation `shadow-e3` (overlay tier).
        "mx-3.5 mt-2 px-3 py-2.5 rounded-r-2xl",
        "bg-ink-strong text-bg-base",
        "flex items-center gap-3 shadow-e3",
        className,
      )}
    >
      {/* Amber sparkle — celebration-tier visual signal so the card
          reads as "AI noticed something" without competing з module accent. */}
      <span
        aria-hidden
        className={cn(
          "w-8 h-8 rounded-xl shrink-0",
          "flex items-center justify-center",
          "bg-celebration/20 text-celebration",
        )}
      >
        <Icon name="sparkle" size={16} strokeWidth={2} />
      </span>

      {/* Activate button — title + subtitle. Takes the remaining width. */}
      <button
        type="button"
        onClick={handleActivate}
        className={cn(
          "flex-1 text-left min-w-0",
          "focus:outline-none focus-visible:rounded-xl",
          "focus-visible:ring-2 focus-visible:ring-celebration/45",
          "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        )}
      >
        <div
          id={titleId}
          className="text-style-label font-extrabold truncate text-bg-base"
        >
          {title}
        </div>
        <div className="text-style-caption opacity-70 truncate text-bg-base">
          {subtitle}
        </div>
      </button>

      {/* Dismiss button — separate sibling so Tab order is activate → dismiss. */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Закрити пропозицію"
        className={cn(
          "text-style-title text-celebration shrink-0 px-2 -my-1",
          "hover:opacity-80 transition-opacity",
          "focus:outline-none focus-visible:rounded-xl",
          "focus-visible:ring-2 focus-visible:ring-celebration/45",
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
