/**
 * Settings + Assistant capability hits — mobile mirror of
 * `apps/web/src/core/hub/search/searchSettings.ts`.
 *
 * The settings index is shorter than web — mobile Settings groups
 * differ from `HubSettingsPage.tsx` and not every section ports.
 * The deep-link target lands the user on `/settings`; section anchors
 * land in a follow-up PR once `apps/mobile/src/core/settings/` exposes
 * stable section ids.
 */

import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_MODULE_META,
} from "@sergeant/shared";

import { type Hit, pushScored } from "./searchTypes";

export const SETTINGS_INDEX: ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  keywords: string;
  icon: string;
}> = [
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
        // Subtitle includes keywords so scoreMatch can rank aliases — we
        // strip them back out below before rendering.
        subtitle: `${section.description} · ${section.keywords}`,
        icon: section.icon,
        target: { kind: "settings", sectionId: section.id },
      },
      tokens,
      8,
    );
  }
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
        // Subtitle carries description + keywords + module — keywords
        // feed scoreMatch but get stripped before rendering.
        subtitle: `${cap.description} · ${moduleLabel} · ${(cap.keywords ?? []).join(" ")} ${cap.examples.join(" ")}`,
        title: cap.label,
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
