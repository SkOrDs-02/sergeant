import { useState, useEffect, useRef, useMemo, startTransition } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/cn";
import { Icon } from "@shared/components/ui/Icon";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { hapticTap } from "@shared/lib/haptic";
import {
  scoreMatch,
  tokenize,
  getRecentQueries,
  pushRecentQuery,
  clearRecentQueries,
} from "./hubSearchEngine";

// Module-level cache for parsed localStorage payloads. HubSearch runs
// `performSearch` on every debounced keystroke (2+ chars), which means
// without caching we would call `JSON.parse` on the entire Finyk tx
// cache (potentially several MB) every 120 ms while the user types.
// We cache the parsed value keyed by both the localStorage key AND the
// raw string; if either is stale we reparse. Different parsers on the
// same key (e.g. Fizruk workouts with their two variants) are tracked
// independently via a `parserId` slot.
const parseCache = new Map<
  string,
  { raw: string | null; parserId: string; value: unknown }
>();

function cachedParse<T>(
  cacheKey: string,
  parserId: string,
  raw: string | null,
  parse: (raw: string) => T,
  fallback: T,
): T {
  const hit = parseCache.get(cacheKey);
  if (hit && hit.parserId === parserId && hit.raw === raw) {
    return hit.value as T;
  }
  let value: T = fallback;
  if (raw) {
    try {
      value = parse(raw);
    } catch {
      value = fallback;
    }
  }
  parseCache.set(cacheKey, { raw, parserId, value });
  return value;
}

function safeParseLS<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  return cachedParse<T>(
    key,
    "json",
    raw,
    (r) => (JSON.parse(r) as T) ?? fallback,
    fallback,
  );
}

// Fizruk payloads are read as loose records (parent loops access
// `w.items`, `w.startedAt`, `e.muscles`, ...) so return them as
// `Record<string, any>[]` to match the existing call-sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseRecord = Record<string, any>;

function parseFizrukWorkouts(raw: string | null): LooseRecord[] {
  return cachedParse<LooseRecord[]>(
    "fizruk_workouts_v1",
    "fizrukWorkouts",
    raw,
    (r) => {
      const p = JSON.parse(r);
      if (Array.isArray(p)) return p as LooseRecord[];
      if (p && Array.isArray(p.workouts)) return p.workouts as LooseRecord[];
      return [];
    },
    [],
  );
}

function parseFizrukCustomExercises(raw: string | null): LooseRecord[] {
  return cachedParse<LooseRecord[]>(
    "fizruk_custom_exercises_v1",
    "fizrukExercises",
    raw,
    (r) => {
      const p = JSON.parse(r);
      if (Array.isArray(p)) return p as LooseRecord[];
      if (p && Array.isArray(p.exercises)) return p.exercises as LooseRecord[];
      return [];
    },
    [],
  );
}

function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Hit = {
  id: string;
  module: ModuleAccent;
  moduleLabel: string;
  title: string;
  subtitle: string;
  icon: string;
  _score: number;
};

function pushScored(
  acc: Hit[],
  base: Omit<Hit, "_score">,
  tokens: string[],
  limit: number,
) {
  const s = scoreMatch(base, tokens);
  if (s < 0) return acc.length >= limit;
  acc.push({ ...base, _score: s });
  return acc.length >= limit;
}

interface FinykTx {
  id?: string;
  time?: number;
  amount?: number;
  description?: string;
  comment?: string;
}

interface FinykSub {
  id?: string;
  name?: string;
  amount?: number;
}

