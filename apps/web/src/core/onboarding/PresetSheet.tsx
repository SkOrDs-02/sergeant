import { useEffect, useMemo, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import { Sheet } from "@shared/components/ui/Sheet";
import { messages } from "@shared/i18n/uk";
import { openHubModuleWithAction } from "@shared/lib/modules/hubNav";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { applyPreset, type ModuleId, type ModulePreset } from "./presetApply";
import { writePresetPrefill } from "./presetPrefill";

type HubAction = Parameters<typeof openHubModuleWithAction>[1];

interface PresetItem {
  id: string;
  /**
   * Гліф плитки — ІМʼЯ з каталогу `Icon`, не емодзі. Раніше тут стояв
   * сирий `💧`/`📖`: `no-emoji-icon` цей шейп не ловить (емодзі всередині
   * рядкової мітки, а не в полі `icon`), тому дефект дожив до 2026-07.
   * З 2026-08-03 гліф самої звички (`data.emoji`) — теж icon-slug із
   * `ROUTINE_GLYPHS`, тож обидва поля тепер з одного словника.
   */
  icon: IconName;
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
 *
 * Копі — з каталогу (`messages.presets.*`, 2026-09-16, борг
 * дизайн-контракту онбордингу). Тут лишається лише те, що НЕ копі:
 * гліфи `Icon`, класи акценту модуля, PWA-екшени і слаги категорій
 * Фініка. Формулювання правиться в `uk.ts`, не тут.
 */
const COPY = messages.presets;

const PRESETS: PresetCatalog = {
  routine: {
    ...COPY.routine,
    accent: "text-routine-soft-fg bg-routine-soft",
    moduleIcon: "check",
    fallback: {
      action: "add_habit",
      label: COPY.routine.fallbackLabel,
      icon: "plus",
    },
    items: [
      {
        id: "water",
        icon: "droplet",
        ...COPY.routine.items.water,
        data: { name: COPY.routine.items.water.name, emoji: "droplet" },
      },
      {
        id: "walk",
        icon: "run",
        ...COPY.routine.items.walk,
        data: { name: COPY.routine.items.walk.name, emoji: "run" },
      },
      {
        id: "read",
        icon: "book-open",
        ...COPY.routine.items.read,
        data: { name: COPY.routine.items.read.name, emoji: "book-open" },
      },
    ],
  },
  finyk: {
    ...COPY.finyk,
    accent: "text-finyk-soft-fg bg-finyk-soft",
    moduleIcon: "credit-card",
    fallback: {
      action: "add_expense",
      label: COPY.finyk.fallbackLabel,
      icon: "plus",
    },
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
        icon: "coffee",
        ...COPY.finyk.items.coffee,
        // `cafe` («Кафе та ресторани»), не «їжа»: остання — Era-1 legacy-мітка,
        // яку `legacyManualCategoryId()` зводить до слага `food` («Продукти»),
        // тож ранкова кава падала в продуктовий кошик і не рахувалась проти
        // ліміту на кафе (репорт finyk-агента 2026-08-23).
        data: { description: COPY.finyk.items.coffee.name, category: "cafe" },
      },
      {
        id: "ride",
        icon: "truck",
        ...COPY.finyk.items.ride,
        data: {
          description: COPY.finyk.items.ride.name,
          category: "транспорт",
        },
      },
      {
        id: "lunch",
        icon: "utensils",
        ...COPY.finyk.items.lunch,
        data: { description: COPY.finyk.items.lunch.name, category: "їжа" },
      },
    ],
  },
  nutrition: {
    ...COPY.nutrition,
    accent: "text-nutrition-soft-fg bg-nutrition-soft",
    moduleIcon: "utensils",
    fallback: {
      action: "add_meal",
      label: COPY.nutrition.fallbackLabel,
      icon: "plus",
    },
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
    ...COPY.fizruk,
    accent: "text-fizruk-soft-fg bg-fizruk-soft",
    moduleIcon: "dumbbell",
    fallback: {
      action: "start_workout",
      label: COPY.fizruk.fallbackLabel,
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
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (!open || !config || !moduleId) return;
    trackEvent(ANALYTICS_EVENTS.FTUX_PRESET_SHEET_SHOWN, {
      module: moduleId,
      presetCount: config.items.length,
    });
  }, [open, config, moduleId]);

  if (!config || !moduleId) return null;

  const handlePick = async (item: PresetItem) => {
    setSaveError(false);
    trackEvent(ANALYTICS_EVENTS.FTUX_PRESET_PICKED, {
      module: moduleId,
      presetId: item.id,
    });
    // Routine preсети пишуться одразу — звичка це «імʼя + ✓», тут
    // немає метрики, яку можна сфабрикувати. Для finyk (а в перспективі
    // й інших) натомість стешимо `item.data` у sessionStorage і
    // відкриваємо повний add-sheet модуля — без фейкових сум у ledger-і,
    // але з префіллом назви/категорії, щоб три плитки не деградували
    // до трьох ідентичних порожніх форм.
    let persisted = false;
    if (moduleId === "routine") {
      // Спека `anonymous-local-first-persistence.md` («Похідне правило»):
      // СТАРТ-блок вважається витраченим лише після ПІДТВЕРДЖЕНОГО durable
      // write. Раніше тут стояло `persisted = true` одразу після виклику —
      // а `applyPreset` тоді був fire-and-forget і мовчки не писав нічого,
      // якщо dual-write контекст не змонтований (типовий стан у FTUX: шит
      // відкривається з хаба, шел `/routine` ще не бутнувся). Наслідок —
      // hero-картка згасала назавжди, звичка жила до першого reload.
      persisted = await applyPreset(moduleId, item.data as ModulePreset);
      if (!persisted) {
        // Шит лишається відкритим: єдина дія користувача не має зникати
        // разом із незбереженим записом, а повторний тап тут-таки — це
        // найкоротший шлях до retry.
        setSaveError(true);
        return;
      }
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
        {saveError && (
          <p
            role="alert"
            className="rounded-2xl border border-danger bg-danger/10 px-3 py-2 text-style-caption text-text"
          >
            {messages.onboarding.presetSaveFailed}
          </p>
        )}
        {config.items.map((item: PresetItem) => (
          <button
            key={item.id}
            type="button"
            onClick={() => void handlePick(item)}
            className={cn(
              "w-full text-left px-3 py-3 rounded-2xl border border-line bg-panelHi",
              "hover:border-brand-500/50 hover:bg-brand-500/5 transition-[background-color,border-color,opacity]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-11 h-11 shrink-0 rounded-xl flex items-center justify-center",
                  config.accent,
                )}
                aria-hidden
              >
                <Icon name={item.icon} size="lg" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-style-title text-text truncate">
                  {item.title}
                </div>
                <div className="text-style-body text-muted mt-0.5 truncate">
                  {item.desc}
                </div>
              </div>
              <Icon
                name="chevron-right"
                size="md"
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
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
          )}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Icon name={fallbackIconName} size="sm" />
            <span>{config.fallback.label}</span>
          </div>
        </button>
      </div>
    </Sheet>
  );
}
