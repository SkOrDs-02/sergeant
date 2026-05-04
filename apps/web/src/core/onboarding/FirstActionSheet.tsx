import { useEffect, useMemo, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { clearFirstActionPending, getVibePicks } from "./vibePicks";
import { PresetSheet, getPresetModule } from "./PresetSheet";
import type { ModuleId } from "./presetApply";
import { getOnboardingGoals, pickPrimaryFirstAction } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

type IconName = Parameters<typeof Icon>[0]["name"];

interface FirstActionEntry {
  icon: IconName;
  title: string;
  desc: string;
  accent: string;
  /**
   * Short label rendered in the inline chip row (S2.3). Module titles
   * like «Запиши перший прийом їжі» are too long for a chip; the chip
   * uses just the module name. Icon carries the rest of the meaning.
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
const ACTIONS: Record<ModuleId, FirstActionEntry> = {
  routine: {
    icon: "check",
    title: "Створи першу звичку",
    desc: "~5 секунд. Стрік почнеться сьогодні.",
    accent: "text-routine-strong dark:text-routine bg-routine-surface",
    chipLabel: "Рутина",
  },
  finyk: {
    icon: "credit-card",
    title: "Додай першу витрату",
    desc: "~5 секунд, будь-яка сума.",
    accent: "text-finyk-strong dark:text-finyk bg-finyk-soft",
    chipLabel: "Фінік",
  },
  nutrition: {
    icon: "utensils",
    title: "Запиши перший прийом їжі",
    desc: "Калорії порахую я.",
    accent: "text-nutrition-strong dark:text-nutrition bg-nutrition-soft",
    chipLabel: "Харчування",
  },
  fizruk: {
    icon: "dumbbell",
    title: "Увімкни розминку",
    desc: "10 хв, таймер сам.",
    accent: "text-fizruk-strong dark:text-fizruk bg-fizruk-soft",
    chipLabel: "Фізрук",
  },
};

function isModuleId(id: string): id is ModuleId {
  return id in ACTIONS;
}

/**
 * Goal-aware primary picker for the FTUX hero (S2.1). Reads the
 * onboarding goals once per render and delegates the goal vs static
 * priority decision to `@sergeant/shared` so web and mobile resolve
 * the primary identically. Falls back to `routine` if `picks` is
 * empty (matches pre-S2.1 behaviour).
 */
function pickPrimary(picks: string[]): ModuleId {
  return pickPrimaryFirstAction(picks, getOnboardingGoals(webKVStore));
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
    return `Встанови бюджет ${goals.finykBudget.toLocaleString("uk-UA")}₴ — додай першу витрату.`;
  }
  if (moduleId === "fizruk" && goals.fizrukWeeklyGoal) {
    return `${goals.fizrukWeeklyGoal}× на тиждень — починай із розминки.`;
  }
  if (moduleId === "routine" && goals.routineFirstHabit) {
    const habitLabels: Record<string, string> = {
      water: "«Пити воду»",
      exercise: "«Зарядка»",
      reading: "«Читання»",
    };
    const label = habitLabels[goals.routineFirstHabit] ?? "свою звичку";
    return `Створи ${label} — стрік почнеться сьогодні.`;
  }
  if (moduleId === "nutrition" && goals.nutritionGoal) {
    const goalLabels: Record<string, string> = {
      lose: "Схуднути",
      gain: "Набрати масу",
      maintain: "Підтримка",
    };
    return `${goalLabels[goals.nutritionGoal]} — залогай перший прийом їжі.`;
  }
  return fallback;
}

interface FirstActionHeroCardProps {
  onDismiss?: () => void;
}

export function FirstActionHeroCard({ onDismiss }: FirstActionHeroCardProps) {
  const picks = useMemo<string[]>(() => {
    const raw = getVibePicks();
    return raw.length > 0 ? raw : Object.keys(ACTIONS);
  }, []);

  // `pickPrimary` reads onboarding goals once and runs a trivial
  // 4-module scan; memoising would add more bookkeeping than it
  // saves. The goals payload is stable for the FTUX session — once
  // wizard.finish() persists them they won't mutate until reset.
  const primaryId = pickPrimary(picks);
  const primary = ACTIONS[primaryId];
  const others = useMemo<ModuleId[]>(
    () =>
      picks.filter(
        (id: string): id is ModuleId => id !== primaryId && isModuleId(id),
      ),
    [picks, primaryId],
  );

  // Module id whose PresetSheet is currently open, or `null` if closed.
  // Keeping the hero card mounted while the sheet is open means the
  // user can dismiss the sheet and try another module without losing
  // their FTUX context.
  const [activePresetId, setActivePresetId] = useState<ModuleId | null>(null);

  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_SHOWN, {
      picks,
      primary: primaryId,
    });
  }, [picks, primaryId]);

  const dismiss = () => {
    clearFirstActionPending();
    onDismiss?.();
  };

  const openPreset = (id: ModuleId) => {
    if (!getPresetModule(id)) return;
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_PICKED, {
      module: id,
      primary: primaryId,
      // S2.3: "chip" replaces the legacy "expand" tag now that the inline
      // chip row is always-visible. PostHog dashboards reading the raw
      // event can compute switch-rate as `count(via="chip") /
      // count(*)`. Keep the value short (one token) — it's faceted on.
      via: id === primaryId ? "primary" : "chip",
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
    // справжній запис з'явиться — обидва механізми знімуть її разом.
    setActivePresetId(null);
    if (persisted) {
      clearFirstActionPending();
      onDismiss?.();
    }
  };

  if (!primary) return null;

  return (
    <>
      <section
        className="relative bg-panel border border-line rounded-2xl p-4 shadow-card space-y-3"
        aria-label="Перша дія"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionHeading as="div" size="sm" variant="subtle">
              Старт
            </SectionHeading>
            <h2 className="text-base font-bold text-text mt-0.5">
              Зроби одну річ — і хаб твій
            </h2>
            <p className="text-xs text-muted mt-0.5 leading-snug">
              Цифри нижче — приклад. Твої з&apos;являться, щойно щось додаси.
            </p>
          </div>
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            onClick={dismiss}
            aria-label="Сховати"
            className="shrink-0 -mt-1 -mr-1 text-muted hover:text-text"
          >
            <Icon name="close" size={16} />
          </Button>
        </div>

        <button
          type="button"
          onClick={() => openPreset(primaryId)}
          className={cn(
            "w-full text-left px-4 py-3 rounded-xl border-2 border-brand-500/50 bg-brand-500/5",
            "hover:border-brand-500 hover:bg-brand-500/10 transition-[background-color,border-color,opacity]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-11 h-11 shrink-0 rounded-xl flex items-center justify-center",
                primary.accent,
              )}
            >
              <Icon name={primary.icon} size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-text">{primary.title}</div>
              <div className="text-xs text-muted mt-0.5 truncate">
                {getGoalAwareDesc(primaryId, primary.desc)}
              </div>
            </div>
            <Icon
              name="chevron-right"
              size={18}
              className="text-brand-strong dark:text-brand"
            />
          </div>
        </button>

        {others.length > 0 && (
          // S2.3: Always-visible inline chip row replaces the previous
          // «Інший модуль» accordion. Each chip opens its module's
          // PresetSheet directly. Switch-rate dashboards consume the
          // `onboarding_first_action_picked` event with `via="chip"`
          // vs `via="primary"`.
          <div
            className="flex flex-wrap items-center gap-2 pt-1"
            role="group"
            aria-label="Інший модуль"
          >
            <span className="text-style-caption text-muted shrink-0">Або:</span>
            {others.map((id) => {
              const a = ACTIONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => openPreset(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 h-8 rounded-full",
                    "border border-line bg-panelHi text-text",
                    "hover:border-brand-500/50 hover:bg-brand-500/5",
                    "transition-[background-color,border-color]",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
                  )}
                >
                  <span
                    className={cn(
                      "w-5 h-5 shrink-0 rounded-md flex items-center justify-center",
                      a.accent,
                    )}
                    aria-hidden
                  >
                    <Icon name={a.icon} size={12} />
                  </span>
                  <span className="text-style-caption font-medium">
                    {a.chipLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
      <PresetSheet
        open={activePresetId != null}
        moduleId={activePresetId}
        onClose={() => setActivePresetId(null)}
        onPick={handlePresetPick}
      />
    </>
  );
}
