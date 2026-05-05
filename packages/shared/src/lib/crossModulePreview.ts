/**
 * Cross-module preview — copy + persistence for the one-shot post-first-entry
 * promo card (S6.4 in `docs/launch/ftux-sprint-plan.md`).
 *
 * The preview surfaces inline on the dashboard exactly once after the user
 * crosses the first-real-entry threshold. Its job is to demonstrate
 * Sergeant's cross-module USP — i.e. why pairing two modules produces a
 * different signal than running each in isolation. We keep the example
 * static (no AI inference) so the card can ship without depending on the
 * insights pipeline.
 *
 * Copy is keyed by the *source* module — the one that produced the first
 * real entry. We pick a partner module with the strongest narrative
 * adjacency (gross × food, training × calories, habit × money, food ×
 * training) and frame the value as "what Sergeant *will* show you when you
 * add the second category".
 */

import type { DashboardModuleId } from "./dashboard";
import type { KVStore } from "../storage/kv";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const CROSS_MODULE_PREVIEW_SEEN_KEY = "hub_cross_module_preview_seen_v1";

/**
 * Whether the cross-module preview has already been shown to (and dismissed
 * by) this user. The card is one-shot per browser profile by design — the
 * audit hypothesis (S6.4) is that the *first* exposure to the cross-module
 * frame is what nudges users toward the second-module entry; repeating it
 * dilutes the signal and adds chrome to the dashboard.
 */
export function hasSeenCrossModulePreview(store: KVStore): boolean {
  return store.getString(CROSS_MODULE_PREVIEW_SEEN_KEY) === "1";
}

/** Mark the preview as seen so it never re-renders. */
export function markCrossModulePreviewSeen(store: KVStore): void {
  store.setString(CROSS_MODULE_PREVIEW_SEEN_KEY, "1");
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export interface CrossModulePreviewCopy {
  /** Module that owned the first real entry. */
  sourceModule: DashboardModuleId;
  /** Module Sergeant suggests pairing with (used by tests + telemetry). */
  partnerModule: DashboardModuleId;
  /** Card heading. */
  title: string;
  /**
   * Body example — phrased as "коли додаси ще одну категорію" so the user
   * understands the card is forward-looking, not a claim about current data.
   */
  body: string;
  /** Primary CTA label. Acknowledgement-style — see audit-guard test. */
  ctaLabel: string;
  /** aria-label for the dismiss-X button. */
  dismissAriaLabel: string;
}

const COPY: Record<DashboardModuleId, CrossModulePreviewCopy> = {
  finyk: {
    sourceModule: "finyk",
    partnerModule: "nutrition",
    title: "Що Sergeant покаже далі",
    body: "Коли додаси ще одну категорію: гроші × їжа = реальна вартість продуктів і доставок.",
    ctaLabel: "Зрозуміло",
    dismissAriaLabel: "Закрити підказку",
  },
  fizruk: {
    sourceModule: "fizruk",
    partnerModule: "nutrition",
    title: "Що Sergeant покаже далі",
    body: "Коли додаси ще одну категорію: тренування × калорії = чи дійсно ти у профіциті чи дефіциті.",
    ctaLabel: "Зрозуміло",
    dismissAriaLabel: "Закрити підказку",
  },
  routine: {
    sourceModule: "routine",
    partnerModule: "finyk",
    title: "Що Sergeant покаже далі",
    body: "Коли додаси ще одну категорію: звичка × фінанси = скільки твій ритуал економить грошей.",
    ctaLabel: "Зрозуміло",
    dismissAriaLabel: "Закрити підказку",
  },
  nutrition: {
    sourceModule: "nutrition",
    partnerModule: "fizruk",
    title: "Що Sergeant покаже далі",
    body: "Коли додаси ще одну категорію: їжа × тренування = чи відновлюєшся правильно після навантажень.",
    ctaLabel: "Зрозуміло",
    dismissAriaLabel: "Закрити підказку",
  },
};

/**
 * Resolve the copy variant for the source module. Returns `null` when the
 * source is unknown / `null` so the caller can short-circuit instead of
 * rendering with default-but-misleading text.
 */
export function getCrossModulePreviewCopy(
  sourceModule: DashboardModuleId | null,
): CrossModulePreviewCopy | null {
  if (sourceModule === null) return null;
  return COPY[sourceModule];
}

/** Exported for tests + telemetry that want to enumerate variants. */
export const CROSS_MODULE_PREVIEW_COPY = COPY;
