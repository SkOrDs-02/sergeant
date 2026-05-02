import { useCallback, useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { useLocalStorageState } from "@shared/hooks";
import { cn } from "@shared/lib/cn";
import { emitHubBus } from "@shared/lib/hubBus";
import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_MODULE_META,
  CAPABILITY_MODULE_ORDER,
  groupCapabilitiesByModule,
  searchCapabilities,
  type AssistantCapability,
  type CapabilityModule,
} from "@sergeant/shared";
import { CapabilityDetailModal } from "./components/CapabilityDetailModal";

// Per-module icon swatch — keeps each card visually anchored to its module
// brand without leaning on saturated fills behind body text. Opacity steps
// stay on the registered Tailwind scale (rule #8 in AGENTS.md).
const MODULE_SWATCH: Record<CapabilityModule, string> = {
  finyk: "bg-finyk/10 text-finyk-strong dark:bg-finyk/15",
  fizruk: "bg-fizruk/10 text-fizruk-strong dark:bg-fizruk/15",
  routine: "bg-routine/10 text-routine-strong dark:bg-routine/15",
  nutrition: "bg-nutrition/10 text-nutrition-strong dark:bg-nutrition/15",
  cross: "bg-brand/10 text-brand-strong dark:bg-brand/15",
  analytics: "bg-info/10 text-info-strong dark:bg-info/15",
  utility: "bg-panelHi text-muted",
  memory: "bg-accent/10 text-accent",
};

interface AssistantCataloguePageProps {
  onClose: () => void;
}

// AI-NOTE: bumping the suffix invalidates older shapes if we change semantics.
const COLLAPSED_GROUPS_LS_KEY = "assistant_catalogue_collapsed_v1";

const isCapabilityModule = (v: unknown): v is CapabilityModule =>
  typeof v === "string" &&
  (CAPABILITY_MODULE_ORDER as readonly string[]).includes(v);

const isCollapsedShape = (v: unknown): v is CapabilityModule[] =>
  Array.isArray(v) && v.every(isCapabilityModule);

/**
 * Send a chat message via the typed `hubBus.openChat` signal. Avoids
 * importing the chat module directly from this page (and the cycle that
 * would create).
 *
 * - `autoSend=true` ⇒ assistant sends the message immediately;
 * - `autoSend=false` ⇒ message is prefilled into the input, waiting for the
 *   user to add details and hit enter.
 */
function dispatchOpenChat(message: string, autoSend: boolean): void {
  emitHubBus("openChat", { message, autoSend });
}

