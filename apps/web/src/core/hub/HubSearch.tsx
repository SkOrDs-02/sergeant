import { useState, useEffect, useRef, useMemo, startTransition } from "react";
import { useNavigate } from "react-router-dom";
import type { ModuleAccent } from "@sergeant/design-tokens";
import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_MODULE_META,
  type AssistantCapability,
} from "@sergeant/shared";
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

/**
 * `module` is the visual grouping/colour key. Real modules use the
 * `ModuleAccent` palette; the two pseudo-modules ("settings" and
 * "assistant") render with their own neutral swatches and route to a
 * different navigation target (`?tab=settings` / `/assistant`).
 */
type SearchSurface = ModuleAccent | "settings" | "assistant";

type Hit = {
  id: string;
  module: SearchSurface;
  moduleLabel: string;
  title: string;
  subtitle: string;
  icon: string;
  /** Where the hit dispatches when activated. */
  target:
    | { kind: "module"; moduleId: string }
    | { kind: "settings"; sectionId?: string }
    | { kind: "assistant"; capability?: AssistantCapability };
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
          target: { kind: "module", moduleId: "finyk" },
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
          target: { kind: "module", moduleId: "finyk" },
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
        target: { kind: "module", moduleId: "fizruk" },
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
        target: { kind: "module", moduleId: "fizruk" },
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
        target: { kind: "module", moduleId: "routine" },
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

// Settings sections — mirrors the catalogue declared in HubSettingsPage.tsx
// so a query like "експорт" surfaces "Експорт/імпорт JSON" directly from
// the global ⌘K palette, instead of forcing the user to first open
// Settings and then re-query inside its own search field.
//
// Keep `keywords` in sync with HubSettingsPage's `sections` table whenever
// new sections are added there. We deliberately don't import that array —
// it carries `render: () => <Section/>` closures that would drag a much
// larger render-time graph into the search modal's chunk.
const SETTINGS_INDEX: ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  keywords: string;
  icon: string;
}> = [
  {
    id: "dashboard",
    title: "Дашборд",
    description: "Підказки, щільність, активні модулі",
    keywords:
      "дашборд dashboard підказки щільність density вигляд активні модулі порядок упорядкувати reorder hide inactive приховати",
    icon: "layout-grid",
  },
  {
    id: "general",
    title: "Загальні",
    description: "Онбординг, акаунт, синхронізація",
    keywords:
      "загальні онбординг onboarding welcome синхронізація акаунт sync cloud",
    icon: "settings",
  },
  {
    id: "notifications",
    title: "Нагадування",
    description: "Push-нагадування і щоденні сповіщення",
    keywords: "сповіщення нагадування пуш push notifications reminders щоденні",
    icon: "bell",
  },
  {
    id: "ai",
    title: "AI-дайджести",
    description: "Тижневий тренер, insights",
    keywords:
      "ai штучний інтелект дайджест digest тижневий тренер coach insights",
    icon: "sparkles",
  },
  {
    id: "assistant",
    title: "Можливості асистента",
    description: "Каталог інструментів, які може запустити AI",
    keywords:
      "асистент команди chat help допомога інструменти каталог можливості tools",
    icon: "sparkles",
  },
  {
    id: "routine",
    title: "Рутина",
    description: "Звички, цілі, reset",
    keywords: "звички рутина habits streak ціль reset",
    icon: "check-circle",
  },
  {
    id: "fizruk",
    title: "Фізрук",
    description: "Тренування, кардіо, вага",
    keywords: "фізрук тренування кардіо вага workouts gym fitness",
    icon: "dumbbell",
  },
  {
    id: "finyk",
    title: "Фінік",
    description: "Інтеграції банків, бюджет",
    keywords:
      "фінанси фінік finyk monobank privatbank token api transactions budget",
    icon: "wallet",
  },
  {
    id: "nutrition",
    title: "Харчування",
    description: "Калорії, макроси, комора",
    keywords:
      "харчування їжа nutrition meals food kбжу калорії kcal білки жири вуглеводи вода комора pantry скан штрихкод barcode",
    icon: "utensils",
  },
  {
    id: "pwa",
    title: "PWA та офлайн",
    description: "Service worker, кеш, діагностика",
    keywords:
      "pwa офлайн offline service worker sw кеш cache діагностика скинути reset",
    icon: "wifi-off",
  },
  {
    id: "dataExport",
    title: "Експорт/імпорт JSON",
    description: "Резервна копія Hub, перенос даних",
    keywords:
      "експорт імпорт export import json резервна копія backup hub дані data перенос",
    icon: "download",
  },
  {
    id: "experimental",
    title: "Експериментальні",
    description: "Lab, beta, debug",
    keywords: "experimental lab beta debug розробка розробник developer",
    icon: "flask-conical",
  },
];

