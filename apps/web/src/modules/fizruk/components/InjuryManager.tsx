import { useState } from "react";
import {
  BODY_ATLAS_MUSCLE_IDS,
  INJURY_SITE_LABELS_UK,
  INJURY_ZONE_IDS,
  injurySiteLabelUk,
  type InjurySiteId,
} from "@sergeant/fizruk-domain/data";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { useToast } from "@shared/hooks/useToast";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { useInjuries } from "../hooks/useInjuries";

/**
 * Marking surface for the "не можна" model (ADR-0083).
 *
 * Muscles and joints render as two labelled groups rather than one flat list.
 * The joint half is the reason the model exists — a muscle-only keyspace
 * cannot name knee or shoulder pain — so burying it among 18 muscle chips
 * would hide exactly the sites people actually injure.
 */
export function InjuryManager() {
  const t = messages.fizruk.injuries;
  const { active, activeSites, mark, clear } = useInjuries();
  const toast = useToast();
  const [selected, setSelected] = useState<InjurySiteId[]>([]);
  const [busy, setBusy] = useState(false);

  /**
   * Зняти позначку травми. `clear` пише у local-first сховище і кидає лише
   * на квоті / зламаному JSON — обидва стани минущі, тож «Повторити» у
   * тості має сенс і не дублює жодної дії на екрані.
   */
  const clearInjury = (id: string) => {
    try {
      clear(id);
      toast.success(t.clearedToast);
    } catch {
      toast.error(t.clearFailedToast, undefined, {
        label: "Повторити",
        onClick: () => clearInjury(id),
      });
    }
  };

  /** Зберегти позначені сайти. Ті самі властивості, що й `clearInjury`. */
  const saveSelected = () => {
    setBusy(true);
    try {
      for (const site of selected) mark(site);
      setSelected([]);
      toast.success(t.savedToast);
    } catch {
      // `selected` не чистили — повтор працює з тим самим набором.
      toast.error(t.saveFailedToast, undefined, {
        label: "Повторити",
        onClick: () => saveSelected(),
      });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (site: InjurySiteId) => {
    setSelected((current) =>
      current.includes(site)
        ? current.filter((item) => item !== site)
        : [...current, site],
    );
  };

  const renderGroup = (label: string, sites: readonly InjurySiteId[]) => (
    <div className="space-y-2">
      <div className="text-style-caption text-subtle">{label}</div>
      <div className="flex flex-wrap gap-2">
        {sites.map((site) => {
          const already = activeSites.has(site);
          const checked = selected.includes(site);
          return (
            <button
              key={site}
              type="button"
              disabled={already || busy}
              aria-pressed={checked || already}
              className={cn(
                "min-h-[44px] rounded-full border px-3 py-2 text-style-caption transition-colors disabled:opacity-50",
                checked || already
                  ? "border-warning-strong bg-warning/15 text-warning-strong dark:text-warning"
                  : "border-line bg-bg text-muted hover:border-muted hover:text-text",
              )}
              onClick={() => toggle(site)}
            >
              {INJURY_SITE_LABELS_UK[site]}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Card radius="lg" padding="lg" className="space-y-3">
      <div>
        <SectionHeading as="h2" size="sm" variant="fizruk">
          {t.title}
        </SectionHeading>
        <p className="text-style-caption text-subtle mt-1">{t.description}</p>
      </div>

      {active.length > 0 && (
        <div className="space-y-2" aria-label={t.activeListLabel}>
          {active.map((injury) => (
            <div
              key={injury.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2"
            >
              <span className="text-style-body text-text">
                {injurySiteLabelUk(injury.site)}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => clearInjury(injury.id)}
              >
                {t.clearCta}
              </Button>
            </div>
          ))}
        </div>
      )}

      {renderGroup(t.groupMuscles, BODY_ATLAS_MUSCLE_IDS)}
      {renderGroup(t.groupZones, INJURY_ZONE_IDS)}

      <Button
        module="fizruk"
        className="w-full h-12"
        disabled={busy || selected.length === 0}
        onClick={saveSelected}
      >
        {t.submit}
      </Button>
    </Card>
  );
}
