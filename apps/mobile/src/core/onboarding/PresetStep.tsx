/**
 * Mobile port of the post-onboarding PresetSheet FTUX.
 *
 * @see apps/web/src/core/onboarding/PresetSheet.tsx — canonical source.
 *
 * A bottom-sheet list of per-module "one-tap to your first real entry"
 * presets, opened from `FirstActionHeroCard`. Tapping a `routine` preset
 * writes a real habit straight into the module store (via `applyPreset`)
 * and closes — the 30-second FTUX success moment in one tap. Tapping a
 * `finyk` preset stages the tile's name/category through `presetPrefill`
 * and navigates into the module's add-expense sheet so the user enters a
 * real amount (no fabricated sums in the ledger). `nutrition` / `fizruk`
 * have no presets (their add-sheets lack a prefill channel — three
 * identical empty forms would be a mini-deception); they show only the
 * fallback CTA, which routes into the module add-flow.
 *
 * The catalog copy/emojis are copied verbatim from the web `PRESETS`
 * map so the two surfaces cannot drift.
 */

import { useEffect, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight, Plus } from "lucide-react-native";

import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";
import { Sheet } from "@/components/ui/Sheet";

import { applyPreset, type ModuleId, type ModulePreset } from "./presetApply";
import { writePresetPrefill } from "./presetPrefill";

/**
 * Add-flow actions a preset can deep-link into. Mirrors the web
 * `HubAction` values used by `openHubModuleWithAction`; the mobile hero
 * card maps each to an Expo-Router push.
 */
export type PresetAction =
  | "add_habit"
  | "add_expense"
  | "add_meal"
  | "start_workout";

interface PresetItem {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  data: ModulePreset;
}

interface PresetFallback {
  action: PresetAction;
  label: string;
}

interface PresetModuleConfig {
  title: string;
  desc: string;
  accentChip: string;
  fallback: PresetFallback;
  action?: PresetAction;
  items: PresetItem[];
}

type PresetCatalog = Record<ModuleId, PresetModuleConfig>;

/**
 * Per-module "tap-to-log" presets. Copy and emojis mirror the web
 * `PRESETS` map verbatim. `routine` = 3 presets written directly;
 * `finyk` = 3 presets that stage a name/category prefill then open the
 * add-expense sheet; `nutrition` / `fizruk` = no presets, fallback CTA
 * only (their add-sheets have no prefill channel yet).
 */
const PRESETS: PresetCatalog = {
  routine: {
    title: "Яку звичку почнемо?",
    desc: "Одне натискання — і вона у твоєму списку сьогодні.",
    accentChip: "bg-coral-50 border border-coral-300/60",
    fallback: { action: "add_habit", label: "Своя звичка" },
    items: [
      {
        id: "water",
        emoji: "💧",
        title: "Випити воду",
        desc: "Щодня, будь-коли",
        data: { name: "Випити воду", emoji: "💧" },
      },
      {
        id: "walk",
        emoji: "🚶",
        title: "Пройти 10 хв",
        desc: "Короткий вихід після обіду",
        data: { name: "Пройти 10 хв", emoji: "🚶" },
      },
      {
        id: "read",
        emoji: "📖",
        title: "Прочитати 10 сторінок",
        desc: "Вечірня звичка",
        data: { name: "Прочитати 10 сторінок", emoji: "📖" },
      },
    ],
  },
  finyk: {
    title: "На що витратив?",
    desc: "Тицяй — відкриється форма з назвою. Суму введеш сам.",
    accentChip: "bg-brand-50 border border-brand-200/60",
    fallback: { action: "add_expense", label: "Своя витрата" },
    action: "add_expense",
    items: [
      {
        id: "coffee",
        emoji: "☕",
        title: "Кава",
        desc: "ранкова звичка — введи свою суму",
        data: { description: "Кава", category: "їжа" },
      },
      {
        id: "ride",
        emoji: "🚕",
        title: "Таксі",
        desc: "дорога на роботу чи додому",
        data: { description: "Таксі", category: "транспорт" },
      },
      {
        id: "lunch",
        emoji: "🥗",
        title: "Обід",
        desc: "що з'їв — і за скільки",
        data: { description: "Обід", category: "їжа" },
      },
    ],
  },
  nutrition: {
    title: "Що з'їв зараз?",
    desc: "Відкрию форму добавляння страви — калорії підтвердиш у модулі.",
    accentChip: "bg-lime-50 border border-lime-200/60",
    fallback: { action: "add_meal", label: "Додати страву" },
    action: "add_meal",
    items: [],
  },
  fizruk: {
    title: "Швидкий старт",
    desc: "Відкрию старт тренування — тривалість вкажеш на фініші.",
    accentChip: "bg-teal-50 border border-teal-200/60",
    fallback: { action: "start_workout", label: "Почати тренування" },
    action: "start_workout",
    items: [],
  },
};