function searchFinyk(tokens: string[]): Hit[] {
  const results: Hit[] = [];

  const txList = safeParseLS<FinykTx[]>("finyk_tx_cache", []);
  if (Array.isArray(txList)) {
    for (const tx of txList) {
      if (!tx || typeof tx !== "object") continue;
      const amtRaw = Number(tx.amount);
      const amount = (Number.isFinite(amtRaw) ? amtRaw : 0) / 100;
      const sign = amount < 0 ? "−" : "+";
      const time = tx.time ?? 0;
      const stop = pushScored(
        results,
        {
          id: `finyk_tx_${tx.id || time}`,
          module: "finyk",
          moduleLabel: "Фінік",
          title: tx.description || tx.comment || "Транзакція",
          subtitle: `${sign}${Math.abs(amount).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴ · ${time > 1e10 ? localDateKey(new Date(time)) : localDateKey(new Date(time * 1000))}`,
          icon: "💳",
        },
        tokens,
        20,
      );
      if (stop) break;
    }
  }

  const subs = safeParseLS<FinykSub[]>("finyk_subs", []);
  if (Array.isArray(subs)) {
    for (const s of subs) {
      if (!s || typeof s !== "object") continue;
      const amtRaw = Number(s.amount);
      const amt = Number.isFinite(amtRaw) && amtRaw > 0 ? amtRaw : 0;
      pushScored(
        results,
        {
          id: `finyk_sub_${s.id}`,
          module: "finyk",
          moduleLabel: "Фінік",
          title: s.name || "Підписка",
          subtitle: `Підписка · ${amt ? (amt / 100).toFixed(0) + " ₴" : ""}`,
          icon: "🔄",
        },
        tokens,
        25,
      );
    }
  }

  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

function searchFizruk(tokens: string[]): Hit[] {
  const results: Hit[] = [];

  const workouts = parseFizrukWorkouts(
    localStorage.getItem("fizruk_workouts_v1"),
  );
  for (const w of workouts) {
    if (!w || typeof w !== "object") continue;
    const itemsRaw = Array.isArray(w.items) ? w.items : [];
    const exNames = itemsRaw
      .slice(0, 2)
      .map((i) => (i && (i.exerciseName || i.name)) || "")
      .filter(Boolean);
    const dateLabel = w.startedAt ? localDateKey(new Date(w.startedAt)) : "";
    const combinedTitle = w.note || exNames.join(", ") || "Тренування";
    // subtitle додатково "розширює" текст усіма вправами, щоб токен
    // типу "присідання" знайшовся навіть коли він не в `note`.
    const fullTokensText = itemsRaw
      .map((i) => (i && (i.exerciseName || i.name)) || "")
      .filter(Boolean)
      .join(" ");
    const stop = pushScored(
      results,
      {
        id: `fizruk_w_${w.id}`,
        module: "fizruk",
        moduleLabel: "Фізрук",
        title: combinedTitle,
        subtitle:
          dateLabel +
          (itemsRaw.length
            ? ` · ${itemsRaw.length} вправ · ${fullTokensText}`
            : ""),
        icon: "🏋️",
      },
      tokens,
      10,
    );
    if (stop) break;
  }

  const exercises = parseFizrukCustomExercises(
    localStorage.getItem("fizruk_custom_exercises_v1"),
  );
  for (const e of exercises) {
    if (!e || typeof e !== "object") continue;
    const stop = pushScored(
      results,
      {
        id: `fizruk_ex_${e.id}`,
        module: "fizruk",
        moduleLabel: "Фізрук",
        title: e.name || "Вправа",
        subtitle:
          (Array.isArray(e.muscles) ? e.muscles : []).join(", ") ||
          "Власна вправа",
        icon: "💪",
      },
      tokens,
      15,
    );
    if (stop) break;
  }

  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

interface RoutineHabit {
  id?: string;
  name?: string;
  emoji?: string;
  archived?: boolean;
  recurrence?: string;
}

interface RoutineState {
  habits?: RoutineHabit[];
}

function searchRoutine(tokens: string[]): Hit[] {
  const results: Hit[] = [];
  const state = safeParseLS<RoutineState | null>("hub_routine_v1", null);
  if (!state) return results;

  const habits = Array.isArray(state.habits) ? state.habits : [];
  for (const h of habits) {
    if (!h || typeof h !== "object") continue;
    const title = `${h.emoji || ""} ${h.name || "Звичка"}`.trim();
    const stop = pushScored(
      results,
      {
        id: `routine_h_${h.id}`,
        module: "routine",
        moduleLabel: "Рутина",
        title,
        subtitle: h.archived ? "Архівовано" : h.recurrence || "daily",
        icon: "✅",
      },
      tokens,
      10,
    );
    if (stop) break;
  }
  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

interface NutritionMeal {
  id?: string;
  name?: string;
  items?: Array<{ name?: string; emoji?: string }>;
  note?: string;
  type?: string;
  macros?: { kcal?: number; protein?: number; fat?: number; carbs?: number };
}

interface NutritionDayLog {
  meals?: NutritionMeal[];
}

type NutritionLog = Record<string, NutritionDayLog>;

function searchNutrition(tokens: string[]): Hit[] {
  const results: Hit[] = [];
  const seen = new Set<string>();
  const log = safeParseLS<NutritionLog>("nutrition_log_v1", {});
  const dates = Object.keys(log).sort().reverse();

  for (const date of dates) {
    const dayLog = log[date] as NutritionDayLog | undefined;
    const meals = Array.isArray(dayLog?.meals) ? dayLog.meals : [];
    for (const m of meals) {
      if (!m || typeof m !== "object") continue;
      const key = m.name || `${date}_${m.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stop = pushScored(
        results,
        {
          id: `nutrition_m_${m.id || date}`,
          module: "nutrition",
          moduleLabel: "Харчування",
          title: m.name || "Прийом їжі",
          subtitle: `${date} · ${m.macros?.kcal ?? 0} ккал`,
          icon: "🥗",
        },
        tokens,
        10,
      );
      if (stop) break;
    }
    if (results.length >= 10) break;
  }
  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

function performSearch(query: string): Hit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  return [
    ...searchFinyk(tokens),
    ...searchFizruk(tokens),
    ...searchRoutine(tokens),
    ...searchNutrition(tokens),
  ];
}

// Search-result chip wash + label per module. Each value uses the
// module's own theme-aware tokens (`bg-{m}-soft` is the
// `--c-{m}-soft` CSS var trio that flips per-theme; `text-{m}-strong`
// is the WCAG-AA companion at body sizes; `dark:text-{m}` falls back
// to the saturated DEFAULT step on dark panels). Equivalent to the
// Wave 1b token-swap recipe in `docs/design/DARK-MODE-AUDIT.md`.
const MODULE_COLORS: Record<string, string> = {
  finyk: "bg-finyk-soft text-finyk-strong dark:text-finyk",
  fizruk: "bg-fizruk-soft text-fizruk-strong dark:text-fizruk",
  routine: "bg-routine-soft text-routine-strong dark:text-routine",
  nutrition: "bg-nutrition-soft text-nutrition-strong dark:text-nutrition",
};

interface HubSearchProps {
  onClose: () => void;
  onOpenModule: (moduleId: string) => void;
}

export function HubSearch({ onClose, onOpenModule }: HubSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => getRecentQueries());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setActiveIdx(0);
      return;
    }
    const timer = setTimeout(() => {
      const next = performSearch(query);
      // Wrap state updates in startTransition so the heavy localStorage
      // parse + scoring work doesn't block the input from accepting the
      // next keystroke. React can interrupt this low-priority update if
      // new input arrives.
      startTransition(() => {
        setResults(next);
        setActiveIdx(0);
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [query]);

  // Готуємо плоский список для keyboard-nav (↑/↓/Enter працюють по
  // порядку рендеру, а не по groups-first).
  const flat = useMemo(() => {
    const order = ["finyk", "fizruk", "routine", "nutrition"];
    return order.map((m) => results.filter((r) => r.module === m)).flat();
  }, [results]);

  const commitQuery = (q: string) => {
    if (!q.trim()) return;
    const next = pushRecentQuery(q);
    setRecents(next);
  };

  const openHit = (hit: Hit) => {
    hapticTap();
    commitQuery(query);
    onOpenModule(hit.module);
    onClose();
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        const hit = flat[activeIdx];
        if (hit) {
          e.preventDefault();
          openHit(hit);
        } else if (query.trim()) {
          commitQuery(query);
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // `openHit`/`commitQuery` are stable callbacks; `setActiveIdx` is a setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, activeIdx, onClose, query]);

  // Автоскрол до активного рядка при навігації клавіатурою.
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-hit-idx="${activeIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  const grouped = results.reduce<
    Record<string, { label: string; items: Hit[] }>
  >((acc, r) => {
    if (!acc[r.module]) acc[r.module] = { label: r.moduleLabel, items: [] };
    acc[r.module].items.push(r);
    return acc;
  }, {});

  const showRecents = query.trim().length < 2 && recents.length > 0;

  let runningIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-bg safe-area-pt-pb page-enter"
      role="dialog"
      aria-modal="true"
      aria-label="Глобальний пошук"
    >
      <div className="px-4 pt-4 pb-2 flex items-center gap-3 border-b border-line">
        <div className="flex-1 relative">
          <Icon
            name="search"
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            ref={inputRef}
            type="search"
            placeholder="Пошук по всіх модулях…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="hub-search-results"
            aria-activedescendant={
              flat[activeIdx] ? `hub-hit-${flat[activeIdx].id}` : undefined
            }
            aria-autocomplete="list"
            className="w-full h-11 pl-10 pr-4 rounded-2xl bg-panelHi border border-line text-text placeholder:text-muted text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-sm text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded-lg px-2 py-1"
        >
          Скасувати
        </button>
      </div>

      <div
        ref={listRef}
        id="hub-search-results"
        className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
        role="listbox"
      >
        {query.trim().length >= 2 && results.length === 0 && (
          <EmptyState
            icon={<Icon name="search" size={22} strokeWidth={1.6} />}
            title="Нічого не знайдено"
            description={`За запитом «${query}» нічого не знайшлося. Спробуй іншу фразу.`}
          />
        )}

        {showRecents && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <SectionHeading as="p" size="sm" variant="muted">
                Недавні запити
              </SectionHeading>
              <button
                type="button"
                onClick={() => {
                  clearRecentQueries();
                  setRecents([]);
                }}
                className="text-xs text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded-lg px-1.5 py-0.5"
              >
                Очистити
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recents.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setQuery(r);
                    inputRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-panelHi border border-line text-sm text-text hover:bg-line/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {!showRecents && query.trim().length < 2 && (
          <EmptyState
            icon={<Icon name="search" size={22} strokeWidth={1.6} />}
            title="Глобальний пошук"
            description={
              typeof navigator !== "undefined" &&
              /Mac|iPhone|iPad/.test(navigator.platform)
                ? "Транзакції, тренування, звички, їжа — все в одному місці. ⌘K, щоб відкрити звідусіль."
                : "Транзакції, тренування, звички, їжа — все в одному місці. Ctrl+K, щоб відкрити звідусіль."
            }
          />
        )}

        {Object.entries(grouped).map(([moduleId, group]) => (
          <div key={moduleId}>
            <SectionHeading as="p" size="sm" variant="muted" className="mb-1.5">
              {group.label}
            </SectionHeading>
            <div className="space-y-1">
              {group.items.map((item) => {
                runningIdx += 1;
                const isActive = runningIdx === activeIdx;
                return (
                  <button
                    key={item.id}
                    id={`hub-hit-${item.id}`}
                    data-hit-idx={runningIdx}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => openHit(item)}
                    onMouseEnter={() => setActiveIdx(runningIdx)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
                      isActive
                        ? "bg-panelHi ring-1 ring-brand-500/25"
                        : "hover:bg-panelHi active:bg-panelHi",
                    )}
                  >
                    <span
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0",
                        MODULE_COLORS[moduleId],
                      )}
                      aria-hidden
                    >
                      {item.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text truncate">{item.title}</p>
                      <p className="text-xs text-muted truncate">
                        {item.subtitle}
                      </p>
                    </div>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted/40 shrink-0"
                      aria-hidden
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                );
              })}
            </div>
            {/* When a module returns exactly 10 hits the list is saturated —
                there may be more results. Show a link to open the module so
                the user can browse/filter there instead of refining here. */}
            {group.items.length >= 10 && (
              <button
                type="button"
                onClick={() => {
                  hapticTap();
                  commitQuery(query);
                  onOpenModule(moduleId);
                  onClose();
                }}
                className="mt-1.5 w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-muted hover:text-text hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
              >
                <span>Показано {group.items.length} — відкрити {group.label}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