function searchSettings(tokens: string[]): Hit[] {
  const results: Hit[] = [];
  for (const section of SETTINGS_INDEX) {
    pushScored(
      results,
      {
        id: `settings_${section.id}`,
        module: "settings",
        moduleLabel: "Налаштування",
        title: section.title,
        // Включаємо keywords у subtitle, щоб scoreMatch могла "побачити"
        // токен на кшталт `monobank` всередині Finyk-секції без появи
        // самого слова в видимому описі.
        subtitle: `${section.description} · ${section.keywords}`,
        icon: section.icon,
        target: { kind: "settings", sectionId: section.id },
      },
      tokens,
      8,
    );
  }
  // Прибираємо keywords з видимого subtitle після scoring — інакше
  // картка перетворюється на заплутану мішанину тегів.
  return results
    .map((r) => ({
      ...r,
      subtitle:
        SETTINGS_INDEX.find((s) => `settings_${s.id}` === r.id)?.description ||
        r.subtitle,
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
}

function searchAssistantTools(tokens: string[]): Hit[] {
  const results: Hit[] = [];
  for (const cap of ASSISTANT_CAPABILITIES) {
    const moduleLabel = CAPABILITY_MODULE_META[cap.module]?.title ?? cap.module;
    pushScored(
      results,
      {
        id: `assistant_${cap.id}`,
        module: "assistant",
        moduleLabel: "AI-можливості",
        title: cap.label,
        // Subtitle містить опис + keywords + назву модуля — токени з
        // `keywords` беруть участь у scoring, але після сортування ми
        // показуємо тільки опис.
        subtitle: `${cap.description} · ${moduleLabel} · ${(cap.keywords ?? []).join(" ")} ${cap.examples.join(" ")}`,
        icon: cap.icon,
        target: { kind: "assistant", capability: cap },
      },
      tokens,
      8,
    );
  }
  return results
    .map((r) => {
      const cap = ASSISTANT_CAPABILITIES.find(
        (c) => `assistant_${c.id}` === r.id,
      );
      const moduleLabel = cap
        ? (CAPABILITY_MODULE_META[cap.module]?.title ?? cap.module)
        : "";
      return {
        ...r,
        subtitle: cap ? `${cap.description} · ${moduleLabel}` : r.subtitle,
      };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
}

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
          target: { kind: "module", moduleId: "nutrition" },
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
  // Order matters for the rendered groups (see `flat`/`grouped` below).
  // Module hits surface first because the user is far more likely to be
  // chasing concrete data; settings + AI capabilities follow as the
  // "what can I do?" surface.
  return [
    ...searchFinyk(tokens),
    ...searchFizruk(tokens),
    ...searchRoutine(tokens),
    ...searchNutrition(tokens),
    ...searchSettings(tokens),
    ...searchAssistantTools(tokens),
  ];
}

// Search-result chip wash + label per module. Each value uses the
// module's own theme-aware tokens (`bg-{m}-soft` is the
// `--c-{m}-soft` CSS var trio that flips per-theme; `text-{m}-strong`
// is the WCAG-AA companion at body sizes; `dark:text-{m}` falls back
// to the saturated DEFAULT step on dark panels). Equivalent to the
// Wave 1b token-swap recipe in `docs/design/DARK-MODE-AUDIT.md`.
//
// Settings + Assistant pseudo-modules share the neutral panel-tinted
// swatch so they read as "system" surfaces rather than competing for
// attention with module-coloured data.
const MODULE_COLORS: Record<string, string> = {
  finyk: "bg-finyk-soft text-finyk-strong dark:text-finyk",
  fizruk: "bg-fizruk-soft text-fizruk-strong dark:text-fizruk",
  routine: "bg-routine-soft text-routine-strong dark:text-routine",
  nutrition: "bg-nutrition-soft text-nutrition-strong dark:text-nutrition",
  settings: "bg-panelHi text-muted",
  assistant: "bg-brand-500/10 text-brand-strong dark:text-brand",
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
  // HubSearch is rendered inside the BrowserRouter (via HubModals → AppInner),
  // so it can navigate to the URL-addressable Settings tab and the Assistant
  // catalogue without plumbing extra callbacks through the modal stack.
  const navigate = useNavigate();

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
  // порядку рендеру, а не по groups-first). Settings + Assistant pseudo-
  // groups render last so the hot-path module hits stay at the top.
  const flat = useMemo(() => {
    const order = [
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
      "settings",
      "assistant",
    ];
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
    onClose();
    // `target` carries the navigation intent so we don't have to re-derive
    // it from `hit.module` (which is the visual grouping, not the route):
    //   - module hits  → existing onOpenModule plumbing
    //   - settings hit → URL-addressable settings tab (Settings page reads
    //                    `?tab=settings` via useHubUIState); section deep-
    //                    linking can be wired in a follow-up once the
    //                    settings page exposes a section anchor API
    //   - assistant hit→ the full /assistant catalogue route. We don't
    //                    auto-fire the chat here (capability.requiresInput
    //                    handling lives in the catalogue page) so the user
    //                    keeps a chance to read the description first.
    switch (hit.target.kind) {
      case "module":
        onOpenModule(hit.target.moduleId);
        break;
      case "settings": {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", "settings");
        navigate({
          pathname: url.pathname || "/",
          search: url.search,
        });
        break;
      }
      case "assistant":
        navigate("/assistant");
        break;
    }
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
                the user can browse/filter there instead of refining here.
                Settings + Assistant pseudo-modules cap at 5 hits and don't
                expose a "browse all" entry point from this list, so we
                only render the saturation footer for real modules. */}
            {group.items.length >= 10 &&
              moduleId !== "settings" &&
              moduleId !== "assistant" && (
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
                  <span>
                    Показано {group.items.length} — відкрити {group.label}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
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
