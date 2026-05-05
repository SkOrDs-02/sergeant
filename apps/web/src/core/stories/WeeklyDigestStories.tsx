/*
 * WeeklyDigestStories is an Instagram-style full-screen narrative overlay,
 * not a regular page. The uppercase+tracking+text eyebrow treatment is
 * repeated across every card variant (recap of Finyk / Fizruk / Nutrition
 * / Routine stats) at bespoke text sizes (`text-sm`, `text-2xs`,
 * `tracking-[0.3em]`) that don't map cleanly onto <SectionHeading>'s
 * canonical xs/sm tokens. Disabling the design-system rule file-wide
 * keeps the narrative typography intact without scattering 11 local
 * exemptions. Revisit when a dedicated <StoryEyebrow> variant lands.
 */
import { useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { buildSlides } from "./buildSlides";
import { SLIDE_MS } from "./constants";
import { renderSlide } from "./components/slides";
import { StoriesProgressHeader } from "./components/StoriesProgressHeader";
import { StoryNavHints } from "./components/StoryNavHints";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import { useStoriesAutoplay } from "./hooks/useStoriesAutoplay";
import { useStoriesKeyboard } from "./hooks/useStoriesKeyboard";
import { useStoriesNavigation } from "./hooks/useStoriesNavigation";
import { useStoriesPause } from "./hooks/useStoriesPause";
import { useStoryGestures } from "./hooks/useStoryGestures";

interface Props {
  digest: Record<string, unknown> | null;
  weekKey: string;
  weekRange?: string;
  onClose?: () => void;
}

export function WeeklyDigestStories({
  digest,
  weekKey,
  weekRange,
  onClose,
}: Props) {
  const slides = useMemo(
    () => buildSlides(digest, weekKey, weekRange),
    [digest, weekKey, weekRange],
  );

  const handleClose = useCallback(() => onClose?.(), [onClose]);

  const nav = useStoriesNavigation({
    total: slides.length,
    onExhausted: handleClose,
  });

  const pause = useStoriesPause();

  const progress = useStoriesAutoplay({
    key: nav.index,
    durationMs: SLIDE_MS,
    paused: pause.isPaused,
    onAdvance: nav.next,
  });

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const gestures = useStoryGestures({
    targetRef: surfaceRef,
    onTap: (zone) => (zone === "prev" ? nav.prev() : nav.next()),
    onHoldStart: () => pause.setHold(true),
    onHoldEnd: () => pause.setHold(false),
    onDragStart: () => pause.setDragging(true),
    onDragEnd: () => pause.setDragging(false),
    onSwipeDown: handleClose,
  });

  useStoriesKeyboard({
    onNext: nav.next,
    onPrev: nav.prev,
    onClose: handleClose,
    onToggleExplicitPause: pause.toggleExplicit,
  });

  useBodyScrollLock();

  if (!slides.length) return null;
  if (typeof document === "undefined") return null;

  const slide = slides[nav.index];

  // Portal to <body> so the modal escapes every ancestor stacking context.
  // Without this, the `page-enter` animation on the hub root (which keeps
  // `transform: translateY(0)` via `animation-fill-mode: both`) and the
  // `overflow-hidden` + shadow wrapper on `WeeklyDigestCard` both promote
  // themselves to independent stacking contexts — and the primary FAB
  // (story chrome, z-40) ends up painted above this overlay
  // (z-[600]) because the 600 is scoped to a context whose parent
  // z-index is lower than the FAB's. Rendering into `document.body`
  // short-circuits all of that and makes z-index globally meaningful again.
  const overlay = (
    <div
      className="fixed inset-0 z-600 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Щотижневий дайджест — сторіс"
    >
      <div className="absolute inset-0 bg-black/90" />
      <div
        ref={surfaceRef}
        className="absolute inset-0 transition-[transform,opacity] duration-150 ease-out touch-none"
        {...gestures}
      >
        {renderSlide(slide!)}
        <StoriesProgressHeader
          slides={slides}
          currentIndex={nav.index}
          progress={progress}
          paused={pause.isPaused}
          activeLabel={slide!.label!}
          weekRange={weekRange}
          onClose={handleClose}
        />
        <StoryNavHints />
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
