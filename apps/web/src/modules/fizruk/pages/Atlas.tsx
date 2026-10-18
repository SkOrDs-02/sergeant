/**
 * Last validated: 2026-08-02
 * Status: Active
 */
import { useMemo } from "react";
import { BodyAtlas } from "../components/BodyAtlas";
import { InjurySection } from "../components/InjurySection";
import { buildAtlasData } from "../lib/atlasData";
import { useRecovery } from "../hooks/useRecovery";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";

interface AtlasProps {
  /** Перехід на «Моє тіло» — там живе єдиний пікер зон болю (див. шапку
   *  `InjurySection`). Тут секція лише читає активні позначки. */
  onOpenBody?: (() => void) | undefined;
  /**
   * Спека `fizruk-hero-recovery-bars.md` рішення 4 — атласна зона (або
   * зона травми), на яку веде тап по рядку hero. Прокинуто в
   * `<BodyAtlas>`, яка сама вирішує, чи вміє її підсвітити.
   */
  focusMuscleId?: string | undefined;
}

export function Atlas({ onOpenBody, focusMuscleId }: AtlasProps = {}) {
  const rec = useRecovery();

  // Memoized per `rec.by` so the SVG gets identity-stable input across
  // storage / BroadcastChannel ticks that don't change the recovery snapshot.
  const atlasData = useMemo(() => buildAtlasData(rec.by), [rec.by]);
  const hasData = Object.values(atlasData).some(
    (row) => row?.daysSince != null,
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Atlas is one of the two sub-pages (`FizrukApp.showBottomNav`)
          rendered without the module bottom nav, so the 88px
          `page-tabbar-pad` clearance meant for that chrome would just be
          dead space here. `safe-area-pb` still clears the iOS home
          indicator on standalone/PWA. */}
      <div className="max-w-4xl mx-auto px-5 pt-4 page-tabbar-pad space-y-7">
        <Card
          as="section"
          tone="fizruk"
          prominence={hasData ? "hero" : "panel"}
          padding="none"
          className="relative overflow-hidden"
          aria-label="Атлас мʼязів"
        >
          <div className="relative p-5">
            <SectionHeading
              size="xs"
              variant="fizruk"
              as="p"
              className={hasData ? "text-fizruk-tint-label" : "text-subtle"}
            >
              Атлас мʼязів
            </SectionHeading>
            <h1 className="text-style-headline font-black text-text mt-2 leading-tight">
              Стан відновлення
            </h1>
            <p className="text-style-body text-text mt-2">
              Карта втоми, давності тренувань і обʼєму по групах мʼязів.
            </p>
          </div>
        </Card>

        <Card padding="lg">
          <BodyAtlas data={atlasData} focusMuscleId={focusMuscleId} />
        </Card>

        <InjurySection onOpenBody={onOpenBody} />
      </div>
    </div>
  );
}
