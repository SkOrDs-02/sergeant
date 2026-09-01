import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_MODULE_META,
} from "@sergeant/shared";
import { VISIBLE_SETTINGS_SECTIONS } from "../settingsSectionsCatalog";
import { type Hit, pushScored } from "./searchTypes";

// Settings sections — id/title/keywords come from the shared
// `SETTINGS_SECTIONS_CATALOG` (also consumed by HubSettingsPage.tsx) so a
// query like "експорт" surfaces "Експорт/імпорт JSON" directly from the
// global ⌘K palette, instead of forcing the user to first open Settings and
// then re-query inside its own search field.
//
// L-13 audit finding (2026-08-08): before the shared catalog existed, this
// array was a hand-copied duplicate of HubSettingsPage's own section list
// and had drifted — it carried two ids with no matching section ("general",
// "assistant") and was missing four real ones ("plan", "privacy",
// "feedback", "capabilities"), so those sections were unreachable from ⌘K.
// `description`/`icon` stay local (search-only presentation, not part of
// the id/title/keywords contract two consumers must agree on) — keyed by
// id below. Audit finding #10 (2026-08-08) corrects the claim that used to
// be here: a missing entry is NOT a type error — `Record<string, …>`
// indexing doesn't enforce every specific key is present, even under
// `noUncheckedIndexedAccess` (Hard Rule #19) it only widens the VALUE type
// to include `undefined`. A missing entry falls back at runtime to a
// generic gear icon + empty description (see `presentation` below) so a
// new catalog entry without a matching presentation record stays
// searchable instead of crashing ⌘K.
const SETTINGS_PRESENTATION: Readonly<
  Record<string, { description: string; icon: string }>
> = {
  dashboard: {
    description: "Підказки, щільність, активні модулі",
    icon: "grid",
  },
  plan: {
    description: "Тариф, оплата, портал підписки",
    icon: "wallet",
  },
  notifications: {
    description: "Push-нагадування і щоденні сповіщення",
    icon: "bell",
  },
  ai: {
    description: "Тижневий тренер, insights",
    icon: "sergeant",
  },
  capabilities: {
    description: "Каталог AI-можливостей, онбординг",
    icon: "compass",
  },
  feedback: {
    description: "Відгук, ідея, баг",
    icon: "message-circle",
  },
  routine: {
    description: "Звички, цілі, reset",
    icon: "check-circle",
  },
  fizruk: {
    description: "Тренування, кардіо, вага",
    icon: "dumbbell",
  },
  finyk: {
    description: "Інтеграції банків, бюджет",
    icon: "wallet",
  },
  nutrition: {
    description: "Калорії, макроси, комора",
    icon: "utensils",
  },
  privacy: {
    description: "PIN-код, блокування, безпека",
    icon: "lock",
  },
  pwa: {
    description: "Service worker, кеш, діагностика",
    icon: "wifi-off",
  },
  dataExport: {
    description: "Резервна копія Hub, перенос даних",
    icon: "download",
  },
  experimental: {
    description: "Lab, beta, debug",
    icon: "sergeant",
  },
};

export const SETTINGS_INDEX: ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  keywords: string;
  icon: string;
}> = VISIBLE_SETTINGS_SECTIONS.map((section) => {
  // Falls back to a generic gear icon/empty description rather than
  // throwing — a new catalog entry without a presentation record should
  // still be searchable (just visually plain) instead of crashing ⌘K.
  const presentation = SETTINGS_PRESENTATION[section.id] ?? {
    description: "",
    icon: "settings",
  };
  return {
    id: section.id,
    title: section.title,
    keywords: section.keywords,
    ...presentation,
  };
});

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
  // картка перетворюється на заплутану мішанину тегів. Audit finding #10
  // (2026-08-08): `??` here, NOT `||` — a section with a genuinely EMPTY
  // `description` (falsy but a valid, deliberate "no description" value)
  // used to fall through `||` straight back to the raw pre-strip
  // `subtitle` (`"" · "keyword soup"`, complete with the leading " · "
  // separator) — exactly the "заплутана мішанина тегів" this line exists
  // to avoid. `??` only falls back when the lookup itself finds nothing.
  return results
    .map((r) => ({
      ...r,
      subtitle:
        SETTINGS_INDEX.find((s) => `settings_${s.id}` === r.id)?.description ??
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
