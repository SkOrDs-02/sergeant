// Showcase section — "Proposals · UI". Interactive mockups for the mobile /
// PWA UI ideas triaged as «може бути» (candidates, not yet accepted):
// UI-7 bottom sheet, UI-10 carousel indicators, UI-12 date scrubber,
// UI-14 multi-select, UI-15 keyboard accessory bar, UI-18 peek/expand.
//
// These are prototypes only — no wiring to real domain state. Theme is
// driven by the showcase header toggle (Light / Dark), so both themes are
// reviewable from here.
import { Sec } from "../_shared/primitives";
import { BottomSheetDemo } from "./proposals/BottomSheetDemo";
import { CarouselDotsDemo } from "./proposals/CarouselDotsDemo";
import { DateScrubberDemo } from "./proposals/DateScrubberDemo";
import { MultiSelectDemo } from "./proposals/MultiSelectDemo";
import { KeyboardAccessoryDemo } from "./proposals/KeyboardAccessoryDemo";
import { PeekExpandableDemo } from "./proposals/PeekExpandableDemo";
// Second review wave (triage 2026-07). IDs prefixed R2- and numbered to match
// the review proposal list so each card maps back to a triaged item.
import { KpiCarouselDemo } from "./proposals/KpiCarouselDemo";
import { StickySummaryDemo } from "./proposals/StickySummaryDemo";
import { SegmentedSheetFallbackDemo } from "./proposals/SegmentedSheetFallbackDemo";
import { DualRangeSliderDemo } from "./proposals/DualRangeSliderDemo";
import { ChipsFilterRowDemo } from "./proposals/ChipsFilterRowDemo";
import { WheelPickerDemo } from "./proposals/WheelPickerDemo";
import { TableToCardDemo } from "./proposals/TableToCardDemo";

export function ProposalsUISection() {
  return (
    <Sec
      id="proposals-ui"
      title="Proposals · UI (може бути)"
      intro="Інтерактивні мокапи ідей для мобільної / PWA-версії, які ще на розгляді. Це прототипи, без привʼязки до реальних даних. Перемикай тему в шапці, щоб оцінити обидва режими."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <BottomSheetDemo />
        <CarouselDotsDemo />
        <DateScrubberDemo />
        <MultiSelectDemo />
        <KeyboardAccessoryDemo />
        <PeekExpandableDemo />
      </div>

      <div className="mt-8 mb-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-style-caption uppercase tracking-wide text-muted">
          Друга хвиля · review 2026-07
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <KpiCarouselDemo />
        <StickySummaryDemo />
        <SegmentedSheetFallbackDemo />
        <DualRangeSliderDemo />
        <ChipsFilterRowDemo />
        <WheelPickerDemo />
        <TableToCardDemo />
      </div>
    </Sec>
  );
}
