import { messages } from "@shared/i18n/uk";
import { useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { BodyAtlas } from "./BodyAtlas";
import { buildAtlasData } from "../lib/atlasData";
import { heatColor } from "../lib/atlasHeat";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useRecovery } from "../hooks/useRecovery";
import { useReplicaFreshness } from "../hooks/useReplicaFreshness";
import { RecoveryHonestyNotes } from "./RecoveryHonestyNotes";
import { useAuthOptional } from "../../../core/auth/AuthContext";
import { isSyncableUserId } from "../../../core/syncEngine/syncableUserId";

/** Підпис і інтенсивність шкали мапи: низ, середина, верх `heatColor`. */
const LEGEND: ReadonlyArray<readonly [string, number]> = [
  ["готово", 0.03],
  ["краще почекати", 0.5],
  ["рано", 1],
];

export function RecoveryFocusCard({
  onOpenAtlas,
}: {
  onOpenAtlas?: () => void;
}) {
  const rec = useRecovery();
  const freshness = useReplicaFreshness();
  const syncEnabled = isSyncableUserId(useAuthOptional()?.user?.id ?? "");
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
    <Card
      as="section"
      prominence={
        Object.values(rec.by).some((row) => row.lastAt != null) ||
        rec.avoid.length > 0
          ? "hero"
          : "panel"
      }
      tone="fizruk"
      aria-label="Відновлення та фокус тренування"
    >
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
            className="focus-ring min-w-0 flex-1 text-left flex items-start gap-2 rounded-lg px-2 py-2 -mx-2 -my-2 hover:bg-panelHi/80 active:bg-panelHi transition-colors"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <span className="block min-w-0 flex-1 text-style-title text-text">
              Відновлення й фокус
            </span>
            <span className="text-style-body text-muted">
              {open
                ? messages.fizruk.disclosure.hide
                : messages.fizruk.disclosure.show}
            </span>
          </button>
        </h2>
        <Button
          variant="outline"
          tone="neutral"
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
          {/*
            Клікабельний лише силует, і кнопку ставить сам `BodyAtlas`
            (проп `onOpenFull`). Тут раніше стояла обгортка-`<button>`
            навколо ВСЬОГО компонента, разом із перемикачем «Спереду/Ззаду»
            всередині. Кнопка в кнопці: тап по «Ззаду» гортав бік, клік
            спливав до обгортки, і людину одразу викидало на сторінку
            Атласа, тобто гортати мініатюру на місці було неможливо
            (скарга власника 2026-08-08).
          */}
          <div className="mt-3">
            <BodyAtlas data={atlasData} compact onOpenFull={onOpenAtlas} />
          </div>

          {/* Крапки тим самим `heatColor`, що й силует: статусні
              `bg-success/warning/danger` у темній темі розходились із
              chart-шкалою мапи (redesign v3.2, дрібне). */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-style-caption text-subtle mb-3 mt-3">
            {LEGEND.map(([label, value]) => (
              <span key={label} className="inline-flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-[3px]"
                  style={{ background: heatColor(value) ?? undefined }}
                />{" "}
                {label}
              </span>
            ))}
          </div>

          {/*
            Карта першою: на mobile межі поради стояли над силуетом і
            виштовхували його за перший екран. Жанр лишається видимим
            одним рядком одразу під легендою, до чіпів «пріоритет».
          */}
          <RecoveryHonestyNotes
            freshness={freshness}
            wellbeing={rec.wellbeingSignal}
            syncEnabled={syncEnabled}
          />

          {rec.wellbeingMult > 1.1 && (
            <div className="mb-3 px-3 py-2 rounded-panel bg-panelHi border border-line flex items-start gap-2">
              <p className="text-style-body text-text leading-snug">
                {rec.wellbeingMult >= 1.3
                  ? "Поганий сон або дуже низька енергія, відновлення значно сповільнене."
                  : "Недостатній сон або низька енергія, відновлення сповільнене."}{" "}
                Мʼязи потребують більше часу перед наступним навантаженням.
              </p>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-line">
            <SectionHeading as="p" size="xs" variant="fizruk" className="mb-2">
              Пріоритет після відпочинку
            </SectionHeading>
            <div className="flex flex-wrap gap-2">
              {focus.map((m) => (
                <span
                  key={m.id}
                  className="px-2.5 py-1 bg-panelHi text-text text-style-caption rounded-lg border border-line"
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
                <span className="font-semibold text-text">Почекати:</span>{" "}
                {avoid.map((x) => x.label).join(", ")}
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
