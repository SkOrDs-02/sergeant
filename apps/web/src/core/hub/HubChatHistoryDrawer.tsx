/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import {
  getKyivDateParts,
  getKyivDayKey,
  getKyivShortDateStamp,
  isSameKyivDay,
  parseKyivDate,
} from "@shared/lib/time/kyivTime";
import type { HubChatSession } from "./hubChatSessions";

interface HubChatHistoryDrawerProps {
  open: boolean;
  sessions: HubChatSession[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

function formatStamp(ts: number): string {
  // "Today" / "older" decision in Kyiv local time so users abroad don't
  // see drawer entries jump days (consolidated page-audit § Theme 1 — 03 F2).
  if (isSameKyivDay(ts)) {
    const { hour, minute } = getKyivDateParts(ts);
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return getKyivShortDateStamp(ts);
}

function userMessageCount(s: HubChatSession): number {
  return s.messages.filter((m) => m.role === "user").length;
}

/**
 * Остання змістовна репліка бесіди — те, за чим її впізнають, коли
 * заголовки схожі («Бесіда від 3 вер.» × 3). Помилки-збої пропускаємо:
 * «Асистент зараз недоступний» нічого не каже про саму бесіду.
 */
function lastSnippet(s: HubChatSession): string | null {
  for (let i = s.messages.length - 1; i >= 0; i -= 1) {
    const m = s.messages[i];
    if (!m || m.error) continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = m.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    return m.role === "user" ? `Ти: ${text}` : text;
  }
  return null;
}

type DayGroup = "today" | "yesterday" | "earlier";

const GROUP_LABEL: Record<DayGroup, string> = {
  today: "Сьогодні",
  yesterday: "Вчора",
  earlier: "Раніше",
};

const GROUP_ORDER: DayGroup[] = ["today", "yesterday", "earlier"];

/**
 * Ключ попередньої київської доби. Не `now - 24h`: у день переходу на
 * літній час доба має 23 години, і о 00:15 30 березня «мінус доба» дає
 * 28-ме — учорашні бесіди випадали б у «Раніше» (ревʼю CodeRabbit,
 * PR #1075). Натомість беремо київську північ сьогоднішньої доби й
 * відступаємо на мілісекунду — остання мить учора незалежно від DST.
 */
function previousKyivDayKey(now: number): string {
  const midnight = parseKyivDate(getKyivDayKey(now));
  return getKyivDayKey(midnight ? midnight.getTime() - 1 : now);
}

function dayGroup(ts: number, now: number): DayGroup {
  if (isSameKyivDay(ts, now)) return "today";
  if (getKyivDayKey(ts) === previousKyivDayKey(now)) return "yesterday";
  return "earlier";
}

function sessionsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "бесіда";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "бесіди";
  return "бесід";
}

/**
 * Гейт відкриття. Сама панель — окремий компонент, який монтується лише
 * на відкритому списку: так «зараз» для груп «Сьогодні/Вчора» знімається
 * один раз на відкриття через `useState`-ініціалізатор, без `Date.now()`
 * у рендері (`react-hooks/purity`) і без `setState` в ефекті.
 */
export function HubChatHistoryDrawer({
  open,
  ...panelProps
}: HubChatHistoryDrawerProps) {
  if (!open) return null;
  return <HistoryPanel {...panelProps} />;
}

function HistoryPanel({
  sessions,
  activeId,
  onClose,
  onSelect,
  onCreate,
  onDelete,
}: Omit<HubChatHistoryDrawerProps, "open">) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape належить лише пастці фокусу: вона слухає `document` і віддає
  // клавішу верхньому діалогу стосу. Окремий window-слухач, що був тут,
  // закривав список удруге і навіть з-під іншого діалогу.
  useDialogFocusTrap(true, panelRef, {
    onEscape: onClose,
    inertBackground: true,
  });

  // Sort newest-first by updatedAt so a freshly-touched session jumps
  // to the top, matching iOS Messages and Telegram conventions — then
  // bucket by Kyiv day so a long list reads as a timeline, not a wall.
  const [now] = useState(() => Date.now());

  const groups = useMemo(() => {
    const sorted = sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    const byGroup = new Map<DayGroup, HubChatSession[]>();
    for (const s of sorted) {
      const g = dayGroup(s.updatedAt, now);
      const bucket = byGroup.get(g);
      if (bucket) bucket.push(s);
      else byGroup.set(g, [s]);
    }
    return GROUP_ORDER.map((g) => ({
      key: g,
      label: GROUP_LABEL[g],
      items: byGroup.get(g) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [sessions, now]);

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      onDelete(id);
    },
    [onDelete],
  );

  const total = sessions.length;

  return (
    <div
      className="fixed inset-0 z-60 flex safe-area-pt-pb"
      role="dialog"
      aria-modal="true"
      aria-label="Історія чатів"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm motion-safe:animate-fade-in"
        onClick={onClose}
        aria-hidden
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        className="relative flex flex-col w-[88%] max-w-sm h-full bg-bg border-r border-line shadow-float motion-safe:animate-fade-in"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0"
              aria-hidden
            >
              <Icon name="sergeant" size={16} className="text-brand-500" />
            </div>
            <div className="min-w-0">
              <div className="text-style-title font-bold text-text leading-tight">
                Бесіди
              </div>
              <div className="text-style-caption text-muted leading-tight">
                {total === 0
                  ? "Поки порожньо"
                  : `${total} ${sessionsWord(total)} на цьому пристрої`}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onClose}
            aria-label="Закрити список бесід"
            className="text-muted hover:text-text"
          >
            <Icon name="close" size={18} />
          </Button>
        </div>

        <div className="px-3 pt-1 pb-3 shrink-0">
          {/* Головна дія списку — суцільна бренд-пігулка, як «Нова» в шапці
              чату, а не пунктирна рамка, яка читалась як плейсхолдер. */}
          <button
            type="button"
            onClick={() => {
              onCreate();
            }}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-brand-soft text-brand-strong border border-brand-soft-border/50 hover:bg-brand-soft-hover transition-colors text-style-label font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
          >
            <Icon name="plus" size={15} />
            Нова бесіда
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 text-center py-12 px-4">
              <div
                className="w-14 h-14 rounded-2xl bg-panelHi flex items-center justify-center"
                aria-hidden
              >
                <Icon name="message-circle" size={22} className="text-subtle" />
              </div>
              <div className="text-style-label text-text">
                Поки немає інших бесід.
              </div>
              <div className="text-style-body text-muted leading-snug max-w-[26ch]">
                Кожна нова розмова зʼявиться тут, щоб до неї можна було
                повернутись.
              </div>
            </div>
          ) : (
            groups.map((group) => (
              <section
                key={group.key}
                aria-label={group.label}
                className="mb-3 last:mb-0"
              >
                <h3 className="text-style-caption font-semibold uppercase tracking-wide text-subtle px-2 pt-1 pb-1.5">
                  {group.label}
                </h3>
                <ul className="space-y-1">
                  {group.items.map((s) => {
                    const isActive = s.id === activeId;
                    const msgs = userMessageCount(s);
                    const snippet = lastSnippet(s);
                    return (
                      <li key={s.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => onSelect(s.id)}
                          aria-current={isActive ? "true" : undefined}
                          className={cn(
                            "w-full flex items-start gap-3 pl-3 pr-12 py-2.5 rounded-2xl text-left transition-colors border outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
                            isActive
                              ? "bg-brand-soft border-brand-soft-border/60 text-text"
                              : "bg-panel/60 border-transparent hover:bg-panelHi text-text",
                          )}
                        >
                          {/* Активна бесіда позначена бренд-рискою зліва, а не
                              лише тоном фону: у темній темі тон губиться. */}
                          <span
                            className={cn(
                              "mt-1.5 w-1 self-stretch rounded-full shrink-0",
                              isActive ? "bg-brand-500" : "bg-transparent",
                            )}
                            aria-hidden
                          />
                          <span className="flex-1 min-w-0">
                            <span className="flex items-baseline justify-between gap-2">
                              <span
                                className={cn(
                                  "text-style-label truncate",
                                  isActive && "font-semibold",
                                )}
                              >
                                {s.title}
                              </span>
                              <span className="text-style-caption text-subtle shrink-0 tabular-nums">
                                {formatStamp(s.updatedAt)}
                              </span>
                            </span>
                            <span className="block text-style-caption text-muted mt-0.5 truncate">
                              {snippet ??
                                `${msgs} ${msgs === 1 ? "повідомлення" : "повідомлень"}`}
                            </span>
                          </span>
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          onClick={(e) => handleDelete(e, s.id)}
                          aria-label={`Видалити бесіду ${s.title}`}
                          title="Видалити"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-subtle sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 hover:text-danger hover:bg-danger/10"
                        >
                          <Icon name="trash" size={14} />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
