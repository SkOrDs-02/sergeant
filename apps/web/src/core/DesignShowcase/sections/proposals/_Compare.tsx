import type { ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Badge, Icon } from "@shared/components/ui";

/**
 * Comparison chrome for the "Proposals — UX" showcase section.
 *
 * Unlike the UI section (single «може бути» prototype per card), every UX
 * proposal is shown as a *before → after* pair so the reviewer can weigh the
 * change against today's behaviour. The left frame («Зараз») mirrors the
 * current app; the right frame («Може бути») is the proposal. Nothing is
 * wired to real domain data — both render pure mock state.
 */

export function ProposalCompareCard({
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
          порівняння
        </Badge>
      </div>
      <div className="p-4 bg-bg">{children}</div>
    </div>
  );
}

/**
 * Two labelled columns with an arrow between them. Stacks vertically on
 * narrow screens (the arrow rotates to point down).
 */
export function ComparePair({
  before,
  after,
}: {
  before: ReactNode;
  after: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row items-stretch gap-4">
      <CompareColumn kind="before">{before}</CompareColumn>
      <div className="flex md:flex-col items-center justify-center text-muted shrink-0">
        <Icon name="chevron-right" size={20} className="hidden md:block" />
        <Icon name="chevron-down" size={20} className="md:hidden" />
      </div>
      <CompareColumn kind="after">{after}</CompareColumn>
    </div>
  );
}

function CompareColumn({
  kind,
  children,
}: {
  kind: "before" | "after";
  children: ReactNode;
}) {
  const isAfter = kind === "after";
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-style-caption font-medium",
          isAfter
            ? "bg-accent/10 text-accent border border-accent/30"
            : "bg-surface-muted text-muted border border-line",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isAfter ? "bg-accent" : "bg-muted",
          )}
        />
        {isAfter ? "Може бути" : "Зараз"}
      </span>
      {children}
    </div>
  );
}

/**
 * Compact static phone frame reused by both columns. Smaller than the UI
 * section's frame so a before/after pair fits side by side on desktop.
 */
export function MiniPhone({
  children,
  dim = false,
  className,
}: {
  children: ReactNode;
  /** Slightly desaturate the "before" frame to recede visually. */
  dim?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("w-full max-w-[260px]", dim && "opacity-90")}>
      <div className="rounded-[1.75rem] border border-line bg-panelHi p-1.5 shadow-card">
        <div
          className={cn(
            "relative rounded-[1.4rem] bg-bg overflow-hidden",
            "min-h-[360px] flex flex-col",
            className,
          )}
        >
          <div className="h-6 shrink-0 flex items-center justify-center">
            <div className="h-1.5 w-12 rounded-full bg-line" />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">{children}</div>
          <div className="h-5 shrink-0 flex items-center justify-center">
            <div className="h-1 w-20 rounded-full bg-line" />
          </div>
        </div>
      </div>
    </div>
  );
}
