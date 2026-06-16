/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/ui/cn";
import { BodyAtlas } from "./BodyAtlas";
import { buildAtlasData } from "../lib/atlasData";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useRecovery } from "../hooks/useRecovery";

export function RecoveryFocusCard({
  onOpenAtlas,
}: {
  onOpenAtlas?: () => void;
}) {
  const rec = useRecovery();
  const { musclesUk } = useExerciseCatalog();
  const [open, setOpen] = useState(false);

  const atlasData = useMemo(() => buildAtlasData(rec.by), [rec.by]);

  const focus = useMemo(
    () =>
      (rec.ready || []).slice(0, 4).map((m) => ({
        id: m.id,
        label: musclesUk?.[m.id] || m.label || m.id,
        daysSince: m.daysSince,
      })),
    [rec.ready, musclesUk],
  );

  const avoid = useMemo(
    () =>
      (rec.avoid || []).slice(0, 4).map((m) => ({
        id: m.id,
        label: musclesUk?.[m.id] || m.label || m.id,
      })),
    [rec.avoid, musclesUk],
  );

  return (
    <Card as="section" radius="lg" aria-label="Відновлення та фокус тренування">
      <div className="flex items-start justify-between gap-2">
        {/*
          Toggle row was previously a borderless trailing-chevron button —
          read as plain heading text on the panel background. Switched to a
          leading caret + soft hover surface (matches `JournalEntryCard`'s
          collapse pattern) so the row reads as an obvious tap target. The
          Atlas CTA next to it moved from `ghost` to the `fizruk-soft`
          variant for the same reason: a filled, branded pill is unambiguous
          where a transparent ghost label looked like inert text.
        */}
        <button
          type="button"
          className="min-w-0 flex-1 text-left flex items-start gap-2 rounded-xl px-2 py-2 -mx-2 -my-2 hover:bg-panelHi/80 active:bg-panelHi transition-colors"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span
            aria-hidden
            className={cn(
              "inline-flex items-center justify-center w-5 h-5 mt-0.5 rounded-md text-muted shrink-0 text-xs transition-transform",
              open ? "rotate-180" : "rotate-0",
            )}
          >
            ▾
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-style-subtitle text-text">
              Відновлення й фокус
            </h2>
            <p className="text-xs text-subtle mt-1 leading-snug">
              Колір на силуеті — готовність груп; чіпи — пріоритет після
              відпочинку.
            </p>
          </div>
        </button>
        <Button
          variant="fizruk-soft"
          size="sm"
          className="h-9 min-h-[40px] px-3 text-xs shrink-0"
          onClick={() => onOpenAtlas?.()}
          aria-label="Відкрити атлас мʼязів"
        >
          Атлас
        </Button>
      </div>

      {open && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-style-caption text-subtle mb-3 mt-3">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success" /> готово
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-warning" /> краще
              почекати
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-danger" /> рано
            </span>
          </div>

          {rec.wellbeingMult > 1.1 && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-warning/10 border border-warning/25 flex items-start gap-2">
              <span className="text-base shrink-0" aria-hidden>
                😴
              </span>
              <p className="text-xs text-warning-strong dark:text-warning leading-snug">
                {rec.wellbeingMult >= 1.3
                  ? "Поганий сон або дуже низька енергія — відновлення значно сповільнене."
                  : "Недостатній сон або низька енергія — відновлення сповільнене."}{" "}
                М{"'"}язи потребують більше часу перед наступним навантаженням.
              </p>
            </div>
          )}

          <BodyAtlas data={atlasData} compact />

          <div className="mt-4 pt-3 border-t border-line">
            <SectionHeading as="p" size="xs" variant="fizruk" className="mb-2">
              Пріоритет після відпочинку
            </SectionHeading>
            <div className="flex flex-wrap gap-2">
              {focus.map((m) => (
                <span
                  key={m.id}
                  className="px-2.5 py-1 bg-success/10 text-success-strong dark:text-success text-style-caption rounded-full border border-success/15"
                >
                  {m.label}
                  {m.daysSince == null ? "" : ` · ${m.daysSince}д без`}
                </span>
              ))}
              {focus.length === 0 && (
                <span className="text-xs text-subtle">
                  Додай завершені тренування — зʼявиться пріоритет груп.
                </span>
              )}
            </div>
            {avoid.length > 0 && (
              <p className="text-xs text-muted mt-3 leading-relaxed">
                <span className="font-semibold text-warning-strong dark:text-warning">
                  Почекати:
                </span>{" "}
                {avoid.map((x) => x.label).join(", ")}
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
