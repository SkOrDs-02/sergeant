import { useCallback, useMemo, useState } from "react";
import { cn } from "@shared/lib/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { MEASURE_FIELDS, useMeasurements } from "../hooks/useMeasurements";
import { Card } from "@shared/components/ui/Card";
import { Stat } from "@shared/components/ui/Stat";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/undoToast";

const inp =
  "input-focus-fizruk w-full h-11 rounded-2xl border border-line bg-panelHi px-4 text-text";

export function Measurements() {
  const { entries, addEntry, deleteEntry, restoreEntry } = useMeasurements();
  const toast = useToast();
  const handleDelete = useCallback(
    (id) => {
      const snapshot = entries.find((e) => e.id === id);
      if (!snapshot) return;
      deleteEntry(id);
      showUndoToast(toast, {
        msg: "Замір видалено",
        onUndo: () => restoreEntry(snapshot),
      });
    },
    [entries, deleteEntry, restoreEntry, toast],
  );
  const [form, setForm] = useState(() =>
    Object.fromEntries(MEASURE_FIELDS.map((f) => [f.id, ""])),
  );

  const latest = entries[0] || null;
  const deltas = useMemo(() => {
    const prev = entries[1] || null;
    if (!latest || !prev) return {};
    const out = {};
    for (const f of MEASURE_FIELDS) {
      const a = Number(latest[f.id]);
      const b = Number(prev[f.id]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const d = a - b;
      if (d === 0) continue;
      out[f.id] = d;
    }
    return out;
  }, [entries, latest]);

  const stats = useMemo(() => {
    const total = entries?.length || 0;
    const latestAt = latest?.at
      ? new Date(latest.at).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        })
      : "—";
    const filledLatest = latest
      ? MEASURE_FIELDS.filter(
          (f) => latest[f.id] != null && latest[f.id] !== "",
        ).length
      : 0;
    return { total, latestAt, filledLatest };
  }, [entries, latest]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-3">
        <a
          href="https://www.wikihow.com/Take-Body-Measurements"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 bg-panel border border-line rounded-2xl p-4 shadow-card"
        >
          <div className="shrink-0 w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <div className="min-w-0">
            <SectionHeading as="div" size="sm">
              Мануал
            </SectionHeading>
            <div className="text-sm font-semibold text-success mt-0.5">
              Як правильно робити заміри →
            </div>
          </div>
        </a>

        <div className="grid grid-cols-3 gap-2">
          <Card radius="lg" padding="sm">
            <Stat
              label="Записів"
              value={stats.total}
              size="sm"
              align="center"
            />
          </Card>
          <Card radius="lg" padding="sm">
            <Stat
              label="Останній"
              value={
                <span className="text-sm font-bold">{stats.latestAt}</span>
              }
              size="sm"
              align="center"
            />
          </Card>
          <Card radius="lg" padding="sm">
            <Stat
              label="Полів"
              value={stats.filledLatest}
              size="sm"
              align="center"
            />
          </Card>
        </div>

        <Card radius="lg">
          <SectionHeading as="div" size="sm" className="mb-3">
            Додати замір
          </SectionHeading>
          <div className="grid grid-cols-2 gap-2">
            {MEASURE_FIELDS.map((f) => (
              <div key={f.id} className="space-y-1">
                <SectionHeading as="div" size="xs" className="px-1">
                  {f.label} · {f.unit}
                </SectionHeading>
                <input
                  className={inp}
                  inputMode="decimal"
                  placeholder="—"
                  value={form[f.id]}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, [f.id]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button
              type="button"
              className="w-full py-4 rounded-full font-bold text-base bg-fizruk-strong text-white transition-[background-color,box-shadow,opacity,transform] active:scale-[0.98]"
              onClick={() => {
                const payload = {};
                for (const f of MEASURE_FIELDS) {
                  const v = (form[f.id] || "").trim();
                  if (v) payload[f.id] = Number(v.replace(",", "."));
                }
                addEntry(payload);
                setForm(
                  Object.fromEntries(MEASURE_FIELDS.map((f) => [f.id, ""])),
                );
              }}
            >
              Зберегти замір
            </button>
          </div>
        </Card>

        {latest && (
          <Card radius="lg">
            <div className="flex items-center justify-between">
              <div>
                <SectionHeading as="div" size="sm">
                  Останній замір{" "}
                  <span className="ml-1 normal-case tracking-normal font-medium text-subtle">
                    · {stats.latestAt}
                  </span>
                </SectionHeading>
              </div>
              <div className="text-xs text-subtle">
                {Object.keys(deltas).length ? "Δ від попереднього" : ""}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {MEASURE_FIELDS.map((f) => (
                <div
                  key={f.id}
                  className="bg-bg border border-line rounded-2xl p-3"
                >
                  <SectionHeading as="div" size="xs">
                    {f.label}
                  </SectionHeading>
                  <div className="text-lg font-extrabold tabular-nums text-text mt-1">
                    {Number.isFinite(Number(latest[f.id]))
                      ? Number(latest[f.id]).toLocaleString("uk-UA")
                      : "—"}{" "}
                    {f.unit}
                  </div>
                  {deltas[f.id] != null && (
                    <div
                      className={cn(
                        "text-xs font-semibold mt-1",
                        deltas[f.id] > 0 ? "text-warning" : "text-success",
                      )}
                    >
                      {deltas[f.id] > 0 ? "+" : ""}
                      {deltas[f.id].toFixed(1)} {f.unit}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card radius="lg" padding="none" className="overflow-hidden">
          <div className="px-4 py-3 bg-panelHi/60 border-b border-line">
            <SectionHeading as="div" size="sm">
              Історія
            </SectionHeading>
          </div>
          {(entries || []).map((e) => (
            <div
              key={e.id}
              className="px-4 py-3 border-b border-line last:border-0"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-text">
                  {new Date(e.at).toLocaleDateString("uk-UA", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                <button
                  className="text-xs text-danger/80 hover:text-danger"
                  onClick={() => handleDelete(e.id)}
                >
                  Видалити
                </button>
              </div>
              <div className="text-xs text-subtle mt-1">
                {MEASURE_FIELDS.filter((f) => e[f.id] != null && e[f.id] !== "")
                  .slice(0, 4)
                  .map(
                    (f) =>
                      `${f.label}: ${Number(e[f.id]).toLocaleString("uk-UA")} ${f.unit}`,
                  )
                  .join(" · ") || "—"}
              </div>
            </div>
          ))}
          {(entries || []).length === 0 && (
            <EmptyState
              compact
              title="Поки замірів немає"
              description="Додай перший запис, щоб бачити динаміку показників."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
