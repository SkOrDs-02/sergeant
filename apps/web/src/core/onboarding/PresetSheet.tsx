import { useEffect, useMemo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Sheet } from "@shared/components/ui/Sheet";
import { openHubModuleWithAction } from "@shared/lib/modules/hubNav";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { applyPreset, type ModuleId, type ModulePreset } from "./presetApply";
import { writePresetPrefill } from "./presetPrefill";

type HubAction = Parameters<typeof openHubModuleWithAction>[1];

interface PresetItem {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  data: ModulePreset | Record<string, unknown>;
}

interface PresetFallback {
  action: HubAction;
  label: string;
  icon: string;
}

interface PresetModuleConfig {
  title: string;
  desc: string;
  accent: string;
  moduleIcon: string;
  fallback: PresetFallback;
  action?: HubAction;
  items: PresetItem[];
}

type PresetCatalog = Record<ModuleId, PresetModuleConfig>;

/**
 * Per-module "tap-to-log" presets. Each entry is deliberately narrow —
 * 3 presets is the sweet spot where the list feels opinionated (not
 * overwhelming) but still has enough spread that a real person sees
 * themselves in at least one option.
 *
 * Presets are the single lowest-friction path to a real (non-demo)
 * entry: tapping one writes straight to the module's storage, no form,
 * no wizard. The custom-entry row at the bottom of the sheet keeps the
 * escape hatch for users whose first instinct doesn't fit the list.
 */
