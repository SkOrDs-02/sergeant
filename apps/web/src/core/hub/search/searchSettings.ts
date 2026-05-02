import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_MODULE_META,
} from "@sergeant/shared";
import { type Hit, pushScored } from "./searchTypes";

// Settings sections — mirrors the catalogue declared in HubSettingsPage.tsx
// so a query like "експорт" surfaces "Експорт/імпорт JSON" directly from
// the global ⌘K palette, instead of forcing the user to first open
// Settings and then re-query inside its own search field.
//
// Keep `keywords` in sync with HubSettingsPage's `sections` table whenever
// new sections are added there. We deliberately don't import that array —
// it carries `render: () => <Section/>` closures that would drag a much
// larger render-time graph into the search modal's chunk.
export const SETTINGS_INDEX: ReadonlyArray<{
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

export function searchSettings(tokens: string[]): Hit[] {
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

export function searchAssistantTools(tokens: string[]): Hit[] {
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
