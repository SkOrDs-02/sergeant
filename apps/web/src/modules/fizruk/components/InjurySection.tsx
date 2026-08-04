/**
 * Last validated: 2026-08-02
 * Status: Active
 *
 * «Що болить» — the entry point of the "не можна" model (ADR-0083).
 *
 * AI-CONTEXT: The zone list is deliberately split into «Суглоби й хребет» and
 * «Мʼязи», and the joint half is listed FIRST. Typical lifting injuries are
 * joints, and the muscle-only model that the atlas alone could express is the
 * exact failure audit E-4 documented — a user who can only reach muscles will
 * mark the wrong thing and believe they are protected.
 *
 * AI-DANGER: The copy here must never promise safety. The product does not
 * diagnose and does not treat (канон fizruk §5) — it only stops recommending
 * what overlaps a mark. Wording that implies more is a product bug, not a
 * style nit.
 */
import { useState } from "react";
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import {
  BODY_ATLAS_MUSCLE_IDS,
  BODY_ATLAS_MUSCLE_LABELS_UK,
  INJURY_ZONE_IDS,
  INJURY_ZONE_LABELS_UK,
  injurySiteLabelUk,
  type InjurySiteId,
} from "@sergeant/fizruk-domain/data";

import { messages } from "@shared/i18n/uk";

import { useInjuries } from "../hooks/useInjuries";

const t = messages.fizruk.injuries;

function formatSince(startedAt: string): string {
  const ts = Date.parse(startedAt);
  if (!Number.isFinite(ts)) return "";
  const days = Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
  if (days === 0) return t.today;
  if (days === 1) return t.yesterday;
  return `${days} дн. тому`;
}

export function InjurySection() {
  const { active, activeSites, mark, clear } = useInjuries();
  const [picking, setPicking] = useState(false);

  return (
    <Card as="section" radius="lg" padding="lg" aria-label={t.title}>
      <SectionHeading size="sm" variant="fizruk" as="h2">
        {t.title}
      </SectionHeading>

      {active.length === 0 ? (
        <p className="text-xs text-muted mt-2">{t.empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {active.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">
                  {injurySiteLabelUk(m.site)}
                </span>
                <span className="block text-xs text-muted">
                  {formatSince(m.startedAt)}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => clear(m.id)}
                aria-label={`${t.clearCta}: ${injurySiteLabelUk(m.site)}`}
              >
                {t.clearCta}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <Button
          size="sm"
          variant="secondary"
          module="fizruk"
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
        >
          {picking ? t.collapseCta : t.markCta}
        </Button>
      </div>

      {picking && (
        <div className="mt-3 space-y-3">
          <ZoneGroup
            title={t.groupZones}
            ids={INJURY_ZONE_IDS}
            labels={INJURY_ZONE_LABELS_UK}
            activeSites={activeSites}
            onPick={mark}
          />
          <ZoneGroup
            title={t.groupMuscles}
            ids={BODY_ATLAS_MUSCLE_IDS}
            labels={BODY_ATLAS_MUSCLE_LABELS_UK}
            activeSites={activeSites}
            onPick={mark}
          />
        </div>
      )}

      <p className="text-style-caption text-muted mt-4 leading-relaxed">
        {t.disclaimer}
      </p>
    </Card>
  );
}

function ZoneGroup({
  title,
  ids,
  labels,
  activeSites,
  onPick,
}: {
  title: string;
  ids: readonly string[];
  labels: Record<string, string>;
  activeSites: ReadonlySet<InjurySiteId>;
  onPick: (site: InjurySiteId) => void;
}) {
  return (
    <div>
      <p className="text-style-overline text-muted mb-2">{title}</p>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => {
          const marked = activeSites.has(id as InjurySiteId);
          return (
            <Button
              key={id}
              size="sm"
              variant={marked ? "primary" : "secondary"}
              module="fizruk"
              disabled={marked}
              onClick={() => onPick(id as InjurySiteId)}
              aria-label={
                marked
                  ? `${labels[id] ?? id} — ${t.markedSuffix}`
                  : `${t.markCta}: ${labels[id] ?? id}`
              }
            >
              {labels[id] ?? id}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