const PRESETS: PresetCatalog = {
  routine: {
    title: "Яку звичку почнемо?",
    desc: "Одне натискання — і вона у твоєму списку сьогодні.",
    accent: "text-routine-strong dark:text-routine bg-routine-surface",
    moduleIcon: "check",
    fallback: { action: "add_habit", label: "Своя звичка", icon: "plus" },
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
    accent: "text-finyk-strong dark:text-finyk bg-finyk-soft",
    moduleIcon: "credit-card",
    fallback: { action: "add_expense", label: "Своя витрата", icon: "plus" },
    // Presets тут — лише заготовки назви/категорії. Реальну суму
    // вводить користувач у формі модуля. Було: «кава 95 ₴» писалася
    // прямо у ledger, що топило довіру з першої секунди.
    //
    // sub-tile desc: приблизний ціновий рейндж для Києва як hint
    // «скільки вводити» замість taxonomy-ярлика («їжа · введи суму»).
    // Категорія так само прокидається через `data.category` —
    // вона обрається в формі модуля, як і раніше.
    action: "add_expense" as const,
    items: [
      {
        id: "coffee",
        emoji: "☕",
        title: "Кава",
        desc: "як правило ~60–95 ₴",
        data: { description: "Кава", category: "їжа" },
      },
      {
        id: "ride",
        emoji: "🚕",
        title: "Таксі",
        desc: "як правило ~80–200 ₴",
        data: { description: "Таксі", category: "транспорт" },
      },
      {
        id: "lunch",
        emoji: "🥗",
        title: "Обід",
        desc: "як правило ~150–250 ₴",
        data: { description: "Обід", category: "їжа" },
      },
    ],
  },
  nutrition: {
    title: "Що з'їв зараз?",
    desc: "Відкрию форму добавляння страви — калорії підтвердиш у модулі.",
    accent: "text-nutrition-strong dark:text-nutrition bg-nutrition-soft",
    moduleIcon: "utensils",
    fallback: { action: "add_meal", label: "Додати страву", icon: "plus" },
    // Три плитки (Омлет / Салат / Яблуко) свого часу давали
    // різні дані — але без каналу прокидування `item.data` у
    // `AddMealSheet` усі три тапи відкривали один і той самий порожній
    // sheet. Три візуально-різні CTA з однаковим результатом — це
    // міні-обман: краще одна чесна кнопка, ніж три, що вдають вибір.
    // Коли модуль отримає prefill-канал — повернемо плитки.
    action: "add_meal" as const,
    items: [],
  },
  fizruk: {
    title: "Швидкий старт",
    desc: "Відкрию старт тренування — тривалість вкажеш на фініші.",
    accent: "text-fizruk-strong dark:text-fizruk bg-fizruk-soft",
    moduleIcon: "dumbbell",
    fallback: {
      action: "start_workout",
      label: "Почати тренування",
      icon: "plus",
    },
    // Те ж саме, що й у nutrition: fizruk не має prefill-каналу для
    // імені тренування, тому три плитки («Розминка», «Прогулянка»,
    // «Швидке HIIT») всі деградували до одного й того ж старту без
    // імені. Лишаємо один fallback-CTA.
    action: "start_workout" as const,
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

/**
 * Bottom-sheet list of "one-tap" presets for a single module. Tapping a
 * preset writes a real entry straight into the module's storage, fires
 * `FIRST_REAL_ENTRY` on the next hub render, and closes the sheet —
 * that is the 30-second FTUX success moment in one interaction.
 *
 * The "custom" fallback row deep-links into the module's full input
 * flow (same PWA action the old FirstActionRow used) for users whose
 * first entry isn't in the preset list.
 */
interface PresetPickResult {
  moduleId: ModuleId;
  presetId: string | null;
  custom?: boolean;
  persisted: boolean;
}

interface PresetSheetProps {
  open: boolean;
  moduleId: ModuleId | null;
  onClose: () => void;
  onPick?: (result: PresetPickResult) => void;
}

export function PresetSheet({
  open,
  moduleId,
  onClose,
  onPick,
}: PresetSheetProps) {
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
    // Routine preсети пишуться одразу — звичка це «ім'я + ✓», тут
    // немає метрики, яку можна сфабрикувати. Для finyk (а в перспективі
    // й інших) натомість стешимо `item.data` у sessionStorage і
    // відкриваємо повний add-sheet модуля — без фейкових сум у ledger-і,
    // але з префіллом назви/категорії, щоб три плитки не деградували
    // до трьох ідентичних порожніх форм.
    let persisted = false;
    if (moduleId === "routine") {
      applyPreset(moduleId, item.data as ModulePreset);
      persisted = true;
    } else if (config.action) {
      writePresetPrefill(moduleId, item.data);
      openHubModuleWithAction(moduleId, config.action);
    }
    onPick?.({ moduleId, presetId: item.id, persisted });
    onClose?.();
  };

  const handleCustom = () => {
    trackEvent(ANALYTICS_EVENTS.FTUX_PRESET_CUSTOM, {
      module: moduleId,
      via: "fallback",
    });
    // Fallback CTA = явне «без префілу». Стираємо будь-який stale prefill
    // від попередньої відкритої плитки, щоб наступний `consumePresetPrefill`
    // у модулі не підчепив чужі дані.
    writePresetPrefill(moduleId, null);
    onPick?.({ moduleId, presetId: null, custom: true, persisted: false });
    onClose?.();
    openHubModuleWithAction(moduleId, config.fallback.action);
  };

  const fallbackIconName = config.fallback.icon as Parameters<
    typeof Icon
  >[0]["name"];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={config.title}
      description={config.desc}
    >
      <div className="px-5 pb-5 space-y-2">
        {config.items.map((item: PresetItem) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handlePick(item)}
            className={cn(
              "w-full text-left px-3 py-3 rounded-2xl border border-line bg-panelHi",
              "hover:border-brand-500/50 hover:bg-brand-500/5 transition-[background-color,border-color,opacity]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-xl",
                  config.accent,
                )}
                aria-hidden
              >
                <span>{item.emoji}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-text truncate">
                  {item.title}
                </div>
                <div className="text-xs text-muted mt-0.5 truncate">
                  {item.desc}
                </div>
              </div>
              <Icon
                name="chevron-right"
                size={16}
                className="text-muted shrink-0"
              />
            </div>
          </button>
        ))}

        <button
          type="button"
          onClick={handleCustom}
          className={cn(
            "w-full text-center px-3 py-3 rounded-2xl border border-dashed border-line",
            "text-style-label text-muted hover:text-text hover:border-brand-500/50",
            "transition-[background-color,border-color,opacity]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
          )}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Icon name={fallbackIconName} size={14} />
            <span>{config.fallback.label}</span>
          </div>
        </button>
      </div>
    </Sheet>
  );
}
