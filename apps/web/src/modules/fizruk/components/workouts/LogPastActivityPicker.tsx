/**
 * Last validated: 2026-09-16
 * Status: Active
 *
 * Вкладений аркуш вибору заняття для форми «Записати проведене»: ~55 позицій
 * каталогу, згруповані за категорією, з пошуком (без нього їх гортали).
 * Винесено з `LogPastWorkoutSheet.tsx`, коли та форма дістала третій режим
 * «Швидкий запис» і вперлась у стелю 600 рядків (Hard Rule #18).
 */
import { useState } from "react";

import { Input } from "@shared/components/ui/Input";
import { Sheet } from "@shared/components/ui/Sheet";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import {
  ACTIVITY_CATEGORIES_UK,
  type ActivityCategory,
  type ActivityDef,
} from "@sergeant/fizruk-domain/data";

/**
 * Службове значення селекта: «завести своє заняття». Живе поруч зі
 * справжніми id, бо це той самий вибір з погляду людини - просто його ще
 * нема в списку.
 */
export const NEW_ACTIVITY_VALUE = "__new__";

export const CATEGORY_ORDER: ActivityCategory[] = [
  "strength",
  "cardio",
  "group",
  "flexibility",
];

/** Заняття збігається з запитом по назві без урахування регістру. */
function matchesActivityQuery(a: ActivityDef, q: string): boolean {
  return a.nameUk.toLocaleLowerCase("uk").includes(q);
}

export function ActivityPickerSheet({
  open,
  onClose,
  activities,
  justCreated,
  value,
  canCreate,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  activities: ActivityDef[];
  justCreated: ActivityDef | null;
  value: string;
  canCreate: boolean;
  onPick: (id: string) => void;
}) {
  const t = messages.fizruk.logPast;
  const [q, setQ] = useState("");
  const query = q.trim().toLocaleLowerCase("uk");
  const all =
    justCreated && !activities.some((a) => a.id === justCreated.id)
      ? [...activities, justCreated]
      : activities;
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: all.filter(
      (a) => a.category === category && matchesActivityQuery(a, query),
    ),
  })).filter((g) => g.items.length > 0);

  const optionClass = (active: boolean) =>
    cn(
      "focus-ring flex min-h-[44px] w-full items-center gap-3 rounded-xl px-2 text-left text-style-body",
      active ? "bg-fizruk-surface text-fizruk-soft-fg" : "text-text",
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.pickerTitle}
      zIndex={90}
      panelClassName="fizruk-sheet"
    >
      <div className="sticky top-0 z-10 -mx-1 bg-panel px-1 pb-2">
        <Input
          {...searchFieldProps("log-past-activity-search")}
          placeholder={t.pickerSearch}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div role="listbox" aria-label={t.activity} className="space-y-3">
        {groups.map(({ category, items }) => (
          <div key={category}>
            <div className="mb-1 px-2 text-style-caption font-semibold text-subtle">
              {ACTIVITY_CATEGORIES_UK[category]}
            </div>
            {items.map((a) => (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={value === a.id}
                className={optionClass(value === a.id)}
                onClick={() => onPick(a.id)}
              >
                {a.nameUk}
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 && (
          <p className="px-2 py-4 text-style-caption text-subtle">
            {t.pickerEmpty}
          </p>
        )}
        {canCreate && (
          <button
            type="button"
            role="option"
            aria-selected={value === NEW_ACTIVITY_VALUE}
            className={cn(
              optionClass(value === NEW_ACTIVITY_VALUE),
              "font-semibold",
            )}
            onClick={() => onPick(NEW_ACTIVITY_VALUE)}
          >
            {t.activityNew}
          </button>
        )}
      </div>
    </Sheet>
  );
}
