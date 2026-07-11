/**
 * Last validated: 2026-06-12
 * Status: Active
 */
import { useMemo } from "react";
import { BodyAtlas } from "../components/BodyAtlas";
import { buildAtlasData } from "../lib/atlasData";
import { useRecovery } from "../hooks/useRecovery";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";

export function Atlas() {
  const rec = useRecovery();

  // Memoized per `rec.by` so the SVG gets identity-stable input across
  // storage / BroadcastChannel ticks that don't change the recovery snapshot.
  const atlasData = useMemo(() => buildAtlasData(rec.by), [rec.by]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-3">
        <Card
          as="section"
          module="fizruk"
          prominence="hero"
          radius="r-2xl"
          padding="none"
          className="relative overflow-hidden"
          aria-label="Атлас мʼязів"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "var(--hero-grad-fizruk)", opacity: 0.08 }}
          />
          <div className="relative p-5">
            {/* «Чорнило» v3.1 § 3: overrides `variant="fizruk"`'s
                `text-fizruk-strong` light color (invisible on the new
                saturated hero gradient) with the theme-invariant
                hero-ink tone; the existing `dark:text-fizruk-300/70`
                already reads fine on the dark hero and stays. */}
            <SectionHeading
              size="sm"
              variant="fizruk"
              as="p"
              className="text-hero-ink/80"
            >
              Атлас мʼязів
            </SectionHeading>
            <h1 className="text-hero font-black text-hero-ink mt-2 leading-tight">
              Стан відновлення
            </h1>
            <p className="text-xs text-hero-ink/75 mt-2">
              Карта втоми, давності тренувань і обʼєму по групах мʼязів.
            </p>
          </div>
        </Card>

        <Card radius="lg" padding="lg">
          <BodyAtlas data={atlasData} />
        </Card>
      </div>
    </div>
  );
}
