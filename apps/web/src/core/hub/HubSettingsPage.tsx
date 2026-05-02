import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Tabs } from "@shared/components/ui/Tabs";
import { AIDigestSection } from "../settings/AIDigestSection";
import { AssistantCatalogueSection } from "../settings/AssistantCatalogueSection";
import { ExperimentalSection } from "../settings/ExperimentalSection";
import { FinykSection } from "../settings/FinykSection";
import { FizrukSection } from "../settings/FizrukSection";
import { GeneralSection } from "../settings/GeneralSection";
import { NotificationsSection } from "../settings/NotificationsSection";
import { NutritionSection } from "../settings/NutritionSection";
import { RoutineSection } from "../settings/RoutineSection";

// Group definitions: each tab collects related sections. Search terms are
// used for fuzzy search-by-keyword; matches fall back to showing every
// section that contains the term.
const GROUPS = [
  {
    id: "general",
    label: "Загальні",
    sections: ["general", "notifications", "ai", "assistant"],
  },
  {
    id: "modules",
    label: "Модулі",
    sections: ["routine", "fizruk", "finyk", "nutrition"],
  },
  {
    id: "advanced",
    label: "Додатково",
    sections: ["experimental"],
  },
];

function readSettingsSectionHash() {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw.startsWith("settings-")) return null;
  return raw.replace(/^settings-/, "");
}

function groupForSection(sectionId) {
  return GROUPS.find((group) => group.sections.includes(sectionId));
}

export function HubSettingsPage({ syncing, onSync, onPull, user }) {
  const [tab, setTab] = useState(() => {
    const sectionId = readSettingsSectionHash();
    return groupForSection(sectionId)?.id || "general";
  });
  const [query, setQuery] = useState("");
  const refs = useRef({});
  const [hashSectionId, setHashSectionId] = useState(readSettingsSectionHash);

  // Sections with the keywords a user might type to find them. The labels
  // match the <h3>/<h4> headings used by each Section component.
  const sections = useMemo(
    () => [
      {
        id: "general",
        title: "Інтерфейс і синхронізація",
        keywords:
          "загальні мова інтерфейс синхронізація акаунт sync cloud backup",
        render: () => (
          <GeneralSection
            syncing={syncing}
            onSync={onSync}
            onPull={onPull}
            user={user}
          />
        ),
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
        id: "experimental",
        title: "Експериментальні",
        keywords: "experimental lab beta debug розробка розробник developer",
        render: () => <ExperimentalSection />,
      },
    ],
    [syncing, onSync, onPull, user],
  );

  const q = query.trim().toLowerCase();
  const matchesQuery = (s) =>
    !q ||
    s.title.toLowerCase().includes(q) ||
    s.keywords.toLowerCase().includes(q);

  const visibleSectionIds = q
    ? sections.filter(matchesQuery).map((s) => s.id)
    : GROUPS.find((g) => g.id === tab)?.sections || [];

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
    <div className="flex flex-col gap-3 pt-2 pb-4">
      <div className="flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">Пошук по налаштуваннях</span>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук налаштувань"
            className="input-focus w-full min-h-[44px] pl-9 pr-10 py-3 bg-panelHi border border-line rounded-2xl text-[16px] md:text-sm text-text placeholder:text-muted"
          />
          {query && (
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              onClick={() => setQuery("")}
              aria-label="Очистити пошук"
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <Icon name="close" size={14} />
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
            className="overflow-x-auto border border-line"
          />
        )}
      </div>

      {visible.length === 0 ? (
        <div className="text-sm text-muted text-center py-6">
          Нічого не знайдено за запитом «{query}»
        </div>
      ) : (
        visible.map((s) => (
          <div
            key={s.id}
            id={`settings-${s.id}`}
            data-search-keywords={`${s.title} ${s.keywords}`}
            ref={(el) => (refs.current[s.id] = el)}
            className="scroll-mt-4"
          >
            {s.render()}
          </div>
        ))
      )}
    </div>
  );
}
