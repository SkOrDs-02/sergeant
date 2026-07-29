import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * UI-18 — Peek + expandable dashboard sections.
 *
 * A module card shows only the first 2 rows plus a «ще N» affordance,
 * keeping the dashboard short. Tapping expands in place instead of
 * navigating away, so the overview stays scannable.
 */
const ITEMS = [
  { title: "Сільпо", meta: "Продукти", amount: "−420 ₴" },
  { title: "Uklon", meta: "Транспорт", amount: "−180 ₴" },
  { title: "Netflix", meta: "Підписки", amount: "−259 ₴" },
  { title: "Кава", meta: "Кафе", amount: "−95 ₴" },
  { title: "АТБ", meta: "Продукти", amount: "−310 ₴" },
  { title: "Аптека", meta: "Здоровʼя", amount: "−140 ₴" },
  { title: "Spotify", meta: "Підписки", amount: "−99 ₴" },
];
const PEEK = 2;

export function PeekExpandableDemo() {
  const [open, setOpen] = useState(false);
  const visible = open ? ITEMS : ITEMS.slice(0, PEEK);
  const hidden = ITEMS.length - PEEK;

  return (
    <ProposalCard
      id="UI-18"
      title="Розкривні секції з «peek»"
      intent="Картка показує 2 записи + «ще 5» і розгортається на місці, не ведучи вглиб."
    >
      <PhoneFrame>
        <div className="flex-1 min-h-0 px-4 pt-1">
          <div className="rounded-2xl border border-line bg-panel overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-line">
              <span className="h-6 w-6 rounded-md bg-finyk-soft text-finyk flex items-center justify-center">
                <Icon name="wallet" size={14} />
              </span>
              <span className="text-style-label text-text">
                Останні витрати
              </span>
              <span className="ml-auto text-2xs text-subtle tabular-nums">
                {ITEMS.length} шт
              </span>
            </div>

            <div className="divide-y divide-line">
              {visible.map((it) => (
                <div
                  key={it.title}
                  className="flex items-center gap-3 px-4 h-12"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-style-body text-text truncate">
                      {it.title}
                    </p>
                    <p className="text-2xs text-subtle">{it.meta}</p>
                  </div>
                  <span className="text-style-caption text-text tabular-nums">
                    {it.amount}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className={cn(
                "w-full h-11 flex items-center justify-center gap-1.5",
                "text-style-caption text-accent border-t border-line",
                "active:bg-panelHi",
              )}
              aria-expanded={open}
            >
              {open ? "Згорнути" : `Ще ${hidden}`}
              <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
            </button>
          </div>
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
