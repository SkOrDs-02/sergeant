/**
 * Sergeant Hub-core — AssistantCataloguePage (React Native)
 *
 * Mobile mirror of `apps/web/src/core/AssistantCataloguePage.tsx`.
 *
 * Surfaces the full `ASSISTANT_CAPABILITIES` registry from
 * `@sergeant/shared` so the user can browse what the AI assistant can
 * do without typing `/help`, scrolling chat chips, or guessing tool
 * names. Same source-of-truth as web — adding a capability there
 * automatically lands here too (locked by the registry tests in
 * `packages/shared/src/lib/assistantCatalogue.test.ts`).
 *
 * Differences from the web shell (intentional, see PR body):
 *  - No "Try in chat" wiring. Mobile does not yet ship HubChat — the
 *    backend `/api/chat` endpoint is wired only on web (see
 *    `apps/mobile/src/modules/finyk/pages/Budgets/BudgetsPage.tsx`
 *    for the same caveat). The detail Sheet shows the capability
 *    description + examples; the explicit "веб-версія" notice keeps
 *    expectations honest until mobile chat lands.
 *  - Module title prefix uses an emoji glyph rather than a Lucide
 *    icon. Mobile has no icon component yet; settings sections
 *    already use the same emoji-prefix pattern (`SettingsGroup`).
 *  - Layout uses `ScrollView` + `SafeAreaView` (matching the rest of
 *    the Hub-core mobile shells) instead of the web responsive
 *    `max-w-2xl` container.
 */

import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_MODULE_META,
  CAPABILITY_MODULE_ORDER,
  groupCapabilitiesByModule,
  searchCapabilities,
  type AssistantCapability,
  type CapabilityModule,
} from "@sergeant/shared";

import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { useLocalStorage } from "@/lib/storage";

// AI-NOTE: keep in lockstep with web — see
// apps/web/src/core/AssistantCataloguePage.tsx (`COLLAPSED_GROUPS_LS_KEY`).
const COLLAPSED_GROUPS_KEY = "assistant_catalogue_collapsed_v1";

const CAPABILITY_MODULE_SET = new Set<string>(CAPABILITY_MODULE_ORDER);

function sanitizeCollapsed(value: unknown): CapabilityModule[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is CapabilityModule =>
      typeof v === "string" && CAPABILITY_MODULE_SET.has(v),
  );
}

// Emoji prefix per module — keeps a consistent visual rhythm with the
// existing settings sections (`💳 Фінік`, `🏋 Фізрук`, `✅ Рутина`,
// …). A future mobile icon primitive can lift this into a shared
// adapter that maps `CAPABILITY_MODULE_META[m].icon` → component.
const MODULE_EMOJI: Record<CapabilityModule, string> = {
  finyk: "💳",
  fizruk: "🏋️",
  routine: "✅",
  nutrition: "🍎",
  cross: "🔀",
  analytics: "📊",
  utility: "🧰",
  memory: "🧠",
};

export interface AssistantCataloguePageProps {
  /**
   * Optional close handler — used when the page is rendered inside a
   * controlled host (e.g. settings drilldown). When omitted, the
   * default Expo-Router back action is used.
   */
  onClose?: () => void;
}

