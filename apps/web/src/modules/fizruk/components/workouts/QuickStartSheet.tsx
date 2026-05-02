import { useEffect, useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Sheet } from "@shared/components/ui/Sheet";
import { cn } from "@shared/lib/cn";
import { useVisualKeyboardInset } from "@sergeant/shared";

/**
 * Two-step launcher for a new workout. Replaces the old standalone
 * "Тренування за шаблоном" tile + immediate "Почати тренування" CTA
 * combo on the Workouts landing.
 *
 *   step "choose" — user picks the path:
 *     • "За шаблоном"     → caller routes to the templates view.
 *     • "Підібрати вправи" → switches to step "pick".
 *
 *   step "pick"   — user multi-selects from the catalogue and confirms.
 *     The session (and its timer) is created by the caller only after
 *     `onConfirmExercises` fires, so the timer never starts before the
 *     user has at least one exercise lined up.
 *
 * Header/title updates per step so screen readers announce the change.
 *
 * The pick step renders the catalogue grouped by primary muscle group
 * (chest → back → shoulders → …) — the same canonical order as the
 * full Workouts catalog — so picking from a long list reads as the
 * familiar grouped catalogue and not as a flat random scroll. The
 * search input is kept sticky at the top of the body so it never
 * scrolls out of view.
 */

// Canonical primary-group order, mirrors `WorkoutCatalogSection` /
// `Workouts.tsx` `grouped` factory. Keep in sync if either side moves.
const PRIMARY_GROUP_ORDER = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quadriceps",
  "hamstrings",
  "calves",
  "glutes",
  "full_body",
  "cardio",
];