export function AssistantCataloguePage({
  onClose,
}: AssistantCataloguePageProps) {
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<AssistantCapability | null>(null);
  // AI-CONTEXT: persisting collapsed groups (not expanded) keeps "everything
  // open" the default — adding a new module to the registry stays visible
  // until the user explicitly collapses it.
  const [collapsedModules, setCollapsedModules] = useLocalStorageState<
    CapabilityModule[]
  >(COLLAPSED_GROUPS_LS_KEY, [], { validate: isCollapsedShape });

  const filtered = useMemo(
    () => (query.trim() ? searchCapabilities(query) : ASSISTANT_CAPABILITIES),
    [query],
  );
  const groups = useMemo(() => groupCapabilitiesByModule(filtered), [filtered]);
  const isSearching = query.trim().length > 0;

  const collapsedSet = useMemo(
    () => new Set(collapsedModules),
    [collapsedModules],
  );
  // While searching we always show matches expanded so the user can read
  // results without re-toggling each section. The persisted state is left
  // untouched so the previous layout returns once the query is cleared.
  const isModuleCollapsed = (module: CapabilityModule) =>
    !isSearching && collapsedSet.has(module);

  const toggleModule = useCallback(
    (module: CapabilityModule) => {
      setCollapsedModules((prev) =>
        prev.includes(module)
          ? prev.filter((m) => m !== module)
          : [...prev, module],
      );
    },
    [setCollapsedModules],
  );

  const allCollapsed =
    groups.length > 0 && groups.every((g) => collapsedSet.has(g.module));

  const toggleAll = useCallback(() => {
    if (allCollapsed) {
      setCollapsedModules([]);
    } else {
      setCollapsedModules(CAPABILITY_MODULE_ORDER.slice());
    }
  }, [allCollapsed, setCollapsedModules]);

  const handleActivate = (cap: AssistantCapability) => {
    if (cap.requiresInput) {
      setDetail(cap);
      return;
    }
    onClose();
    dispatchOpenChat(cap.prompt, true);
  };

  const handleTryFromDetail = (cap: AssistantCapability) => {
    setDetail(null);
    onClose();
    dispatchOpenChat(cap.prompt, false);
  };

  const totalCount = ASSISTANT_CAPABILITIES.length;

  return (
    <div
      className="min-h-dvh bg-bg"
      style={{
        paddingTop: "max(1.25rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="max-w-2xl mx-auto px-5 pb-8 space-y-4">
        <div className="flex items-center gap-2 pt-6">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onClose}
            aria-label="Назад"
          >
            <Icon name="chevron-left" size={20} />
          </Button>
        </div>

        <Card variant="default" radius="lg" padding="lg">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="shrink-0 w-11 h-11 rounded-2xl bg-brand/10 text-brand-strong flex items-center justify-center dark:bg-brand/15"
            >
              <Icon name="sparkles" size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-style-title text-text leading-tight">
                Можливості асистента
              </h1>
              <p className="text-sm text-subtle mt-1 leading-relaxed">
                Усе, що вміє робити асистент ({totalCount} сценаріїв). Натисни
                картку щоб запустити або побачити приклади.
              </p>
            </div>
          </div>
        </Card>

        <CapabilityLegend />

        <div className="relative">
          <span
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
          >
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук — наприклад, «витрата», «звичка», «1RM»…"
            className="w-full bg-panel border border-line rounded-2xl pl-9 pr-3 py-3 text-sm text-text placeholder:text-subtle focus:outline-none focus-visible:border-brand-500/50 focus-visible:ring-2 focus-visible:ring-brand-500/30 shadow-card"
            aria-label="Пошук можливостей"
          />
        </div>

        {!isSearching && groups.length > 0 && (
          <div className="flex justify-end -mt-1">
            <button
              type="button"
              onClick={toggleAll}
              data-testid="catalogue-toggle-all"
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-semibold text-muted",
                "rounded-full px-2.5 py-1 hover:bg-panel hover:text-text transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
              )}
            >
              <Icon
                name={allCollapsed ? "chevron-down" : "chevron-up"}
                size={12}
                aria-hidden
              />
              {allCollapsed ? "Розгорнути все" : "Згорнути все"}
            </button>
          </div>
        )}

        {filtered.length === 0 && (
          <Card variant="flat" radius="lg" padding="xl">
            <p className="text-center text-subtle text-sm">
              Нічого не знайдено за «{query}». Спробуй інший термін.
            </p>
          </Card>
        )}

        <div className="space-y-3">
          {groups.map((g) => (
            <ModuleGroup
              key={g.module}
              module={g.module}
              capabilities={g.capabilities}
              collapsed={isModuleCollapsed(g.module)}
              onToggle={() => toggleModule(g.module)}
              onActivate={handleActivate}
            />
          ))}
        </div>
      </div>

      <CapabilityDetailModal
        capability={detail}
        onClose={() => setDetail(null)}
        onTryInChat={handleTryFromDetail}
      />
    </div>
  );
}

interface ModuleGroupProps {
  module: CapabilityModule;
  capabilities: readonly AssistantCapability[];
  collapsed: boolean;
  onToggle: () => void;
  onActivate: (cap: AssistantCapability) => void;
}

