import { Icon } from "@shared/components/ui";
import { useDarkMode } from "@shared/hooks/useDarkMode";
import { NAV_SECTIONS } from "./designShowcase/_shared";
import { ColorsSection } from "./designShowcase/sections/Colors";
import { TypographySection } from "./designShowcase/sections/Typography";
import { ButtonsSection } from "./designShowcase/sections/Buttons";
import { BadgesSection } from "./designShowcase/sections/Badges";
import { CardsSection } from "./designShowcase/sections/Cards";
import { ElevationSection } from "./designShowcase/sections/Elevation";
import { FormsSection } from "./designShowcase/sections/Forms";
import { DataDisplaySection } from "./designShowcase/sections/DataDisplay";
import { NavigationSection } from "./designShowcase/sections/Navigation";
import { OverlaysSection } from "./designShowcase/sections/Overlays";
import { PrimitivesSection } from "./designShowcase/sections/Primitives";
import { MenusSection } from "./designShowcase/sections/Menus";
import { FeedbackSection } from "./designShowcase/sections/Feedback";
import { CelebrationSection } from "./designShowcase/sections/Celebration";
import { OnboardingSection } from "./designShowcase/sections/Onboarding";
import { MotionSection } from "./designShowcase/sections/Motion";
import { EmptyStatesSection } from "./designShowcase/sections/EmptyStates";

export function DesignShowcase() {
  const { dark, toggle: toggleDark } = useDarkMode();

  return (
    <div className="min-h-dvh bg-bg">
      {/* ── Sticky nav ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-100 bg-panel/90 backdrop-blur-md border-b border-line">
        <div className="max-w-3xl mx-auto px-5 h-12 flex items-center gap-4">
          <h1 className="font-extrabold text-text text-sm shrink-0">
            Design System
          </h1>
          <nav
            aria-label="Розділи дизайн-системи"
            className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0 scrollbar-hide"
          >
            {NAV_SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="shrink-0 px-2.5 py-1 rounded-xl text-xs font-semibold text-muted hover:text-text hover:bg-panelHi transition-colors"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <button
            type="button"
            onClick={toggleDark}
            aria-label={dark ? "Світла тема" : "Темна тема"}
            className="shrink-0 p-2 rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors"
          >
            <Icon name={dark ? "sun" : "moon"} size={16} />
          </button>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-5 py-10 space-y-20 pb-24">
        <ColorsSection />
        <TypographySection />
        <ButtonsSection />
        <BadgesSection />
        <CardsSection />
        <ElevationSection />
        <FormsSection />
        <DataDisplaySection />
        <NavigationSection />
        <OverlaysSection />
        <PrimitivesSection />
        <MenusSection />
        <FeedbackSection />
        <CelebrationSection />
        <OnboardingSection />
        <MotionSection />
        <EmptyStatesSection />
      </main>
    </div>
  );
}
