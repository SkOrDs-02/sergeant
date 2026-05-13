import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { SkeletonText } from "@shared/components/ui/Skeleton";
import {
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
} from "@shared/lib/storage/storage";

interface AssistantAdviceCardProps {
  insight: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const COLLAPSED_KEY = "hub_assistant_advice_collapsed";

function readCollapsed(): boolean {
  return safeReadStringLS(COLLAPSED_KEY) === "1";
}

function writeCollapsed(v: boolean): void {
  if (v) safeWriteLS(COLLAPSED_KEY, "1");
  else safeRemoveLS(COLLAPSED_KEY);
}

export function AssistantAdviceCard({
  insight,
  loading,
  error,
  onRefresh,
}: AssistantAdviceCardProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    setCollapsed((prev) => {
      writeCollapsed(!prev);
      return !prev;
    });
  };

  // Hide the card entirely when there's an error and no cached insight
  if (error && !insight && !loading) return null;

  const hasContent = !!(insight || loading);
  if (!hasContent) return null;

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden",
        "transition-all duration-200",
        "p-px bg-linear-to-br from-brand-300/40 via-line to-teal-300/40",
      )}
    >
      <div className="rounded-[15px] bg-panel overflow-hidden">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center justify-between w-full px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full bg-brand-soft flex items-center justify-center text-xs"
              aria-hidden
            >
              S
            </span>
            <SectionHeading as="span" size="xs" variant="muted">
              Порада асистента
            </SectionHeading>
          </div>
          <Icon
            name={collapsed ? "chevron-down" : "chevron-up"}
            size={14}
            className="text-muted"
          />
        </button>

        {!collapsed && (
          <div className="px-4 pb-3.5 -mt-0.5">
            {loading && !insight ? (
              // Skeleton stand-in matches three lines of body copy at
              // the real text size — keeps the card height stable so
              // the swap to real content does not nudge the dashboard
              // grid below (CLS budget). Pulse here is the only
              // AMBIENT animation on screen during initial load; the
              // refresh-button spin is hidden until an insight is
              // cached so we stay within Hard Rule #17 (≤1 AMBIENT).
              <div
                role="status"
                aria-live="polite"
                aria-label="Готую пораду асистента"
                className="space-y-2 py-0.5"
              >
                <span className="sr-only">Готую пораду…</span>
                <SkeletonText className="h-3.5 w-full" />
                <SkeletonText className="h-3.5 w-11/12" />
                <SkeletonText className="h-3.5 w-4/5" />
              </div>
            ) : null}

            {insight && (
              <p
                key={insight}
                className="text-sm text-text leading-relaxed motion-safe:animate-fade-in motion-safe:duration-200"
              >
                {insight}
              </p>
            )}

            {!(loading && !insight) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                }}
                disabled={loading}
                aria-label="Оновити пораду"
                className={cn(
                  "mt-2 p-1 rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors",
                  loading &&
                    "opacity-40 cursor-not-allowed motion-safe:animate-spin",
                )}
              >
                <Icon name="refresh-cw" size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
