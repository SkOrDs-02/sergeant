/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { BodyAtlas } from "./BodyAtlas";
import { buildAtlasData } from "../lib/atlasData";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useRecovery } from "../hooks/useRecovery";
import { useReplicaFreshness } from "../hooks/useReplicaFreshness";
import { RecoveryHonestyNotes } from "./RecoveryHonestyNotes";

export function RecoveryFocusCard({
  onOpenAtlas,
}: {
  onOpenAtlas?: () => void;
}) {
  const rec = useRecovery();
  const freshness = useReplicaFreshness();
  const { musclesUk } = useExerciseCatalog();
  // AI-CONTEXT: V-10 (fizruk deep audit, 2026-08-07) — «Відновлення й
  // фокус» is the module's canonical feature (canon fizruk §4), but it
  // used to render collapsed by default AND after the entry form on the
  // `Body` page. Both defaults fought the same priority: a returning user
  // saw a blank form before anything about recovery. Open-by-default here
  // is the other half of the fix — see the render order in `Body.tsx`.
  const [open, setOpen] = useState(true);

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
        {/* AI-CONTEXT: `<h2>` wraps the WHOLE toggle button (WAI-ARIA
            disclosure/accordion pattern) instead of living inside it — a
            heading nested inside a native `<button>` loses its heading
            semantics for most AT (defect #2). `contents` drops the h2's
            own box so it doesn't affect the flex layout; `block` on the
            former-heading text keeps the description paragraph below it
            on its own line (no longer implicit from `<h2>` being a block
            element by default). */}
        <h2 className="contents">
          <button
            type="button"
            className="focus-ring min-w-0 flex-1 text-left flex items-start gap-2 rounded-xl px-2 py-2 -mx-2 -my-2 hover:bg-panelHi/80 active:bg-panelHi transition-colors"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <span
              aria-hidden
              className={cn(
                "inline-flex items-center justify-center w-5 h-5 mt-0.5 rounded-md text-muted shrink-0 transition-transform",
                open ? "rotate-180" : "rotate-0",
              )}
            >
              <Icon name="chevron-down" size="md" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-style-title text-text">
                Відновлення й фокус
              </span>
              <p className="text-style-caption text-muted mt-1 leading-snug">
                Колір на силуеті – готовність груп; чіпи – пріоритет після
                відпочинку.
              </p>
            </div>
          </button>
        </h2>
        <Button
          variant="fizruk-soft"
          size="sm"
          // AI-DANGER: розмір контрола на `Button`, не текст — див.
          // той самий випадок у WorkoutCatalogSection.

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

          {/*
            Межі поради йдуть ПЕРЕД самою порадою: якщо картина неповна,
            людина має дізнатись про це до того, як прочитає «готово».
          */}
          <RecoveryHonestyNotes
            freshness={freshness}
            wellbeing={rec.wellbeingSignal}
          />

          {rec.wellbeingMult > 1.1 && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-warning/10 border border-warning/25 flex items-start gap-2">
              <Icon
                name="moon"
                size={16}
                className="shrink-0 text-warning-strong dark:text-warning"
                aria-hidden
              />
              <p className="text-style-caption text-warning-strong dark:text-warning leading-snug">
                {rec.wellbeingMult >= 1.3
                  ? "Поганий сон або дуже низька енергія, відновлення значно сповільнене."
                  : "Недостатній сон або низька енергія, відновлення сповільнене."}{" "}
                Мʼязи потребують більше часу перед наступним навантаженням.
              </p>
            </div>
          )}

          {/*
            Клікабельний лише силует, і кнопку ставить сам `BodyAtlas`
            (проп `onOpenFull`). Тут раніше стояла обгортка-`<button>`
            навколо ВСЬОГО компонента — разом із перемикачем «Спереду/Ззаду»
            всередині. Кнопка в кнопці: тап по «Ззаду» гортав бік, клік
            спливав до обгортки, і людину одразу викидало на сторінку
            Атласа — тобто гортати мініатюру на місці було неможливо
            (скарга власника 2026-08-08).
          */}
          <BodyAtlas data={atlasData} compact onOpenFull={onOpenAtlas} />

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
                <span className="text-style-caption text-muted">
                  Додай завершені тренування, зʼявиться пріоритет груп.
                </span>
              )}
            </div>
            {avoid.length > 0 && (
              <p className="text-style-caption text-muted mt-3 leading-relaxed">
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
