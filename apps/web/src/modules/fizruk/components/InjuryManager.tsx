import { useMemo, useState } from "react";
import {
  BODY_ATLAS_MUSCLE_IDS,
  BODY_ATLAS_MUSCLE_LABELS_UK,
  type BodyAtlasMuscleId,
} from "@sergeant/fizruk-domain/data";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { useToast } from "@shared/hooks/useToast";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { useInjuries } from "../hooks/useInjuries";

export function InjuryManager() {
  const t = messages.fizruk.injuries;
  const { activeInjuries, mark, clear } = useInjuries();
  const toast = useToast();
  const [selected, setSelected] = useState<BodyAtlasMuscleId[]>([]);
  const [busy, setBusy] = useState(false);
  const activeGroups = useMemo(
    () => new Set(activeInjuries.map((injury) => injury.muscleGroup)),
    [activeInjuries],
  );

  const toggle = (group: BodyAtlasMuscleId) => {
    setSelected((current) =>
      current.includes(group)
        ? current.filter((item) => item !== group)
        : [...current, group],
    );
  };

  return (
    <Card radius="lg" padding="lg" className="space-y-3">
      <div>
        <SectionHeading as="h2" size="sm" variant="fizruk">
          {t.title}
        </SectionHeading>
        <p className="text-style-caption text-subtle mt-1">{t.description}</p>
      </div>

      {activeInjuries.length > 0 && (
        <div className="space-y-2" aria-label={t.activeListLabel}>
          {activeInjuries.map((injury) => (
            <div
              key={injury.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2"
            >
              <span className="text-style-body text-text">
                {BODY_ATLAS_MUSCLE_LABELS_UK[injury.muscleGroup]}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await clear(injury.id);
                    toast.success(t.clearedToast);
                  } catch {
                    toast.error(t.clearFailedToast);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t.clear}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2" aria-label={t.muscleGroupsLabel}>
        {BODY_ATLAS_MUSCLE_IDS.map((group) => {
          const active = activeGroups.has(group);
          const checked = selected.includes(group);
          return (
            <button
              key={group}
              type="button"
              disabled={active || busy}
              aria-pressed={checked || active}
              className={cn(
                "min-h-[44px] rounded-full border px-3 py-2 text-style-caption transition-colors disabled:opacity-50",
                checked || active
                  ? "border-warning-strong bg-warning/15 text-warning-strong dark:text-warning"
                  : "border-line bg-bg text-muted hover:border-muted hover:text-text",
              )}
              onClick={() => toggle(group)}
            >
              {BODY_ATLAS_MUSCLE_LABELS_UK[group]}
            </button>
          );
        })}
      </div>

      <Button
        module="fizruk"
        className="w-full h-12"
        disabled={busy || selected.length === 0}
        onClick={async () => {
          setBusy(true);
          try {
            await mark(selected);
            setSelected([]);
            toast.success(t.savedToast);
          } catch {
            toast.error(t.saveFailedToast);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t.submit}
      </Button>
    </Card>
  );
}
