import { useEffect } from "react";
import { cn } from "@shared/lib/ui/cn";
import {
  ShowcaseSettingsProvider,
  useShowcaseSettings,
} from "./_shared/context";
import { ShowcaseSidebar } from "./_shared/Sidebar";
import { ShowcaseToggles } from "./_shared/Toggles";
import { ColorsSection } from "./sections/Colors";
import { TypographySection } from "./sections/Typography";
import { SpacingSection } from "./sections/Spacing";
import { ElevationSection } from "./sections/Elevation";
import { MotionSection } from "./sections/Motion";
import { FormsSection } from "./sections/Forms";
import { FeedbackSection } from "./sections/Feedback";
import { OverlaysSection } from "./sections/Overlays";
import { ThemingSection } from "./sections/Theming";
import { A11ySection } from "./sections/A11y";
import { ModuleAccentsSection } from "./sections/ModuleAccents";
import { MenusSection } from "./sections/Menus";
import { PrimitivesSection } from "./sections/Primitives";
import { EmptyStatesSection } from "./sections/EmptyStates";

/**
 * DesignShowcase 2.0 — navigable internal styleguide.
 *
 *  - Left rail sidebar with maturity badges per section (sticky).
 *  - Top bar with theme / density / direction / reduced-motion toggles.
 *  - One file per primitive group; every section includes a live example,
 *    a copy-pasteable `<CodeBlock>` snippet, a Do/Don't pair table and
 *    the relevant Hard Rule + ESLint rule badges.
 *
 * Hard Rule alignment: #11 (no hex), #13 (no raw dark palette), #14
 * (focus-visible), #15 (Ukrainian docs), #16 (typography scale), #17
 * (motion budget), #18 (module-size).
 */
export function DesignShowcase() {
  return (
    <ShowcaseSettingsProvider>
      <ShowcaseShell />
    </ShowcaseSettingsProvider>
  );
}

// Forced-reduced-motion overlay style. Kept inline so the showcase
// stays self-contained and we do not have to leak a new global utility
// just for an internal styleguide toggle.
const FORCED_REDUCED_MOTION_CSS = `
[data-showcase-reduced-motion="true"] *,
[data-showcase-reduced-motion="true"] *::before,
[data-showcase-reduced-motion="true"] *::after {
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001ms !important;
}
`;

function ShowcaseShell() {
  const { density, direction, reducedMotion } = useShowcaseSettings();

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;
    const id = window.location.hash.slice(1);
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ behavior: "instant", block: "start" });
  }, []);

  return (
    <div
      dir={direction}
      data-showcase-density={density}
      data-showcase-reduced-motion={
        reducedMotion === "force" ? "true" : "false"
      }
      className={cn(
        "min-h-dvh bg-bg text-text",
        // Density modifier: compact tightens vertical rhythm without
        // changing the underlying spacing scale shown in the Spacing
        // section. Hard Rule #16 is unaffected — only paddings shrink.
        "data-[showcase-density=compact]:[&_section]:space-y-6",
      )}
    >
      <style>{FORCED_REDUCED_MOTION_CSS}</style>
      <header
        className={cn(
          "sticky top-0 z-100",
          "bg-panel/90 backdrop-blur-md border-b border-line",
        )}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center gap-3 flex-wrap">
          <h1 className="font-extrabold text-text text-sm shrink-0">
            Design System 2.0
          </h1>
          <span className="text-2xs text-subtle font-mono shrink-0 hidden sm:inline">
            internal styleguide · navigable · token-only
          </span>
          <div className="ml-auto">
            <ShowcaseToggles />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex gap-8">
        <ShowcaseSidebar />
        <main className="flex-1 min-w-0 space-y-16 pb-24">
          <ColorsSection />
          <TypographySection />
          <SpacingSection />
          <ElevationSection />
          <MotionSection />
          <FormsSection />
          <FeedbackSection />
          <OverlaysSection />
          <ThemingSection />
          <A11ySection />
          <ModuleAccentsSection />
          <MenusSection />
          <PrimitivesSection />
          <EmptyStatesSection />
        </main>
      </div>
    </div>
  );
}

export default DesignShowcase;
