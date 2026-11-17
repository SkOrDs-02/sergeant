/**
 * Last validated: 2026-07-29
 * Status: Active
 */
import { useCallback, useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { ContentGroup } from "@shared/components/ui/ContentGroup";
import { Icon } from "@shared/components/ui/Icon";
import { MorphChevron } from "@shared/components/ui/MorphChevron";
import { useLocalStorageState } from "@shared/hooks";
import { cn } from "@shared/lib/ui/cn";
import { fieldFocus } from "@shared/components/ui/Input";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { messages } from "@shared/i18n/uk";
import { pluralUa } from "@sergeant/shared";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_MODULE_META,
  CAPABILITY_MODULE_ORDER,
  groupCapabilitiesByModule,
  isRecentCapability,
  searchCapabilities,
  type AssistantCapability,
  type CapabilityModule,
} from "@sergeant/shared";
import { CapabilityDetailModal } from "./components/CapabilityDetailModal";

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

  // UX-feedback 2026-05-08: previously a tap on a `requiresInput=false`
  // capability immediately closed the catalogue and dispatched the
  // prompt — the user only saw a blur (chat overlay opening) with no
  // explanation, examples, or "Спробувати" button. Now every capability
  // opens the same detail modal first; `requiresInput` only changes
  // whether the chat auto-sends the prompt or prefills it for editing.
  const handleActivate = (cap: AssistantCapability) => {
    setDetail(cap);
  };

  const handleTryFromDetail = (cap: AssistantCapability) => {
    setDetail(null);
    // AI-CONTEXT: keep `/assistant` mounted under the global chat sheet.
    // Calling `onClose()` navigates to Hub, whose route-change lifecycle
    // immediately dismisses the newly-opened overlay on real devices.
    // requiresInput=false ⇒ auto-send (no further details expected);
    // requiresInput=true ⇒ prefill so the user can finish the prompt.
    dispatchOpenChat(cap.prompt, !cap.requiresInput);
  };

  const totalCount = ASSISTANT_CAPABILITIES.length;

  return (
    <main
      id="main"
      tabIndex={-1}
      // `#root` is `100dvh; overflow:hidden` (base.css), so document scroll
      // is disabled — a full-height page must own its scroll container.
      // `min-h-dvh` relied on the now-removed body scroll, which clipped
      // the ~80-item catalogue with no way to reach the rest. Use `h-dvh`
      // (self-sufficient 100dvh) rather than `h-app-dvh` (=height:100%),
      // because this standalone route's wrappers have no definite height
      // for a percentage to resolve against.
      className="h-dvh overflow-y-auto overscroll-contain bg-bg outline-none"
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
            <Icon name="chevron-left" size="lg" />
          </Button>
        </div>

        <Card padding="lg">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-style-title text-text leading-tight">
                {messages.sergeant.capabilitiesSectionTitle}
              </h1>
              <p className="text-style-body text-subtle mt-1 leading-relaxed">
                Усе, що вміє робити Сержант ({totalCount}{" "}
                {pluralizeUk(totalCount, ["сценарій", "сценарії", "сценаріїв"])}
                ). Натисни картку щоб запустити або побачити приклади.
              </p>
            </div>
          </div>
        </Card>

        <CapabilityLegend
          showNew={ASSISTANT_CAPABILITIES.some((item) =>
            isRecentCapability(item.since),
          )}
        />

        <div className="relative">
          <input
            type="search"
            {...searchFieldProps("capabilities-search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук"
            className={cn(
              "w-full h-12 bg-panel border border-control rounded-lg px-3 text-style-body text-text placeholder:text-subtle outline-none",
              fieldFocus(false),
            )}
            aria-label="Пошук можливостей"
          />
        </div>

        {!isSearching && groups.length > 0 && (
          <div className="flex justify-end -mt-1">
            <Button
              variant="text"
              onClick={toggleAll}
              data-testid="catalogue-toggle-all"
            >
              {allCollapsed ? "Показати всі групи" : "Сховати всі групи"}
            </Button>
          </div>
        )}

        {filtered.length === 0 && (
          <Card padding="xl">
            <p className="text-center text-subtle text-style-body">
              Нічого не знайшов за «{query}». Спробуй інший термін.
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
    </main>
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
  return (
    <ContentGroup
      as="section"
      variant="bounded"
      className="overflow-hidden p-0"
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
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/45",
        )}
      >
        <span className="flex-1 min-w-0">
          <span
            id={headingId}
            className="block text-style-title font-semibold text-text leading-tight"
          >
            {meta.title}
          </span>
          <span className="block text-style-caption text-subtle mt-0.5">
            {capabilities.length}{" "}
            {pluralizeUk(capabilities.length, [
              "сценарій",
              "сценарії",
              "сценаріїв",
            ])}
          </span>
        </span>
        <MorphChevron open={!collapsed} className="text-subtle" />
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
    </ContentGroup>
  );
}

function pluralizeUk(
  n: number,
  forms: readonly [string, string, string],
): string {
  return pluralUa(n, { one: forms[0], few: forms[1], many: forms[2] });
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
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/45",
        "flex items-start gap-3",
      )}
    >
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-style-label text-text">{capability.label}</span>
          {isRecentCapability(capability.since) && (
            <BadgeChip
              tone="brand"
              label="Новинка"
              title="Нещодавно додана можливість"
            />
          )}
          {capability.isQuickAction && (
            <BadgeChip
              tone="brand"
              label="Чіп"
              title="Швидкий сценарій (показується chip-ом у чаті)"
            />
          )}
          {capability.risky && (
            <BadgeChip
              tone="warning"
              label="Ризик"
              title="Критична дія: скасувати не можна"
            />
          )}
        </span>
        <span className="block text-style-body text-subtle mt-0.5">
          {capability.description}
        </span>
      </span>
    </button>
  );
}

function CapabilityLegend({ showNew }: { showNew: boolean }) {
  return (
    <div
      data-testid="catalogue-legend"
      className={cn(
        "mb-4 bg-panel rounded-panel px-3 py-2.5",
        "flex flex-wrap items-center gap-x-3 gap-y-2",
      )}
      aria-label="Що означають позначки"
    >
      <span className="text-style-caption font-semibold text-muted">
        Позначки:
      </span>
      <span className="inline-flex items-center gap-1.5 text-style-caption text-subtle">
        <BadgeChip tone="brand" label="Чіп" />
        швидкий сценарій
      </span>
      <span className="inline-flex items-center gap-1.5 text-style-caption text-subtle">
        <BadgeChip tone="warning" label="Ризик" />
        критична дія
      </span>
      {showNew && (
        <span className="inline-flex items-center gap-1.5 text-style-caption text-subtle">
          <BadgeChip tone="brand" label="Новинка" />
          нещодавно додано
        </span>
      )}
    </div>
  );
}

interface BadgeChipProps {
  tone: "brand" | "warning";
  label: string;
  title?: string;
}

function BadgeChip({ tone, label, title }: BadgeChipProps) {
  const cls =
    tone === "warning" ? "text-danger-strong dark:text-danger" : "text-muted";
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 text-style-caption font-medium leading-none",
        cls,
      )}
    >
      {label}
    </span>
  );
}

// Re-export module order for tests / future deep-links.
export { CAPABILITY_MODULE_ORDER };
