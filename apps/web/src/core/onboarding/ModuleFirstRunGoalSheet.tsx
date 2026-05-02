import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@shared/lib/cn";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import {
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
  webKVStore,
} from "@shared/lib/storage";
import {
  getGoalQuestions,
  getOnboardingGoals,
  saveOnboardingGoals,
  type GoalQuestion,
  type OnboardingGoals,
} from "@sergeant/shared";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";

/**
 * @scaffolded — wired from App.tsx module-mount branch.
 * @experimental — copy + ordering may shift after FTUX analytics review.
 * @owner Skords-01
 * @addedIn PR-2 FTUX one-screen onboarding
 * @nextStep observe `onboarding_goal_set` rates per module; consider deferring
 *           further (e.g. only after first real entry) if dismiss-rate is high.
 *
 * Per-module first-run goal sheet. Replaces the wizard's third step
 * (`GoalsStep`) with contextual prompts: the relevant question for a
 * given module fires the first time the user actually opens that
 * module, not upfront.
 *
 * Rationale: a generic `goals` step in onboarding is high cost (4th
 * transition, blocks the dashboard) for low signal (skipped by most
 * users, the questions only matter once the user is inside the
 * relevant module anyway). Asking «Який твій бюджет на місяць?» when
 * the user lands in Finyk for the first time is more contextually
 * coherent than asking before they even know what Finyk does.
 */

const FIRST_SEEN_KEY_PREFIX = "sergeant.onboarding.module_first_seen.";
const FIRST_SEEN_KEY_SUFFIX = ".v1";

function firstSeenKey(moduleId: string): string {
  return `${FIRST_SEEN_KEY_PREFIX}${moduleId}${FIRST_SEEN_KEY_SUFFIX}`;
}

function isFirstSeen(moduleId: string): boolean {
  return safeReadStringLS(firstSeenKey(moduleId)) === "1";
}

function markFirstSeen(moduleId: string): void {
  safeWriteLS(firstSeenKey(moduleId), "1");
}

/** Test-only escape hatch: clear all first-seen flags. */
export function resetModuleFirstSeen(): void {
  ["finyk", "fizruk", "routine", "nutrition"].forEach((id) => {
    safeRemoveLS(firstSeenKey(id));
  });
}

const GOAL_KEY_MAP: Record<string, keyof OnboardingGoals> = {
  finyk_budget: "finykBudget",
  fizruk_weekly: "fizrukWeeklyGoal",
  routine_first_habit: "routineFirstHabit",
  nutrition_goal: "nutritionGoal",
};

