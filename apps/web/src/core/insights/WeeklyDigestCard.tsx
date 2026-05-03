import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Skeleton, SkeletonText } from "@shared/components/ui/Skeleton";
import { Tooltip } from "@shared/components/ui/Tooltip";
import {
  useWeeklyDigest,
  useDigestHistory,
  getWeekKey,
} from "./useWeeklyDigest";
import { WeeklyDigestStories } from "./WeeklyDigestStories";

// `hasLiveWeeklyDigest` now lives in `@sergeant/shared` (DOM-free, reused by
// mobile). The web-side adapter in `@shared/lib/weeklyDigestStorage` binds
// the shared helper to `localStorage`. We re-export it from here so that
// existing call-sites (`HubDashboard`, tests) keep their historical import
// path without touching either module.
export { hasLiveWeeklyDigest } from "@shared/lib/storage/weeklyDigestStorage";

// Wave 1b: `bgClass` / `borderClass` consolidated onto the
// `{module}-soft` / `{module}-soft-border` token family (preset-owned
// light/dark pair via `--c-{module}-soft*`). `colorClass` keeps the
// explicit `-600 / dark:-400` pair because the module accent text uses
// the saturated `-500` family (not the `-soft` wash) and does not have
// a theme-adaptive semantic token today.
const MODULE_CONFIG: Record<
  ModuleKey,
  {
    icon: string;
    label: string;
    colorClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  finyk: {
    icon: "💳",
    label: "Фінанси",
    colorClass: "text-brand-strong dark:text-brand",
    bgClass: "bg-finyk-soft",
    borderClass: "border-finyk-soft-border/60",
  },
  fizruk: {
    icon: "🏋️",
    label: "Тренування",
    colorClass: "text-fizruk-strong dark:text-fizruk",
    bgClass: "bg-fizruk-soft",
    borderClass: "border-fizruk-soft-border/60",
  },
  nutrition: {
    icon: "🥗",
    label: "Харчування",
    colorClass: "text-nutrition-strong dark:text-nutrition",
    bgClass: "bg-nutrition-soft",
    borderClass: "border-nutrition-soft-border/60",
  },
  routine: {
    icon: "✅",
    label: "Звички",
    colorClass: "text-routine-strong dark:text-routine",
    bgClass: "bg-routine-soft",
    borderClass: "border-routine-soft-border/60",
  },
};

// `WeeklyDigestReport` (the AI-generated body) lives in
// `@sergeant/shared`; we only need the per-module block shape here. The
// hook returns the report flattened with `{ generatedAt, weekKey,
// weekRange }` (saved digest) plus an `overallRecommendations` array, so
// we describe just the fields the card touches rather than re-importing
// the full report type.
export type ModuleKey = "finyk" | "fizruk" | "nutrition" | "routine";

export interface DigestModuleData {
  summary?: string;
  comment?: string;
  recommendations?: string[];
}

export interface DigestPayload {
  generatedAt?: string;
  finyk?: DigestModuleData | null;
  fizruk?: DigestModuleData | null;
  nutrition?: DigestModuleData | null;
  routine?: DigestModuleData | null;
  overallRecommendations?: string[];
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <Icon
      name="chevron-right"
      size={15}
      strokeWidth={2.5}
      className={cn(
        "transition-transform duration-200 shrink-0 text-muted",
        expanded && "rotate-90",
      )}
    />
  );
}

interface ModuleBlockProps {
  moduleKey: ModuleKey;
  data: DigestModuleData | null | undefined;
}

