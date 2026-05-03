import type { ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";
import type { Slide } from "../../types";

interface Props {
  slide: Slide;
  children: ReactNode;
}

/**
 * Full-screen narrative card shell shared by every slide.
 *
 * Top padding has to clear the progress bars + header row + the iOS safe
 * area (~47px on notch devices). Bottom padding clears the home-indicator.
 * Without `env(safe-area-inset-*)` the first card's label rendered behind
 * the chrome on iPhone, leaving only the big number visible.
 */
export function StoryShell({ slide, children }: Props) {
  return (
    <div
      className={cn("absolute inset-0 bg-gradient-to-br text-white", slide.bg)}
    >
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.25),transparent_60%)]" />
      <div
        className="relative h-full w-full flex flex-col px-6 overflow-y-auto"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 5.5rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2.5rem)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
