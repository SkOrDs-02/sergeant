import { useEffect, useMemo, useRef, useState } from "react";
import { type User } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Tabs } from "@shared/components/ui/Tabs";
import { AIDigestSection } from "../settings/AIDigestSection";
import { AssistantCatalogueSection } from "../settings/AssistantCatalogueSection";
import { DashboardSection } from "../settings/DashboardSection";
import { DataExportSection } from "../settings/DataExportSection";
import { ExperimentalSection } from "../settings/ExperimentalSection";
import { FinykSection } from "../settings/FinykSection";
import { FizrukSection } from "../settings/FizrukSection";
import { GeneralSection } from "../settings/GeneralSection";
import { NotificationsSection } from "../settings/NotificationsSection";
import { NutritionSection } from "../settings/NutritionSection";
import { PlanSection } from "../settings/PlanSection";
import { PrivacySection } from "../settings/PrivacySection";
import { PWASection } from "../settings/PWASection";
import { RoutineSection } from "../settings/RoutineSection";

interface SettingsSection {
  id: string;
  title: string;
  keywords: string;
  render: () => React.JSX.Element;
}

// Group definitions: each tab collects related sections. Search terms are
// used for fuzzy search-by-keyword; matches fall back to showing every
// section that contains the term.
const GROUPS = [
  {
    id: "general",
    label: "Загальні",
    sections: [
      "dashboard",
      "general",
      "plan",
      "notifications",
      "ai",
      "assistant",
    ],
  },
  {
    id: "modules",
    label: "Розділи",
    sections: ["routine", "fizruk", "finyk", "nutrition"],
  },
  {
    id: "advanced",
    label: "Додатково",
    sections: ["privacy", "pwa", "dataExport", "experimental"],
  },
] as const;

function readSettingsSectionHash() {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw.startsWith("settings-")) return null;
  return raw.replace(/^settings-/, "");
}

function groupForSection(sectionId: string | null) {
  if (!sectionId) return undefined;
  return GROUPS.find((group) =>
    (group.sections as readonly string[]).includes(sectionId),
  );
}

/**
 * Read the active inner-tab from `?group=…`. Returns the group id only if
 * it matches a known `GROUPS[].id`; anything else (missing / malformed /
 * unknown) returns `null` so the caller falls back to the default
 * resolution chain (hash → "general"). Kept in module scope so the SSR
 * guard and validation stay co-located with `GROUPS`.
 */
function readSettingsGroupParam(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = new URLSearchParams(window.location.search).get("group");
    if (!raw) return null;
    if (GROUPS.some((group) => group.id === raw)) return raw;
  } catch {
    /* SSR / non-browser */
  }
  return null;
}

/**
 * Mirror the active inner-tab to `?group=…` via `history.replaceState` so
 * a reload / share keeps the user on the same group. We strip the param
 * for the default group (`general`) to keep the canonical URL clean for
 * the common case. `replaceState` (not `pushState`) is intentional —
 * clicking a tab strip shouldn't grow the browser history stack.
 */
function writeSettingsGroupParam(groupId: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (groupId === "general") {
    url.searchParams.delete("group");
  } else {
    url.searchParams.set("group", groupId);
  }
  if (url.toString() !== window.location.href) {
    window.history.replaceState(null, "", url.toString());
  }
}

export interface HubSettingsPageProps {
  user: User | null;
}

