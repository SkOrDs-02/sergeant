// Navigation manifest for the DesignShowcase 2.0 styleguide. Order here
// is rendered both in the left rail (Sidebar) and in the main content
// column — keep stable so anchor hashes survive.
//
// Section file naming: `sections/<file>.tsx`. Every section MUST stay
// under 400 lines per Hard Rule #18 (max-lines: 600 for web TS/TSX).
export interface NavSection {
  /** URL hash + DOM id. */
  id: string;
  /** Sidebar label, Ukrainian-first (Hard Rule #15). */
  label: string;
  /** Maturity badge per primitive (стабільний / бета / експериментальний). */
  maturity: "stable" | "beta" | "experimental";
}

export const NAV_SECTIONS: readonly NavSection[] = [
  { id: "colors", label: "Кольори", maturity: "stable" },
  { id: "typography", label: "Типографіка", maturity: "stable" },
  { id: "spacing", label: "Spacing", maturity: "stable" },
  { id: "elevation", label: "Elevation", maturity: "stable" },
  { id: "motion", label: "Motion", maturity: "stable" },
  { id: "forms", label: "Форми", maturity: "stable" },
  { id: "feedback", label: "Фідбек", maturity: "stable" },
  { id: "overlays", label: "Overlays", maturity: "stable" },
  { id: "theming", label: "Theming", maturity: "beta" },
  { id: "a11y", label: "A11y", maturity: "stable" },
  { id: "accents", label: "Module Accents", maturity: "stable" },
  { id: "menus", label: "Menus", maturity: "stable" },
  { id: "primitives", label: "Tooltip & Popover", maturity: "stable" },
  { id: "empty-states", label: "EmptyState", maturity: "stable" },
] as const;