export function AssistantCataloguePage({
  onClose,
}: AssistantCataloguePageProps) {
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<AssistantCapability | null>(null);
  // AI-CONTEXT: persisting *collapsed* (not expanded) ids keeps every
  // module visible by default — newly registered modules surface
  // immediately without a one-off migration.
  const [collapsedRaw, setCollapsedRaw] = useLocalStorage<CapabilityModule[]>(
    COLLAPSED_GROUPS_KEY,
    [],
  );
  const collapsedModules = useMemo(
    () => sanitizeCollapsed(collapsedRaw),
    [collapsedRaw],
  );
  const collapsedSet = useMemo(
    () => new Set(collapsedModules),
    [collapsedModules],
  );

  const filtered = useMemo(
    () => (query.trim() ? searchCapabilities(query) : ASSISTANT_CAPABILITIES),
    [query],
  );
  const groups = useMemo(() => groupCapabilitiesByModule(filtered), [filtered]);
  const isSearching = query.trim().length > 0;
  // While searching all groups expand so matches are immediately visible.
  // The persisted collapsed set is left untouched.
  const isModuleCollapsed = (module: CapabilityModule) =>
    !isSearching && collapsedSet.has(module);

  const toggleModule = useCallback(
    (module: CapabilityModule) => {
      setCollapsedRaw((prev) => {
        const list = sanitizeCollapsed(prev);
        return list.includes(module)
          ? list.filter((m) => m !== module)
          : [...list, module];
      });
    },
    [setCollapsedRaw],
  );

  const allCollapsed =
    groups.length > 0 && groups.every((g) => collapsedSet.has(g.module));

  const toggleAll = useCallback(() => {
    setCollapsedRaw(allCollapsed ? [] : CAPABILITY_MODULE_ORDER.slice());
  }, [allCollapsed, setCollapsedRaw]);

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (router.canGoBack()) router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-cream-50" edges={["top"]}>
      <View className="flex-row items-center gap-3 px-5 pt-3 pb-2">
        <BackButton
          variant="ghost"
          size="sm"
          onPress={handleClose}
          autoNavigate={false}
          testID="assistant-catalogue-back"
        />
        <Text className="text-[20px] font-bold text-fg">
          Можливості асистента
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-sm text-fg-muted mb-3 leading-snug">
          Усе, що вміє асистент. Тапни картку — побачиш приклади команд та опис.
          Запуск сценаріїв — у HubChat (наразі веб-версія).
        </Text>

        <CapabilityLegend />

        <View className="bg-white border border-cream-300 rounded-2xl px-3 py-2 mb-4 flex-row items-center gap-2">
          <Text className="text-fg-subtle text-base">🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Пошук — «витрата», «звичка», «1RM»…"
            placeholderTextColor="#a8a29e"
            className="flex-1 text-sm text-fg py-1"
            accessibilityLabel="Пошук можливостей"
            testID="assistant-catalogue-search"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        {!isSearching && groups.length > 0 ? (
          <View className="flex-row justify-end mb-3">
            <Pressable
              onPress={toggleAll}
              accessibilityRole="button"
              accessibilityLabel={
                allCollapsed ? "Розгорнути все" : "Згорнути все"
              }
              testID="catalogue-toggle-all"
              className="flex-row items-center gap-1 px-2.5 py-1 rounded-full active:opacity-70"
            >
              <Text className="text-fg-muted text-xs">
                {allCollapsed ? "⌄" : "⌃"}
              </Text>
              <Text className="text-fg-muted text-xs font-semibold">
                {allCollapsed ? "Розгорнути все" : "Згорнути все"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {filtered.length === 0 ? (
          <Text className="text-center text-fg-muted py-8 text-sm">
            Нічого не знайдено за «{query}». Спробуй інший термін.
          </Text>
        ) : (
          <View className="gap-5">
            {groups.map((g) => (
              <ModuleGroup
                key={g.module}
                module={g.module}
                capabilities={g.capabilities}
                collapsed={isModuleCollapsed(g.module)}
                onToggle={() => toggleModule(g.module)}
                onActivate={setDetail}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <CapabilityDetailSheet
        capability={detail}
        onClose={() => setDetail(null)}
      />
    </SafeAreaView>
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
  return (
    <View accessibilityLabel={meta.title}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={`${meta.title}, ${capabilities.length}`}
        testID={`catalogue-module-${module}-toggle`}
        className="flex-row items-center gap-1 mb-2 active:opacity-70"
      >
        <Text className="text-sm font-bold text-fg flex-1">
          {MODULE_EMOJI[module]} {meta.title}{" "}
          <Text className="text-fg-subtle font-normal">
            ({capabilities.length})
          </Text>
        </Text>
        <Text className="text-fg-subtle text-base">
          {collapsed ? "⌄" : "⌃"}
        </Text>
      </Pressable>
      {!collapsed ? (
        <View className="gap-2">
          {capabilities.map((cap) => (
            <CapabilityRow
              key={cap.id}
              capability={cap}
              onActivate={onActivate}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CapabilityLegend() {
  return (
    <View
      testID="catalogue-legend"
      accessibilityLabel="Що означають позначки"
      className="bg-white border border-cream-300 rounded-2xl px-3 py-2.5 mb-3 flex-row flex-wrap gap-x-3 gap-y-1.5 items-center"
    >
      <Text className="text-xs font-semibold text-fg-muted">Позначки:</Text>
      <View className="flex-row items-center gap-1.5">
        <View className="border border-line rounded-full px-2 py-0.5">
          <Text className="text-[10px] font-bold text-fg">⚡ ЧІП</Text>
        </View>
        <Text className="text-[11px] text-fg-muted">швидкий сценарій</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <View className="border border-amber-400 bg-amber-50 rounded-full px-2 py-0.5">
          <Text className="text-[10px] font-bold text-amber-700">⚠ РИЗИК</Text>
        </View>
        <Text className="text-[11px] text-fg-muted">критична дія</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <View className="border border-emerald-400 bg-emerald-50 rounded-full px-2 py-0.5">
          <Text className="text-[10px] font-bold text-emerald-700">
            ✨ НОВИНКА
          </Text>
        </View>
        <Text className="text-[11px] text-fg-muted">нещодавно додано</Text>
      </View>
    </View>
  );
}

interface CapabilityRowProps {
  capability: AssistantCapability;
  onActivate: (cap: AssistantCapability) => void;
}

function CapabilityRow({ capability, onActivate }: CapabilityRowProps) {
  return (
    <Pressable
      onPress={() => onActivate(capability)}
      accessibilityRole="button"
      accessibilityLabel={capability.label}
      testID={`catalogue-capability-${capability.id}`}
      className="active:opacity-70"
    >
      <Card variant="default" radius="lg" padding="md">
        <View className="flex-row items-start gap-2 flex-wrap">
          <Text className="text-sm font-semibold text-fg flex-shrink">
            {capability.label}
          </Text>
          {capability.isNew ? (
            <View
              testID={`catalogue-capability-${capability.id}-new`}
              className="border border-emerald-400 bg-emerald-50 rounded-full px-2 py-0.5"
            >
              <Text className="text-[10px] font-bold text-emerald-700">
                ✨ НОВИНКА
              </Text>
            </View>
          ) : null}
          {capability.isQuickAction ? (
            <View className="border border-line rounded-full px-2 py-0.5">
              <Text className="text-[10px] font-bold text-fg">⚡ ЧІП</Text>
            </View>
          ) : null}
          {capability.risky ? (
            <View className="border border-amber-400 bg-amber-50 rounded-full px-2 py-0.5">
              <Text className="text-[10px] font-bold text-amber-700">
                ⚠ РИЗИК
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-xs text-fg-muted mt-1 leading-snug">
          {capability.description}
        </Text>
      </Card>
    </Pressable>
  );
}

interface CapabilityDetailSheetProps {
  capability: AssistantCapability | null;
  onClose: () => void;
}

function CapabilityDetailSheet({
  capability,
  onClose,
}: CapabilityDetailSheetProps) {
  const cap = capability;
  return (
    <Sheet
      open={cap !== null}
      onClose={onClose}
      title={cap?.label ?? ""}
      description={cap ? CAPABILITY_MODULE_META[cap.module].title : undefined}
    >
      {cap ? (
        <View className="px-5 py-4 gap-4">
          <Text className="text-sm text-fg">{cap.description}</Text>

          {cap.risky ? (
            <View className="border border-amber-400 bg-amber-50 rounded-2xl px-3 py-2">
              <Text className="text-xs text-amber-800">
                Критична дія. Перевір дані перед відправкою — деякі зміни
                скасувати не можна.
              </Text>
            </View>
          ) : null}

          <View>
            <Text className="text-sm font-bold text-fg mb-2">Приклади</Text>
            <View className="gap-1.5">
              {cap.examples.map((ex, i) => (
                <View
                  key={i}
                  className="border border-cream-300 bg-white rounded-xl px-3 py-2"
                >
                  <Text className="text-sm text-fg">«{ex}»</Text>
                </View>
              ))}
            </View>
          </View>

          <Text className="text-xs text-fg-muted leading-snug">
            Запуск сценарію відбувається в HubChat. Поки що чат AI-асистента
            доступний у веб-версії — мобільна версія в дорозі.
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

export default AssistantCataloguePage;