export function QuickStartSheet({
  open,
  onClose,
  exercises,
  search,
  primaryGroupsUk,
  onPickTemplate,
  onConfirmExercises,
}) {
  const [step, setStep] = useState("choose");
  const [q, setQ] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const kbInsetPx = useVisualKeyboardInset(open && step === "pick");

  // Reset to the chooser whenever the sheet is reopened.
  useEffect(() => {
    if (!open) {
      setStep("choose");
      setQ("");
      setSelectedIds(new Set());
    }
  }, [open]);

  const groups = useMemo(() => {
    if (step !== "pick") return [];
    const filtered = search(q);
    const m = new Map();
    for (const ex of filtered) {
      const gid = ex?.primaryGroup || "full_body";
      if (!m.has(gid)) m.set(gid, []);
      m.get(gid).push(ex);
    }
    return Array.from(m.entries())
      .sort((a, b) => {
        const ai = PRIMARY_GROUP_ORDER.indexOf(a[0]);
        const bi = PRIMARY_GROUP_ORDER.indexOf(b[0]);
        return (
          (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) ||
          a[0].localeCompare(b[0])
        );
      })
      .map(([gid, items]) => ({
        id: gid,
        label: (primaryGroupsUk && primaryGroupsUk[gid]) || gid,
        items,
      }));
  }, [search, q, step, primaryGroupsUk]);

  const totalCount = useMemo(
    () => groups.reduce((sum, g) => sum + g.items.length, 0),
    [groups],
  );

  const byId = useMemo(() => {
    const m = new Map();
    for (const ex of exercises || []) {
      if (ex?.id) m.set(ex.id, ex);
    }
    return m;
  }, [exercises]);

  const selectedCount = selectedIds.size;

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selectedCount === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const picks: any[] = [];
    for (const id of selectedIds) {
      const ex = byId.get(id);
      if (ex) picks.push(ex);
    }
    if (picks.length === 0) return;
    onConfirmExercises(picks);
  };

  if (step === "choose") {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Почати тренування"
        description="Обери шаблон або підбери вправи разово — таймер запуститься після вибору."
        closeLabel="Закрити вибір"
        panelClassName="fizruk-sheet"
        zIndex={90}
      >
        <div className="grid grid-cols-1 gap-2 pb-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onPickTemplate();
            }}
            className="rounded-2xl border border-line bg-panelHi p-4 text-left hover:border-muted active:scale-[0.99] transition"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                📋
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-style-label text-text">За шаблоном</div>
                <div className="text-xs text-subtle mt-0.5">
                  Готовий набір вправ — старт із заповненим списком.
                </div>
              </div>
              <span className="text-subtle" aria-hidden>
                ›
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStep("pick")}
            className="rounded-2xl border border-line bg-panelHi p-4 text-left hover:border-muted active:scale-[0.99] transition"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                💪
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-style-label text-text">
                  Підібрати вправи
                </div>
                <div className="text-xs text-subtle mt-0.5">
                  Обери вправи зараз і почни — без збереження шаблону.
                </div>
              </div>
              <span className="text-subtle" aria-hidden>
                ›
              </span>
            </div>
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Підібрати вправи"
      description={
        selectedCount > 0
          ? `Обрано: ${selectedCount} · натисни «Почати», щоб запустити таймер.`
          : "Познач хоча б одну вправу — таймер запуститься після старту."
      }
      closeLabel="Закрити підбір"
      kbInsetPx={kbInsetPx}
      panelClassName="fizruk-sheet"
      zIndex={90}
      headerRight={
        <Button
          variant="ghost"
          size="sm"
          className="h-9 min-h-[44px]"
          onClick={() => setStep("choose")}
          aria-label="Повернутись до вибору способу"
        >
          ← Назад
        </Button>
      }
      footer={
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            className="h-12 min-h-[44px] sm:flex-1"
            onClick={onClose}
          >
            Скасувати
          </Button>
          <Button
            className="h-12 min-h-[44px] sm:flex-1"
            onClick={handleConfirm}
            disabled={selectedCount === 0}
          >
            ▶︎ Почати
            {selectedCount > 0 ? ` · ${selectedCount}` : ""}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/*
         * Sticky-top so the search input stays anchored while the
         * user scrolls the (potentially long) grouped catalogue
         * instead of scrolling out of view together with the first
         * group's rows. Background matches the sheet panel so the
         * rounded-corner edge of the first group below it isn't
         * clipped through a translucent bar.
         */}
        <div className="sticky top-0 z-10 -mx-5 px-5 pt-1 pb-2 bg-panel">
          <Input
            placeholder="Пошук вправи…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Пошук вправи в каталозі"
          />
        </div>

        {totalCount === 0 ? (
          <div className="rounded-xl border border-line bg-panelHi p-4 text-center text-xs text-subtle">
            {q.trim()
              ? "Нічого не знайдено за цим запитом."
              : "Каталог поки що порожній."}
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.id} aria-label={g.label}>
                <SectionHeading
                  size="xs"
                  variant="subtle"
                  className="px-1 mb-1.5"
                  action={
                    <span className="text-meta text-muted normal-case tracking-normal font-normal">
                      {g.items.length}
                    </span>
                  }
                >
                  {g.label}
                </SectionHeading>
                <ul className="space-y-1.5">
                  {g.items.map((ex) => {
                    const id = ex.id;
                    const active = selectedIds.has(id);
                    const name = ex?.name?.uk || ex?.name?.en || id;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => toggle(id)}
                          aria-pressed={active}
                          className={cn(
                            "w-full text-left rounded-xl border p-3 min-h-[52px] flex items-center gap-3 transition-colors",
                            active
                              ? "border-brand-500 bg-brand-500/10"
                              : "border-line bg-bg hover:border-muted",
                          )}
                        >
                          <span
                            className={cn(
                              "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full border text-meta font-bold",
                              active
                                ? "bg-brand-strong border-brand-strong text-white"
                                : "border-line text-subtle",
                            )}
                            aria-hidden
                          >
                            {active ? "✓" : ""}
                          </span>
                          <span className="text-sm text-text truncate flex-1">
                            {name}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
