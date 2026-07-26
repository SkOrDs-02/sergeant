import type { ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Badge } from "@shared/components/ui";

/**
 * Shared chrome for the "Proposals — UI" showcase section. Every demo is a
 * *prototype* (status «може бути»), so we wrap each one in an explicit card
 * with the proposal id, a plain-language intent line and a mobile phone
 * frame. Nothing here is wired to real domain data — these render pure
 * mock state so the reviewer can feel the interaction without side effects.
 */

export function ProposalCard({
  id,
  title,
  intent,
  children,
}: {
  id: string;
  title: string;
  intent: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-start gap-3 flex-wrap">
        <span className="mt-0.5 shrink-0 px-2 py-0.5 rounded-md text-style-code border border-accent/40 bg-accent/10 text-accent">
          {id}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-style-label text-text">{title}</h3>
          <p className="text-style-caption text-muted mt-0.5 max-w-prose">
            {intent}
          </p>
        </div>
        <Badge variant="warning" tone="soft" size="sm">
          може бути
        </Badge>
      </div>
      <div className="p-4 flex justify-center bg-bg">{children}</div>
    </div>
  );
}

/**
 * A compact phone frame (~320px wide, notch + home indicator) so the demos
 * read unmistakably as the mobile / PWA surface the review is about.
 */
export function PhoneFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="w-full max-w-[320px]">
      <div className="rounded-[2rem] border border-line bg-panelHi p-2 shadow-card">
        <div
          className={cn(
            "relative rounded-[1.6rem] bg-bg overflow-hidden",
            "min-h-[420px] flex flex-col",
            className,
          )}
        >
          {/* status bar / notch */}
          <div className="h-8 shrink-0 flex items-center justify-center">
            <div className="h-1.5 w-16 rounded-full bg-line" />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">{children}</div>
          {/* home indicator */}
          <div className="h-6 shrink-0 flex items-center justify-center">
            <div className="h-1 w-24 rounded-full bg-line" />
          </div>
        </div>
      </div>
    </div>
  );
}