function ModuleBlock({ moduleKey, data }: ModuleBlockProps) {
  const [open, setOpen] = useState(false);
  const cfg = MODULE_CONFIG[moduleKey];
  if (!cfg || !data) return null;

  return (
    <div className="rounded-xl border border-line bg-bg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-panelHi/50 transition-colors"
      >
        <div
          className={cn(
            "w-6 h-6 rounded-xl flex items-center justify-center text-xs shrink-0",
            cfg.bgClass,
          )}
        >
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <span className="text-xs font-semibold text-text">{cfg.label}</span>
          {data.summary && (
            <p className="text-xs text-muted truncate mt-0.5">{data.summary}</p>
          )}
        </div>
        <ChevronIcon expanded={open} />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 border-t border-line pt-2 space-y-2">
            {data.comment && (
              <p className="text-xs text-muted leading-relaxed">
                {data.comment}
              </p>
            )}
            {Array.isArray(data.recommendations) &&
              data.recommendations.length > 0 && (
                <div className="space-y-1">
                  {data.recommendations.map((rec: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span
                        className={cn(
                          "text-2xs font-bold mt-0.5 shrink-0",
                          cfg.colorClass,
                        )}
                      >
                        →
                      </span>
                      <span className="text-xs text-text leading-snug">
                        {rec}
                      </span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Shape-aware loader: matches the real digest layout — 4 module rows
// (icon + 2 lines of summary text). When the digest lands, only the
// content swaps in; the rough shape is already on screen.
function LoadingSpinner() {
  return (
    <div
      className="px-4 pb-4 space-y-2.5"
      aria-busy="true"
      aria-live="polite"
      aria-label="Генеруємо звіт тижня"
    >
      <span className="sr-only">Генеруємо звіт тижня…</span>
      {Array(4)
        .fill(0)
        .map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 p-3 rounded-2xl border border-line bg-panel",
              i === 0
                ? "opacity-100"
                : i === 1
                  ? "opacity-85"
                  : i === 2
                    ? "opacity-65"
                    : "opacity-45",
            )}
          >
            <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
              <SkeletonText className="w-1/3 h-3" />
              <SkeletonText className="w-2/3 h-2.5" />
            </div>
          </div>
        ))}
    </div>
  );
}

interface DigestContentProps {
  digest: DigestPayload | null | undefined;
  loading: boolean;
  error: string | null | undefined;
  isCurrentWeek: boolean;
  onGenerate: () => void;
  onUpdate: () => void;
  onPlayStories: () => void;
}

function DigestContent({
  digest,
  loading,
  error,
  isCurrentWeek,
  onGenerate,
  onUpdate,
  onPlayStories,
}: DigestContentProps) {
  const [expanded, setExpanded] = useState(false);
  const hasData =
    digest &&
    (digest.finyk || digest.fizruk || digest.nutrition || digest.routine);

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className="px-4 pb-3">
        <p className="text-xs text-danger bg-danger/10 rounded-xl px-3 py-2 mb-2">
          {error}
        </p>
        {isCurrentWeek && (
          <button
            type="button"
            onClick={onGenerate}
            className="w-full h-9 rounded-xl border border-line text-xs font-semibold text-muted hover:text-text hover:bg-panelHi transition-colors"
          >
            Спробувати знову
          </button>
        )}
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="px-4 pb-4">
        {isCurrentWeek ? (
          <>
            <p className="text-xs text-muted mb-3 leading-relaxed">
              AI-звіт підсумовує прогрес по всіх модулях і дає конкретні
              рекомендації на наступний тиждень.
            </p>
            <button
              type="button"
              onClick={onGenerate}
              className="w-full h-10 rounded-xl bg-primary text-bg text-style-label hover:brightness-110 transition-[filter,opacity,transform] active:scale-[0.98]"
            >
              Згенерувати звіт
            </button>
          </>
        ) : (
          <p className="text-xs text-muted text-center py-2">
            Звіт за цей тиждень не збережено
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="px-4 pb-3 pt-1">
        <button
          type="button"
          onClick={onPlayStories}
          className={cn(
            "w-full h-11 rounded-xl text-sm font-bold text-white",
            "bg-linear-to-r from-brand-500 via-brand-400 to-teal-400",
            "dark:from-brand-600 dark:via-brand-500 dark:to-teal-500",
            "shadow-card hover:brightness-110 active:scale-[0.98] transition-[box-shadow,filter,opacity,transform]",
            "flex items-center justify-center gap-2",
            "focus-ring",
          )}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          Переглянути як сторіс
        </button>
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line px-4 pt-3 pb-4 space-y-2">
            {(["finyk", "fizruk", "nutrition", "routine"] as const).map(
              (key) =>
                digest?.[key] ? (
                  <ModuleBlock key={key} moduleKey={key} data={digest[key]} />
                ) : null,
            )}
            {Array.isArray(digest.overallRecommendations) &&
              digest.overallRecommendations.length > 0 && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-1.5">
                  {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift --
                      Recommendation block eyebrow uses `text-primary` (a bespoke
                      accent not exposed through SectionHeading tone tokens) so
                      it stays inline until a `primary` tone is added to DS. */}
                  <p className="text-2xs font-bold text-primary uppercase tracking-wider">
                    Загальні рекомендації
                  </p>
                  {digest.overallRecommendations.map(
                    (rec: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-2xs font-bold text-primary mt-0.5 shrink-0">
                          ★
                        </span>
                        <span className="text-xs text-text leading-snug">
                          {rec}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              )}
            {isCurrentWeek && (
              <button
                type="button"
                onClick={onUpdate}
                className="w-full h-9 rounded-xl border border-line text-xs font-semibold text-muted hover:text-text hover:bg-panelHi transition-colors"
              >
                Оновити звіт
              </button>
            )}
          </div>
        </div>
      </div>

      {!expanded && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full h-9 rounded-xl border border-line text-xs font-semibold text-muted hover:text-text hover:bg-panelHi transition-colors"
          >
            Переглянути звіт
          </button>
        </div>
      )}
      {expanded && (
        <div className="px-4 pb-3 border-t border-line pt-2">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="w-full h-9 rounded-xl border border-line text-xs font-semibold text-muted hover:text-text hover:bg-panelHi transition-colors"
          >
            Згорнути
          </button>
        </div>
      )}
    </>
  );
}

interface WeeklyDigestCardProps {
  /**
   * Optional callback that collapses the card back to its single-line
   * default state (the `WeeklyDigestFooter` rendered by HubDashboard).
   * When provided, a chevron-up button is shown in the header so the
   * user can dismiss the expanded card the same way they opened it.
   */
  onCollapse?: () => void;
}

export function WeeklyDigestCard({ onCollapse }: WeeklyDigestCardProps = {}) {
  const currentWeekKey = getWeekKey();
  const [selectedWeekKey, setSelectedWeekKey] = useState(currentWeekKey);
  const [showHistory, setShowHistory] = useState(false);
  const [storiesOpen, setStoriesOpen] = useState(false);

  const { digest, loading, error, weekRange, generate, isCurrentWeek } =
    useWeeklyDigest(selectedWeekKey);
  const { data: history = [] } = useDigestHistory();

  const handleGenerate = () => generate();

  const isPast = selectedWeekKey !== currentWeekKey;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-panel shadow-card overflow-hidden",
        "border-line dark:border-line",
        "transition-[box-shadow,filter,opacity,transform] duration-200 hover:shadow-float",
      )}
    >
      <div className="px-4 py-3.5 flex items-center gap-3 bg-linear-to-r from-transparent via-brand-50/30 to-teal-50/20 dark:from-transparent dark:via-brand-900/10 dark:to-teal-900/5">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
            "bg-linear-to-br from-brand-100 to-teal-100",
            "dark:from-brand-900/40 dark:to-teal-900/30",
            "shadow-sm",
          )}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-brand-strong dark:text-brand"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text">Звіт тижня</div>
          <div className="text-xs text-muted mt-0.5">{weekRange}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {digest?.generatedAt && (
            <span className="text-2xs text-subtle">
              {new Date(digest.generatedAt).toLocaleDateString("uk-UA", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
          {history.length > 1 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              title="Попередні тижні"
              className={cn(
                "w-7 h-7 flex items-center justify-center rounded-xl transition-colors",
                showHistory
                  ? "bg-primary/15 text-primary"
                  : "text-muted hover:text-text hover:bg-panelHi",
              )}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          )}
          {onCollapse && (
            <Tooltip content="Згорнути" placement="top-center">
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Згорнути звіт тижня"
                className="w-7 h-7 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors"
              >
                <Icon name="chevron-up" size={15} strokeWidth={2.5} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {showHistory && history.length > 1 && (
        <div className="border-t border-line px-4 py-2">
          <div className="flex flex-wrap gap-1">
            {history.map((h) => (
              <button
                key={h.weekKey}
                type="button"
                onClick={() => {
                  setSelectedWeekKey(h.weekKey);
                  setShowHistory(false);
                }}
                className={cn(
                  "px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors",
                  selectedWeekKey === h.weekKey
                    ? "bg-primary/15 text-primary"
                    : "bg-panelHi text-muted hover:text-text",
                )}
              >
                {h.weekRange}
                {h.weekKey === currentWeekKey && (
                  <span className="ml-1 text-2xs opacity-70">поточний</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {isPast && (
        <div className="px-4 pb-1">
          <button
            type="button"
            onClick={() => setSelectedWeekKey(currentWeekKey)}
            className="text-xs text-primary hover:underline"
          >
            ← Поточний тиждень
          </button>
        </div>
      )}

      <DigestContent
        digest={digest}
        loading={loading}
        error={error}
        isCurrentWeek={isCurrentWeek}
        onGenerate={handleGenerate}
        onUpdate={handleGenerate}
        onPlayStories={() => setStoriesOpen(true)}
      />

      {storiesOpen && digest && (
        <WeeklyDigestStories
          digest={digest}
          weekKey={selectedWeekKey}
          weekRange={weekRange}
          onClose={() => setStoriesOpen(false)}
        />
      )}
    </div>
  );
}
