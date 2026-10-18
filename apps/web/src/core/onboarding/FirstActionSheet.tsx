import { useEffect, useMemo, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { clearFirstActionPending, getVibePicks } from "./vibePicks";
import { PresetSheet, getPresetModule } from "./PresetSheet";
import type { ModuleId } from "./presetApply";
import {
  getOnboardingGoals,
  rankFirstActionCandidates,
  type FirstActionRanking,
  formatNumberUk,
  NARROW_NBSP,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { messages } from "@shared/i18n/uk";

interface FirstActionEntry {
  title: string;
  desc: string;
  /**
   * Short label rendered in the inline chip row (S2.3). Module titles
   * like «Запиши перший прийом їжі» are too long for a chip; the chip
   * uses just the module name.
   */
  chipLabel: string;
}

/**
 * Per-module "one tap to your first real entry" copy. Tapping a row
 * opens `PresetSheet` for that module instead of routing into the
 * module's full input wizard — the preset sheet's tiles write a real
 * entry directly to storage, which is materially faster than any
 * module's stock flow and the shortest path to the 30-second promise.
 * If the user wants the full input, the preset sheet has a
 * «Власний варіант» fallback that still deep-links via
 * `openHubModuleWithAction`.
 */
const COPY = messages.firstAction;

const ACTIONS: Record<ModuleId, FirstActionEntry> = {
  routine: {
    ...COPY.actions.routine,
  },
  finyk: {
    ...COPY.actions.finyk,
  },
  nutrition: {
    ...COPY.actions.nutrition,
  },
  fizruk: {
    ...COPY.actions.fizruk,
  },
};

function isModuleId(id: string): id is ModuleId {
  return id in ACTIONS;
}

/**
 * Goal-aware primary + chip ordering + analytics reason for the FTUX
 * hero (PR-11). Reads the onboarding goals once per render and delegates
 * to `rankFirstActionCandidates` so web and mobile resolve the primary
 * and the alt-module chip-row order identically. The returned `reason`
 * is forwarded to PostHog through `onboarding_first_action_*` events so
 * the SLO dashboard can break first-entry rate down by selection mode
 * (`single-goal` vs `multi-goal-vibe` vs `multi-pick-static`).
 */
function rankPrimary(picks: string[]): FirstActionRanking {
  return rankFirstActionCandidates(picks, getOnboardingGoals(webKVStore));
}

/**
 * Inline FTUX row rendered at the top of the Hub dashboard when a first
 * action is pending. Replaces the earlier 4-tile `FirstActionHeroCard`
 * with one opinionated primary CTA plus an inline expand.
 *
 * Rationale: the old layout asked the user to *choose* a module before
 * they knew what any of them did, even though they had just selected
 * module chips on the splash one screen earlier. Forcing a second
 * explicit selection cost ~6 s and a visible beat of indecision. The
 * row now makes the default choice for them (highest-priority pick) and
 * only reveals the alternatives if they tap "Інший модуль".
 */
/**
 * Goal-aware contextual descriptions. If the user set a goal during
 * onboarding, the first-action card reflects it, making the CTA feel
 * more personal than the generic static copy.
 */
function getGoalAwareDesc(moduleId: string, fallback: string): string {
  const goals = getOnboardingGoals(webKVStore);
  if (moduleId === "finyk" && goals.finykBudget) {
    return `Встанови бюджет ${formatNumberUk(goals.finykBudget)}${NARROW_NBSP}₴ і додай першу витрату.`;
  }
  if (moduleId === "fizruk" && goals.fizrukWeeklyGoal) {
    return `${goals.fizrukWeeklyGoal}× на тиждень, починай із розминки.`;
  }
  if (moduleId === "routine" && goals.routineFirstHabit) {
    const habitLabels: Record<string, string> = COPY.habitLabels;
    const label =
      habitLabels[goals.routineFirstHabit] ?? COPY.habitLabels.fallback;
    return `Створи ${label}, і починається серія днів.`;
  }
  if (moduleId === "nutrition" && goals.nutritionGoal) {
    const goalLabels: Record<string, string> = COPY.goalLabels;
    return `${goalLabels[goals.nutritionGoal]}, запиши перший прийом їжі.`;
  }
  return fallback;
}

interface FirstActionHeroCardProps {
  onDismiss?: () => void;
}

export function FirstActionHeroCard({ onDismiss }: FirstActionHeroCardProps) {
  const picks = useMemo<ModuleId[]>(() => {
    const raw = getVibePicks();
    return raw.filter((id) => isModuleId(id));
  }, []);

  const [activePresetId, setActivePresetId] = useState<ModuleId | null>(null);

  // `rankPrimary` reads onboarding goals once and runs a trivial
  // 4-module scan; memoising would add more bookkeeping than it
  // saves. The goals payload is stable for the FTUX session — once
  // wizard.finish() persists them they won't mutate until reset.
  const ranking = rankPrimary(picks);
  const primaryId = ranking.primary;
  const primary = ACTIONS[primaryId];
  const others = useMemo<ModuleId[]>(
    () => ranking.others.filter((id): id is ModuleId => isModuleId(id)),
    [ranking.others],
  );

  useEffect(() => {
    if (picks.length === 0) return;
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_SHOWN, {
      picks,
      primary: primaryId,
      primary_reason: ranking.reason,
    });
  }, [picks, primaryId, ranking.reason]);

  const dismiss = () => {
    clearFirstActionPending();
    onDismiss?.();
  };

  const openPreset = (id: ModuleId) => {
    if (!getPresetModule(id)) return;
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_PICKED, {
      module: id,
      primary: primaryId,
      primary_reason: picks.length === 0 ? "no-picks" : ranking.reason,
      // S2.3: "chip" replaces the legacy "expand" tag now that the inline
      // chip row is always-visible. PostHog dashboards reading the raw
      // event can compute switch-rate as `count(via="chip") /
      // count(*)`. Keep the value short (one token) — it's faceted on.
      via:
        picks.length === 1 && id === primaryId
          ? "primary"
          : picks.length > 1
            ? "equal-choice"
            : "chip",
    });
    setActivePresetId(id);
  };

  const handlePresetPick = (
    { persisted }: { persisted: boolean } = { persisted: true },
  ) => {
    // Тільки routine-пресет дійсно пише запис у storage. Для
    // finyk/fizruk/nutrition ми лише навігуємо у повний add-sheet
    // модуля, а реальне збереження відбудеться, коли користувач
    // натисне «Зберегти» там. Якщо б ми гасили FTUX-прапор одразу,
    // hero-картка зникала б назавжди навіть коли юзер скасував
    // add-sheet — і `detectFirstRealEntry` → `useFirstEntryCelebration`
    // ніколи б не спрацювали. Натомість лишаємо прапор висіти: при
    // наступному маунті дашборду hero-картка повертається, а коли
    // справжній запис зʼявиться — обидва механізми знімуть її разом.
    setActivePresetId(null);
    if (persisted) {
      clearFirstActionPending();
      onDismiss?.();
    }
  };

  if (picks.length === 0) {
    const moduleIds = Object.keys(ACTIONS).filter((id): id is ModuleId =>
      isModuleId(id),
    );

    return (
      <>
        <Card
          as="section"
          padding="md"
          className="relative space-y-3"
          aria-label={COPY.sheetLabel}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SectionHeading as="div" size="xs" variant="subtle">
                {COPY.kicker}
              </SectionHeading>
              <h2 className="text-style-body font-semibold text-text mt-0.5">
                {COPY.headingMany}
              </h2>
              <p className="text-style-body text-muted mt-0.5 leading-snug">
                {COPY.subtitleSingle}
              </p>
            </div>
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              onClick={dismiss}
              aria-label={COPY.hideLabel}
              className="shrink-0 -mt-1 -mr-1 text-muted hover:text-text"
            >
              <Icon name="close" size="md" />
            </Button>
          </div>

          <div className="divide-y divide-line border-y border-line">
            {moduleIds.map((id) => {
              const action = ACTIONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => openPreset(id)}
                  className={cn(
                    "w-full min-h-14 py-2",
                    "text-left transition-[background-color,border-color]",
                    "hover:bg-panel",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className="min-w-0">
                      <span className="block text-style-body font-semibold text-text">
                        {action.chipLabel}
                      </span>
                      <span className="block text-style-caption text-muted">
                        {action.title}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
        <PresetSheet
          open={activePresetId != null}
          moduleId={activePresetId}
          onClose={() => setActivePresetId(null)}
          onPick={handlePresetPick}
        />
      </>
    );
  }

  if (picks.length > 1) {
    return (
      <>
        <Card
          as="section"
          padding="md"
          className="relative space-y-3"
          aria-label={COPY.sheetLabel}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SectionHeading as="div" size="xs" variant="subtle">
                {COPY.kicker}
              </SectionHeading>
              <h2 className="text-style-body font-semibold text-text mt-0.5">
                {COPY.headingMany}
              </h2>
              <p className="text-style-body text-muted mt-0.5 leading-snug">
                {COPY.subtitleMulti}
              </p>
            </div>
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              onClick={dismiss}
              aria-label={COPY.hideLabel}
              className="shrink-0 -mt-1 -mr-1 text-muted hover:text-text"
            >
              <Icon name="close" size="md" />
            </Button>
          </div>

          <div
            className="divide-y divide-line border-y border-line"
            role="group"
            aria-label={COPY.picksLabel}
          >
            {picks.map((id) => {
              const action = ACTIONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => openPreset(id)}
                  className={cn(
                    "w-full min-h-14 py-2",
                    "text-left transition-[background-color,border-color]",
                    "hover:bg-panel",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className="min-w-0">
                      <span className="block text-style-body font-semibold text-text">
                        {action.chipLabel}
                      </span>
                      <span className="block text-style-caption text-muted">
                        {action.title}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
        <PresetSheet
          open={activePresetId != null}
          moduleId={activePresetId}
          onClose={() => setActivePresetId(null)}
          onPick={handlePresetPick}
        />
      </>
    );
  }

  if (!primary) return null;

  return (
    <>
      <Card
        as="section"
        padding="md"
        className="relative space-y-3"
        aria-label={COPY.sheetLabel}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionHeading as="div" size="xs" variant="subtle">
              {COPY.kicker}
            </SectionHeading>
            <h2 className="text-style-body font-semibold text-text mt-0.5">
              {picks.length > 1 ? COPY.headingMany : COPY.headingOne}
            </h2>
            <p className="text-style-body text-muted mt-0.5 leading-snug">
              {COPY.subtitleEmpty}
            </p>
          </div>
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            onClick={dismiss}
            aria-label={COPY.hideLabel}
            className="shrink-0 -mt-1 -mr-1 text-muted hover:text-text"
          >
            <Icon name="close" size="md" />
          </Button>
        </div>

        <button
          type="button"
          onClick={() => openPreset(primaryId)}
          className={cn(
            "w-full text-left py-3 border-y border-line",
            "hover:bg-panel transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-style-body font-semibold text-text">
                {primary.title}
              </div>
              <div className="text-style-body text-muted mt-0.5 truncate">
                {getGoalAwareDesc(primaryId, primary.desc)}
              </div>
            </div>
          </div>
        </button>

        {others.length > 0 && (
          // S2.3: Always-visible inline chip row replaces the previous
          // «Інший модуль» accordion. Each chip opens its module's
          // PresetSheet directly. Switch-rate dashboards consume the
          // `onboarding_first_action_picked` event with `via="chip"`
          // vs `via="primary"`.
          <div
            className="divide-y divide-line border-y border-line"
            role="group"
            aria-label={COPY.otherModuleLabel}
          >
            <span className="text-style-caption text-muted shrink-0">
              {COPY.orPrefix}
            </span>
            {others.map((id) => {
              const a = ACTIONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => openPreset(id)}
                  className={cn(
                    "flex w-full min-h-14 items-center py-2",
                    "text-text",
                    "hover:bg-panel",
                    "transition-[background-color,border-color]",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
                  )}
                >
                  <span className="text-style-body font-semibold">
                    {a.chipLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>
      <PresetSheet
        open={activePresetId != null}
        moduleId={activePresetId}
        onClose={() => setActivePresetId(null)}
        onPick={handlePresetPick}
      />
    </>
  );
}