export function HubSettingsPage({ user }: HubSettingsPageProps) {
  // Resolution order on mount: explicit `?group=…` wins (shareable
  // deep-links) → hash-section's parent group (existing legacy path
  // from Bento `Налаштування` deep-links) → "general" default.
  const [tab, setTabRaw] = useState<string>(() => {
    const fromQuery = readSettingsGroupParam();
    if (fromQuery) return fromQuery;
    const sectionId = readSettingsSectionHash();
    return groupForSection(sectionId)?.id ?? "general";
  });
  const setTab = (next: string) => {
    setTabRaw(next);
    writeSettingsGroupParam(next);
  };
  const [query, setQuery] = useState("");
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [hashSectionId, setHashSectionId] = useState<string | null>(
    readSettingsSectionHash,
  );

  // Sections with the keywords a user might type to find them. The labels
  // match the <h3>/<h4> headings used by each Section component.
  const sections = useMemo(
    () => [
      {
        id: "dashboard",
        title: "Дашборд",
        keywords:
          "дашборд dashboard підказки щільність density вигляд активні модулі порядок упорядкувати reorder hide inactive приховати",
        render: () => <DashboardSection />,
      },
      {
        id: "general",
        title: "Загальні",
        keywords:
          "загальні онбординг onboarding welcome синхронізація акаунт sync cloud",
        render: () => <GeneralSection user={user} />,
      },
      {
        id: "plan",
        title: "Підписка та план",
        keywords:
          "план plan підписка subscription billing pro free trial trialing keruvaty stripe portal upgrade оплата",
        render: () => <PlanSection />,
      },
      {
        id: "notifications",
        title: "Нагадування",
        keywords:
          "сповіщення нагадування пуш push notifications reminders щоденні",
        render: () => <NotificationsSection />,
      },
      {
        id: "ai",
        title: "AI-дайджести",
        keywords:
          "ai штучний інтелект дайджест digest тижневий тренер coach insights",
        render: () => <AIDigestSection />,
      },
      {
        id: "assistant",
        title: "Можливості асистента",
        keywords:
          "асистент команди chat help допомога інструменти каталог можливості tools",
        render: () => <AssistantCatalogueSection />,
      },
      {
        id: "routine",
        title: "Рутина",
        keywords: "звички рутина habits streak ціль reset",
        render: () => <RoutineSection />,
      },
      {
        id: "fizruk",
        title: "Фізрук",
        keywords: "фізрук тренування кардіо вага workouts gym fitness",
        render: () => <FizrukSection />,
      },
      {
        id: "finyk",
        title: "Фінік",
        keywords:
          "фінанси фінік finyk monobank privatbank token api transactions budget",
        render: () => <FinykSection />,
      },
      {
        id: "nutrition",
        title: "Харчування",
        keywords:
          "харчування їжа nutrition meals food kбжу калорії kcal білки жири вуглеводи вода комора pantry скан штрихкод barcode",
        render: () => <NutritionSection />,
      },
      {
        id: "privacy",
        title: "Конфіденційність",
        keywords:
          "конфіденційність блокування pin пін lock security безпека захист",
        render: () => <PrivacySection />,
      },
      {
        id: "pwa",
        title: "PWA та офлайн",
        keywords:
          "pwa офлайн offline service worker sw кеш cache діагностика скинути reset",
        render: () => <PWASection />,
      },
      {
        id: "dataExport",
        title: "Експорт/імпорт JSON",
        keywords:
          "експорт імпорт export import json резервна копія backup hub дані data перенос",
        render: () => <DataExportSection />,
      },
      {
        id: "experimental",
        title: "Експериментальні",
        keywords: "experimental lab beta debug розробка розробник developer",
        render: () => <ExperimentalSection />,
      },
    ],
    [user],
  );

  const q = query.trim().toLowerCase();
  const matchesQuery = (s: SettingsSection): boolean =>
    !q ||
    s.title.toLowerCase().includes(q) ||
    s.keywords.toLowerCase().includes(q);

  const visibleSectionIds: string[] = q
    ? sections.filter(matchesQuery).map((s) => s.id)
    : [...(GROUPS.find((g) => g.id === tab)?.sections ?? [])];

  const visible = sections.filter((s) => visibleSectionIds.includes(s.id));
  const visibleSectionKey = visibleSectionIds.join("|");

  useEffect(() => {
    const syncHash = () => {
      const sectionId = readSettingsSectionHash();
      if (!sectionId) return;
      const group = groupForSection(sectionId);
      if (!group) return;
      setQuery("");
      setTab(group.id);
      setHashSectionId(sectionId);
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!hashSectionId) return;
    const el = refs.current[hashSectionId];
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [hashSectionId, visibleSectionKey]);

  return (
    <div className="flex flex-col gap-4 pt-3 pb-6">
      {/* Search and tabs header */}
      <div className="flex flex-col gap-3 sticky top-0 z-10 bg-bg/95 backdrop-blur-sm -mx-4 px-4 py-2 -mt-3">
        <label className="relative block">
          <span className="sr-only">Пошук по налаштуваннях</span>
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            <Icon name="search" size={18} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук налаштувань…"
            className="input-focus w-full min-h-[48px] pl-11 pr-11 py-3 bg-panel border border-line rounded-2xl text-base md:text-sm text-text placeholder:text-muted shadow-soft"
          />
          {query && (
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              onClick={() => setQuery("")}
              aria-label="Очистити пошук"
              className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-panelHi"
            >
              <Icon name="close" size={16} />
            </Button>
          )}
        </label>

        {!q && (
          <Tabs
            style="pill"
            variant="brand"
            fill
            ariaLabel="Групи налаштувань"
            items={GROUPS.map((g) => ({ value: g.id, label: g.label }))}
            value={tab}
            onChange={(v) => setTab(v)}
            className="overflow-x-auto border border-line shadow-soft"
          />
        )}
      </div>

      {/* Settings sections */}
      <div className="flex flex-col gap-4">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-12 h-12 rounded-full bg-panelHi flex items-center justify-center">
              <Icon name="search" size={24} className="text-muted" />
            </div>
            <p className="text-sm text-muted text-center">
              Нічого не знайдено за запитом «{query}»
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuery("")}
              className="text-brand"
            >
              Очистити пошук
            </Button>
          </div>
        ) : (
          visible.map((s) => (
            <div
              key={s.id}
              id={`settings-${s.id}`}
              data-search-keywords={`${s.title} ${s.keywords}`}
              ref={(el) => {
                refs.current[s.id] = el;
              }}
              // The Search + Tabs row above is `sticky top-0` (≈120-140px on
              // mobile/desktop). With `scroll-mt-4` (16px) the section title
              // landed *behind* that sticky chrome after `scrollIntoView`,
              // so deep-links like `#settings-dashboard` from the inactive
              // Bento card felt like they "just opened the Settings tab"
              // (issue 2026-05-08). 8rem clears the sticky header on every
              // viewport while still leaving a small visual gap above the
              // landed section.
              className="scroll-mt-32"
            >
              {s.render()}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
