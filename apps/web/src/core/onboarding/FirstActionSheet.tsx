import { useEffect, useMemo, useState } from "react";
import { cn } from "@shared/lib/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { clearFirstActionPending, getVibePicks } from "./vibePicks";
import { PresetSheet, getPresetModule } from "./PresetSheet";
import { getOnboardingGoals } from "@sergeant/shared";

const localStorageStore = {
  getString: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setString: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* noop */
    }
  },
  remove: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* noop */
    }
  },
};

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
const ACTIONS = {
  routine: {
    icon: "check",
    title: "Створи першу звичку",
    desc: "~5 секунд. Стрік почнеться сьогодні.",
    accent: "text-routine-strong dark:text-routine bg-routine-surface",
  },
  finyk: {
    icon: "credit-card",
    title: "Додай першу витрату",
    desc: "~5 секунд, будь-яка сума.",
    accent: "text-finyk-strong dark:text-finyk bg-finyk-soft",
  },
  nutrition: {
    icon: "utensils",
    title: "Запиши перший прийом їжі",
    desc: "Калорії порахую я.",
    accent: "text-nutrition-strong dark:text-nutrition bg-nutrition-soft",
  },
  fizruk: {
    icon: "dumbbell",
    title: "Увімкни розминку",
    desc: "10 хв, таймер сам.",
    accent: "text-fizruk-strong dark:text-fizruk bg-fizruk-soft",
  },
};

// Priority order when more than one vibe is picked. Routine comes first
// because "create a habit" has the lowest friction (no numbers, no
// camera, no bank auth) and the highest emotional payoff (7-day streak
// preview). Fizruk requires an in-module wizard to produce a real entry,
// so it goes last.
const PRIORITY = ["routine", "finyk", "nutrition", "fizruk"];

function pickPrimary(picks) {
  for (const id of PRIORITY) {
    if (picks.includes(id)) return id;
  }
  return "routine";
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
  const goals = getOnboardingGoals(localStorageStore);
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

export function FirstActionHeroCard({ onDismiss }) {
  const picks = useMemo(() => {
    const raw = getVibePicks();
    return raw.length > 0 ? raw : Object.keys(ACTIONS);
  }, []);

  // `pickPrimary` returns a primitive string from a trivial scan of a
  // 4-element constant; wrapping it in `useMemo` wouldn't prevent any
  // work and the dependency compare costs more than the scan.
  const primaryId = pickPrimary(picks);
  const primary = ACTIONS[primaryId];
  const others = useMemo(
    () => picks.filter((id) => id !== primaryId && ACTIONS[id]),
    [picks, primaryId],
  );

  const [expanded, setExpanded] = useState(false);
  // Module id whose PresetSheet is currently open, or `null` if closed.
  // Keeping the hero card mounted while the sheet is open means the
  // user can dismiss the sheet and try another module without losing
  // their FTUX context.
  const [activePresetId, setActivePresetId] = useState(null);

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

  const openPreset = (id) => {
    if (!getPresetModule(id)) return;
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_PICKED, {
      module: id,
      primary: primaryId,
      via: id === primaryId ? "primary" : "expand",
    });
    setActivePresetId(id);
  };

  const handlePresetPick = ({ persisted } = { persisted: true }) => {
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
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className={cn(
                "w-full text-xs font-medium text-muted hover:text-text",
                "flex items-center justify-center gap-1 py-1",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded-xl",
              )}
            >
              <span>{expanded ? "Сховати" : "Інший модуль"}</span>
              <Icon
                name="chevron-right"
                size={12}
                className={cn(
                  "transition-transform",
                  expanded ? "rotate-90" : "rotate-0",
                )}
              />
            </button>

            {expanded && (
              <div className="space-y-2">
                {others.map((id) => {
                  const a = ACTIONS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => openPreset(id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-xl border border-line bg-panelHi",
                        "hover:border-brand-500/50 hover:bg-brand-500/5 transition-[background-color,border-color,opacity]",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-9 h-9 shrink-0 rounded-xl flex items-center justify-center",
                            a.accent,
                          )}
                        >
                          <Icon name={a.icon} size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-text">
                            {a.title}
                          </div>
                          <div className="text-xs text-muted mt-0.5 truncate">
                            {a.desc}
                          </div>
                        </div>
                        <Icon
                          name="chevron-right"
                          size={14}
                          className="text-muted"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
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