function GoalRadioGroup({
  question,
  value,
  onChange,
}: {
  question: GoalQuestion;
  value: string | null;
  onChange: (v: string) => void;
}) {
  if (!question.options) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-style-label text-text">{question.title}</p>
      <div className="flex flex-wrap gap-2">
        {question.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3.5 py-2 rounded-xl border text-style-label transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
              value === opt.value
                ? "border-brand-500/60 bg-brand-500/10 text-brand-strong dark:text-brand"
                : "border-line bg-panel text-text hover:border-brand-500/30",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GoalSlider({
  question,
  value,
  onChange,
}: {
  question: GoalQuestion;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const s = question.slider;
  if (!s) return null;
  const current = value ?? Math.round((s.min + s.max) / 2);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-style-label text-text">{question.title}</p>
        <span className="text-sm font-bold text-brand-strong dark:text-brand tabular-nums">
          {current.toLocaleString("uk-UA")}
          {s.unit}
        </span>
      </div>
      <input
        type="range"
        min={s.min}
        max={s.max}
        step={s.step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-500"
      />
      <div className="flex justify-between text-meta text-muted">
        <span>
          {s.min.toLocaleString("uk-UA")}
          {s.unit}
        </span>
        <span>
          {s.max.toLocaleString("uk-UA")}
          {s.unit}
        </span>
      </div>
    </div>
  );
}

const MODULE_TITLES: Record<string, { title: string; desc: string }> = {
  finyk: {
    title: "Налаштуй Фінік",
    desc: "Швидко вкажи бюджет — далі зможеш змінити в налаштуваннях.",
  },
  fizruk: {
    title: "Налаштуй Фізрук",
    desc: "Цільовий ритм — лише орієнтир, можна перенастроїти будь-коли.",
  },
  routine: {
    title: "Налаштуй Рутину",
    desc: "Перша звичка — старт стріку. Інші додаси з модуля.",
  },
  nutrition: {
    title: "Налаштуй Харчування",
    desc: "Один вибір — і денний план підкаже калорії.",
  },
};

interface ModuleFirstRunGoalSheetProps {
  moduleId: string | null;
}

/**
 * Mounted at the app root next to the active-module branch. Tracks
 * `activeModule` and shows a one-time goal sheet the first time the
 * user enters each module. Closing the sheet (Skip or Save) marks the
 * first-seen flag so it never reappears.
 */
export function ModuleFirstRunGoalSheet({
  moduleId,
}: ModuleFirstRunGoalSheetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<OnboardingGoals>(() =>
    getOnboardingGoals(webKVStore),
  );

  const questions = useMemo<GoalQuestion[]>(() => {
    if (!moduleId) return [];
    return getGoalQuestions([moduleId as never]);
  }, [moduleId]);

  // Open the sheet when a module is freshly mounted and we have at
  // least one relevant question. We deliberately do not open on
  // re-renders of the same module; the effect runs once per
  // `moduleId` transition.
  useEffect(() => {
    if (!moduleId) return;
    if (isFirstSeen(moduleId)) return;
    if (questions.length === 0) {
      // No question for this module — just record the visit so we
      // don't keep checking on every navigation.
      markFirstSeen(moduleId);
      return;
    }
    // Refresh the draft each time we open so any goal already saved
    // (e.g. user re-onboarded mid-session) is reflected.
    setDraft(getOnboardingGoals(webKVStore));
    setOpen(true);
  }, [moduleId, questions.length]);

  const setGoalValue = useCallback(
    (key: keyof OnboardingGoals, value: unknown) => {
      setDraft((prev) => ({ ...prev, [key]: value as never }));
    },
    [],
  );

  const closeAndMark = useCallback(() => {
    if (moduleId) markFirstSeen(moduleId);
    setOpen(false);
  }, [moduleId]);

  const save = useCallback(() => {
    if (!moduleId) return;
    // Persist only the values that changed for this module's
    // questions; preserve any goals saved previously by other modules.
    const merged: OnboardingGoals = { ...getOnboardingGoals(webKVStore) };
    let touched = false;
    for (const q of questions) {
      const key = GOAL_KEY_MAP[q.id];
      if (!key) continue;
      const current = draft[key];
      if (current !== merged[key]) {
        // sliders return string from <input range>; coerce numeric
        // questions before persisting.
        if (q.type === "slider") {
          const n = typeof current === "number" ? current : Number(current);
          if (Number.isFinite(n) && n > 0) {
            (merged[key] as number | null) = n;
            touched = true;
          }
        } else if (q.type === "radio") {
          if (typeof current === "string" && current.length > 0) {
            (merged[key] as string | null) = current;
            touched = true;
          }
        }
        if (touched) {
          trackEvent(ANALYTICS_EVENTS.ONBOARDING_GOAL_SET, {
            module: q.module,
            goalType: q.id,
            value: current,
          });
        }
      }
    }
    if (touched) {
      saveOnboardingGoals(webKVStore, {
        ...merged,
        fizrukWeeklyGoal: merged.fizrukWeeklyGoal
          ? Number(merged.fizrukWeeklyGoal)
          : null,
      });
    }
    closeAndMark();
  }, [moduleId, questions, draft, closeAndMark]);

  if (!moduleId) return null;

  const meta = MODULE_TITLES[moduleId] ?? {
    title: "Налаштування",
    desc: "Швидке налаштування модуля.",
  };

  return (
    <Sheet
      open={open}
      onClose={closeAndMark}
      title={meta.title}
      description={meta.desc}
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="flex-1"
            onClick={closeAndMark}
          >
            Пропустити
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={save}
          >
            Зберегти
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        {questions.map((q) => {
          const key = GOAL_KEY_MAP[q.id];
          if (!key) return null;
          if (q.type === "radio") {
            return (
              <GoalRadioGroup
                key={q.id}
                question={q}
                value={(draft[key] as string | null) ?? null}
                onChange={(v) => setGoalValue(key, v)}
              />
            );
          }
          return (
            <GoalSlider
              key={q.id}
              question={q}
              value={(draft[key] as number | null) ?? null}
              onChange={(v) => setGoalValue(key, v)}
            />
          );
        })}
      </div>
    </Sheet>
  );
}
