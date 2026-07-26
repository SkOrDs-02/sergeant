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

export function ProposalsUISection() {
  return (
    <Sec
      id="proposals-ui"
      title="Proposals · UI (може бути)"
      intro="Інтерактивні мокапи ідей для мобільної / PWA-версії, які ще на розгляді. Це прототипи — без привʼязки до реальних даних. Перемикай тему в шапці, щоб оцінити обидва режими."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <BottomSheetDemo />
        <CarouselDotsDemo />
        <DateScrubberDemo />
        <MultiSelectDemo />
        <KeyboardAccessoryDemo />
        <PeekExpandableDemo />
      </div>
    </Sec>
  );
}
