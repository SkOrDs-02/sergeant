// Duration per story slide in ms. Slightly longer than Instagram's ~5s because
// we're showing denser numeric content, not photos.
export const SLIDE_MS = 6500;

// Minimum vertical drag (px) required to trigger close-on-swipe-down.
export const SWIPE_CLOSE_THRESHOLD = 80;

// Press-and-hold threshold (ms): shorter than this counts as a tap, longer
// than this promotes the gesture to a pause.
export const HOLD_THRESHOLD_MS = 180;

// Max visual translate when dragging down; past this we plateau so the
// overlay never detaches from the finger.
export const MAX_DRAG_TRANSLATE = 260;

// Re-keyed 2026-08 design-audit: `brand-*` used to alias teal but now
// resolves to the neutral stone ramp (hub-chrome, 2026-07 design-audit M1),
// so `from-brand-500 …` silently rendered a gray slide. `indigo-*` / `rose-*`
// were one-off foreign hues with no other call-site in the app. Every slide
// now stays within its module's registered saturated family (finyk teal ·
// fizruk cyan · routine rose · nutrition lime; intro mixes teal with the
// neutral `brand-strong` stone), on the -600..-800 tier so fixed
// `text-white` clears 4.5:1 — the -400 tiers used previously were too light
// under white text.
export const BG_GRADIENTS = {
  intro:
    "from-teal-600 via-brand-700 to-brand-800 dark:from-teal-800 dark:via-brand-800 dark:to-brand-900",
  finyk:
    "from-teal-600 via-teal-700 to-teal-800 dark:from-teal-700 dark:via-teal-800 dark:to-teal-900",
  fizruk:
    "from-cyan-600 via-cyan-700 to-cyan-800 dark:from-cyan-700 dark:via-cyan-800 dark:to-cyan-900",
  nutrition:
    "from-lime-600 via-lime-700 to-lime-800 dark:from-lime-700 dark:via-lime-800 dark:to-lime-900",
  routine:
    "from-rose-600 via-rose-700 to-rose-800 dark:from-rose-700 dark:via-rose-800 dark:to-rose-900",
  overall:
    "from-amber-600 via-orange-600 to-rose-700 dark:from-amber-800 dark:via-orange-800 dark:to-rose-800",
} as const;