export function getPresetModule(
  moduleId: string | null | undefined,
): PresetModuleConfig | null {
  if (!moduleId) return null;
  return (
    (PRESETS as Record<string, PresetModuleConfig | undefined>)[moduleId] ??
    null
  );
}

export interface PresetPickResult {
  moduleId: ModuleId;
  presetId: string | null;
  custom?: boolean;
  persisted: boolean;
}

export interface PresetStepProps {
  open: boolean;
  moduleId: ModuleId | null;
  onClose: () => void;
  /**
   * Navigate into the module's add-flow. Called for `finyk` presets
   * (after the prefill is staged) and for every fallback CTA. The
   * caller (hero card) maps `action` to an Expo-Router push.
   */
  onNavigate: (moduleId: ModuleId, action: PresetAction) => void;
  onPick?: (result: PresetPickResult) => void;
}

export function PresetStep({
  open,
  moduleId,
  onClose,
  onNavigate,
  onPick,
}: PresetStepProps) {
  const config = useMemo<PresetModuleConfig | null>(
    () => (moduleId ? PRESETS[moduleId] : null),
    [moduleId],
  );

  useEffect(() => {
    if (!open || !config || !moduleId) return;
    trackEvent(ANALYTICS_EVENTS.FTUX_PRESET_SHEET_SHOWN, {
      module: moduleId,
      presetCount: config.items.length,
    });
  }, [open, config, moduleId]);

  if (!config || !moduleId) return null;

  const handlePick = (item: PresetItem) => {
    trackEvent(ANALYTICS_EVENTS.FTUX_PRESET_PICKED, {
      module: moduleId,
      presetId: item.id,
    });
    // Routine presets write immediately — a habit is «name + ✓», there
    // is no metric to fabricate. For finyk we stage `item.data` and open
    // the full add-sheet (real amount entered by the user) so three
    // tiles don't degrade into three identical empty forms.
    let persisted = false;
    if (moduleId === "routine") {
      applyPreset(moduleId, item.data);
      persisted = true;
    } else if (config.action) {
      writePresetPrefill(moduleId, item.data);
      onNavigate(moduleId, config.action);
    }
    onPick?.({ moduleId, presetId: item.id, persisted });
    onClose();
  };

  const handleCustom = () => {
    trackEvent(ANALYTICS_EVENTS.FTUX_PRESET_CUSTOM, {
      module: moduleId,
      via: "fallback",
    });
    // Fallback CTA = explicit «no prefill». Wipe any stale prefill from a
    // previously-opened tile so the next `consumePresetPrefill` in the
    // module doesn't pick up someone else's data.
    writePresetPrefill(moduleId, null);
    onPick?.({ moduleId, presetId: null, custom: true, persisted: false });
    onClose();
    onNavigate(moduleId, config.fallback.action);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={config.title}
      description={config.desc}
    >
      <View className="gap-2 pb-2">
        {config.items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => handlePick(item)}
            className="flex-row items-center gap-3 rounded-2xl border border-cream-300 bg-cream-100 px-3 py-3 active:opacity-80 dark:border-cream-700 dark:bg-cream-800"
            testID={`preset-item-${item.id}`}
          >
            <View
              className={`h-11 w-11 shrink-0 items-center justify-center rounded-xl ${config.accentChip}`}
            >
              <Text className="text-xl">{item.emoji}</Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-fg" numberOfLines={1}>
                {item.title}
              </Text>
              <Text
                className="mt-0.5 text-xs text-fg-muted"
                numberOfLines={1}
              >
                {item.desc}
              </Text>
            </View>
            <ChevronRight size={16} color="#78716c" strokeWidth={2} />
          </Pressable>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={config.fallback.label}
          onPress={handleCustom}
          className="flex-row items-center justify-center gap-1.5 rounded-2xl border border-dashed border-cream-300 px-3 py-3 active:opacity-70 dark:border-cream-700"
          testID="preset-fallback"
        >
          <Plus size={14} color="#78716c" strokeWidth={2.5} />
          <Text className="text-sm font-medium text-fg-muted">
            {config.fallback.label}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
