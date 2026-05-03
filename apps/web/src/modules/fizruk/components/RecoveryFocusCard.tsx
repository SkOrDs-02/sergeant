import { useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { BodyAtlas } from "./BodyAtlas";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useRecovery } from "../hooks/useRecovery";

function mapMuscleId(id: string | undefined | null): string | null {
  if (!id) return null;
  if (id === "pectoralis_major" || id === "pectoralis_minor") return "chest";
  if (id === "latissimus_dorsi") return "upper-back";
  if (id === "rhomboids" || id === "upper_back") return "upper-back";
  if (id === "erector_spinae") return "lower-back";
  if (id === "trapezius") return "trapezius";
  if (id === "biceps") return "biceps";
  if (id === "triceps") return "triceps";
  if (id === "forearms") return "forearm";
  if (id === "front_deltoid") return "front-deltoids";
  if (id === "rear_deltoid") return "back-deltoids";
  if (id === "rectus_abdominis") return "abs";
  if (id === "obliques") return "obliques";
  if (id === "quadriceps") return "quadriceps";
  if (id === "hamstrings") return "hamstring";
  if (id === "calves") return "calves";
  if (id === "adductors") return "adductor";
  if (id === "abductors") return "abductors";
  if (id === "gluteus_maximus" || id === "gluteus_medius") return "gluteal";
  if (id === "neck") return "neck";
  return null;
}

function worstStatus(a: string, b: string): string {
  if (a === "red" || b === "red") return "red";
  if (a === "yellow" || b === "yellow") return "yellow";
  return "green";
}

export function RecoveryFocusCard({
  onOpenAtlas,
}: {
  onOpenAtlas?: () => void;
}) {
  const rec = useRecovery();
  const { musclesUk } = useExerciseCatalog();
  const [open, setOpen] = useState(false);

  const statusByMuscle = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of Object.values(rec.by || {})) {
      const key = mapMuscleId(m.id);
      if (!key) continue;
      out[key] = out[key] ? worstStatus(out[key], m.status) : m.status;
    }
    return out;
  }, [rec.by]);

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
        <button
          type="button"
          className="min-w-0 flex-1 text-left flex items-start gap-2 rounded-xl -m-1 p-1 hover:bg-panelHi/80 transition-colors"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text">
              Відновлення й фокус
            </h2>
            <p className="text-xs text-subtle mt-1 leading-snug">
              Колір на силуеті — готовність груп; чіпи — пріоритет після
              відпочинку.
            </p>
          </div>
          <span
            className="text-lg leading-none text-muted shrink-0 mt-0.5"
            aria-hidden
          >
            {open ? "▾" : "▸"}
          </span>
        </button>
        <Button
          variant="ghost"
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-subtle mb-3 mt-3">
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
              <p className="text-xs text-warning leading-snug">
                {rec.wellbeingMult >= 1.3
                  ? "Поганий сон або дуже низька енергія — відновлення значно сповільнене."
                  : "Недостатній сон або низька енергія — відновлення сповільнене."}{" "}
                М{"'"}язи потребують більше часу перед наступним навантаженням.
              </p>
            </div>
          )}

          <BodyAtlas
            statusByMuscle={statusByMuscle}
            height={120}
            showLegend={false}
          />

          <div className="mt-4 pt-3 border-t border-line">
            <SectionHeading as="p" size="xs" className="mb-2">
              Пріоритет після відпочинку
            </SectionHeading>
            <div className="flex flex-wrap gap-2">
              {focus.map((m) => (
                <span
                  key={m.id}
                  className="px-2.5 py-1 bg-success/10 text-success text-style-caption rounded-full border border-success/15"
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
                <span className="font-semibold text-warning">Почекати:</span>{" "}
                {avoid.map((x) => x.label).join(", ")}
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