function ModuleGroup({
  module,
  capabilities,
  collapsed,
  onToggle,
  onActivate,
}: ModuleGroupProps) {
  const meta = CAPABILITY_MODULE_META[module];
  const headingId = `catalogue-module-${module}`;
  const listId = `catalogue-module-${module}-list`;
  const swatch = MODULE_SWATCH[module];
  return (
    <Card
      as="section"
      variant="default"
      radius="lg"
      padding="none"
      className="overflow-hidden"
      aria-labelledby={headingId}
    >
      <button
        type="button"
        onClick={onToggle}
        data-testid={`catalogue-module-${module}-toggle`}
        aria-expanded={!collapsed}
        aria-controls={listId}
        className={cn(
          "w-full flex items-center gap-3 text-left px-4 py-3",
          "hover:bg-panelHi/60 transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/45",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
            swatch,
          )}
        >
          <Icon name={meta.icon} size={18} />
        </span>
        <span className="flex-1 min-w-0">
          <span
            id={headingId}
            className="block text-base font-semibold text-text leading-tight"
          >
            {meta.title}
          </span>
          <span className="block text-xs text-subtle mt-0.5">
            {capabilities.length}{" "}
            {pluralizeUk(capabilities.length, [
              "сценарій",
              "сценарії",
              "сценаріїв",
            ])}
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={16}
          aria-hidden
          className={cn(
            "shrink-0 text-muted transition-transform",
            collapsed ? "-rotate-90" : "rotate-0",
          )}
        />
      </button>
      {!collapsed && (
        <ul id={listId} className="border-t border-line divide-y divide-line">
          {capabilities.map((cap) => (
            <li key={cap.id}>
              <CapabilityRow capability={cap} onActivate={onActivate} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Ukrainian plural form (1 / 2-4 / 5+) — used for the count subtitle on
// each module card. Kept inline because no existing util covers this.
function pluralizeUk(
  n: number,
  forms: readonly [string, string, string],
): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return forms[1];
  return forms[2];
}

interface CapabilityRowProps {
  capability: AssistantCapability;
  onActivate: (cap: AssistantCapability) => void;
}

function CapabilityRow({ capability, onActivate }: CapabilityRowProps) {
  return (
    <button
      type="button"
      data-testid={`catalogue-capability-${capability.id}`}
      onClick={() => onActivate(capability)}
      className={cn(
        "w-full text-left px-4 py-3",
        "hover:bg-panelHi/60 transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/45",
        "flex items-start gap-3",
      )}
    >
      <span
        aria-hidden
        className="shrink-0 w-9 h-9 rounded-xl bg-bg border border-line flex items-center justify-center text-text"
      >
        <Icon name={capability.icon} size={16} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-style-label text-text">{capability.label}</span>
          {capability.isNew && (
            <BadgeChip
              tone="success"
              icon="sparkles"
              label="Новинка"
              title="Нещодавно додана можливість"
            />
          )}
          {capability.isQuickAction && (
            <BadgeChip
              tone="brand"
              icon="zap"
              label="Чіп"
              title="Швидкий сценарій (показується chip-ом у чаті)"
            />
          )}
          {capability.risky && (
            <BadgeChip
              tone="warning"
              icon="alert-triangle"
              label="Ризик"
              title="Критична дія — скасувати не можна"
            />
          )}
        </span>
        <span className="block text-xs text-subtle mt-0.5">
          {capability.description}
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-subtle pt-1">
        <Icon
          name={capability.requiresInput ? "chevron-right" : "send"}
          size={14}
        />
      </span>
    </button>
  );
}

function CapabilityLegend() {
  return (
    <div
      data-testid="catalogue-legend"
      className={cn(
        "mb-4 bg-panel/60 border border-line rounded-2xl px-3 py-2.5",
        "flex flex-wrap items-center gap-x-3 gap-y-2",
      )}
      aria-label="Що означають позначки"
    >
      <span className="text-xs font-semibold text-muted">Позначки:</span>
      <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
        <BadgeChip tone="brand" icon="zap" label="ЧІП" />
        швидкий сценарій
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
        <BadgeChip tone="warning" icon="alert-triangle" label="РИЗИК" />
        критична дія
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
        <BadgeChip tone="success" icon="sparkles" label="НОВИНКА" />
        нещодавно додано
      </span>
    </div>
  );
}

interface BadgeChipProps {
  tone: "brand" | "warning" | "success";
  icon: string;
  label: string;
  title?: string;
}

function BadgeChip({ tone, icon, label, title }: BadgeChipProps) {
  const cls =
    tone === "brand"
      ? "text-brand-600 bg-brand-500/10 border-brand-500/40"
      : tone === "warning"
        ? "text-warning bg-warning/10 border-warning/40"
        : "text-success bg-success/10 border-success/40";
  return (
    <span
      title={title}
      className={cn(
        // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- BadgeChip is an intentional pill-overlay typography (status badge with border + icon)
        "inline-flex items-center gap-1 text-micro uppercase tracking-wide font-bold",
        "border rounded-full px-1.5 py-0.5",
        cls,
      )}
    >
      <Icon name={icon} size={10} aria-hidden />
      {label}
    </span>
  );
}

// Re-export module order for tests / future deep-links.
export { CAPABILITY_MODULE_ORDER };
