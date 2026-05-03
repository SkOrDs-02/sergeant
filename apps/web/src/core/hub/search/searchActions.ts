import {
  MODULE_PRIMARY_ACTION,
  type ModulePrimaryAction,
} from "@shared/lib/modules/moduleQuickActions";
import type { HubModuleId } from "@shared/lib/modules/hubNav";
import { type Hit, pushScored } from "./searchTypes";

/**
 * Action launcher hits — surface the same `getModulePrimaryAction`
 * commands the bento grid already exposes (Add expense / Start workout
 * / Add habit / Add meal) right inside the global ⌘K palette so the
 * launcher works as a Spotlight-style command bar instead of a
 * read-only search.
 *
 * - Empty query → all four actions are returned in module order so the
 *   palette doubles as the FAB / quick-add affordance.
 * - Non-empty query → actions are scored against the query along with
 *   their Ukrainian + English aliases (e.g. "кав", "spent", "expense"
 *   all rank the «Додати витрату» action).
 */

interface ActionDef {
  moduleId: HubModuleId;
  action: ModulePrimaryAction["action"];
  /** Visible row title — uses the same Ukrainian label as the bento. */
  title: string;
  /** One-line hint shown under the title. */
  subtitle: string;
  icon: string;
  /** Extra ranking aliases joined into the scoreable text. */
  keywords: string;
}

const ACTIONS: ActionDef[] = [
  {
    moduleId: "finyk",
    action: MODULE_PRIMARY_ACTION.finyk.action,
    title: MODULE_PRIMARY_ACTION.finyk.label,
    subtitle: "Фінік · одна команда замість FAB",
    icon: "💳",
    keywords:
      "витрата витрати кошти гроші платіж кав каву кафе spend spent expense add transaction trans tx finyk фінік",
  },
  {
    moduleId: "fizruk",
    action: MODULE_PRIMARY_ACTION.fizruk.action,
    title: MODULE_PRIMARY_ACTION.fizruk.label,
    subtitle: "Фізрук · стартує сесію без переходу",
    icon: "🏋️",
    keywords:
      "тренування трен зал гим жим кардіо біг workout train start gym lift run fizruk фізрук",
  },
  {
    moduleId: "routine",
    action: MODULE_PRIMARY_ACTION.routine.action,
    title: MODULE_PRIMARY_ACTION.routine.label,
    subtitle: "Рутина · нова звичка одним тапом",
    icon: "✅",
    keywords: "звичка habit рутина streak серія додати add new daily routine",
  },
  {
    moduleId: "nutrition",
    action: MODULE_PRIMARY_ACTION.nutrition.action,
    title: MODULE_PRIMARY_ACTION.nutrition.label,
    subtitle: "Харчування · прийом їжі без модалки",
    icon: "🥗",
    keywords:
      "їжа їсти прийом сніданок обід вечеря перекус калорії білок meal eat food breakfast lunch dinner snack ккал nutrition харчування",
  },
];

export function searchActions(tokens: string[]): Hit[] {
  // Empty query → return all actions in module order so the launcher
  // surfaces them as the default landing state.
  if (tokens.length === 0) {
    return ACTIONS.map((a, i) => ({
      id: `action_${a.action}`,
      module: "actions",
      moduleLabel: "Дії",
      title: a.title,
      subtitle: a.subtitle,
      icon: a.icon,
      target: { kind: "action", moduleId: a.moduleId, action: a.action },
      // Stable descending score keeps module order (finyk > fizruk > routine
      // > nutrition) when the launcher first opens.
      _score: ACTIONS.length - i,
    }));
  }

  const results: Hit[] = [];
  for (const a of ACTIONS) {
    pushScored(
      results,
      {
        id: `action_${a.action}`,
        module: "actions",
        moduleLabel: "Дії",
        title: a.title,
        // Subtitle includes keywords so scoreMatch ranks aliases — we
        // strip them back out below before rendering.
        subtitle: `${a.subtitle} · ${a.keywords}`,
        icon: a.icon,
        target: { kind: "action", moduleId: a.moduleId, action: a.action },
      },
      tokens,
      ACTIONS.length,
    );
  }
  return results
    .map((r) => ({
      ...r,
      subtitle:
        ACTIONS.find((a) => `action_${a.action}` === r.id)?.subtitle ||
        r.subtitle,
    }))
    .sort((a, b) => b._score - a._score);
}

/**
 * AI handoff hit — only emitted when the user has typed a 2+ char
 * query. Activating it opens HubChat with the query prefilled (no
 * auto-send) so the launcher gracefully degrades to a chat prompt
 * when no structured hit matches.
 */
export function searchAiHandoff(query: string): Hit[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  return [
    {
      id: "ai_handoff",
      module: "ai",
      moduleLabel: "AI-помічник",
      title: `Запитати AI: «${trimmed}»`,
      subtitle: "Відкрити чат з готовим запитом",
      icon: "✨",
      target: { kind: "ai-handoff", query: trimmed },
      // Constant low score so AI handoff sits at the bottom of its
      // group regardless of query — it's the fallback, not the answer.
      _score: 0,
    },
  ];
}
