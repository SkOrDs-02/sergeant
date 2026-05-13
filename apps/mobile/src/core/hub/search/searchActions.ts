/**
 * Action launcher hits — mobile mirror of
 * `apps/web/src/core/hub/search/searchActions.ts`.
 *
 * Surfaces the same four primary quick-add commands the bento +
 * `FirstActionHeroCard` already expose so the global search doubles as
 * a Spotlight-style command bar.
 *
 * On mobile we resolve action hits to a route push (see `hubSearchNav`)
 * instead of the web's `openHubModuleWithAction` DOM-event bus. Action
 * dispatch on the module landing screen (e.g. opening the «Add expense»
 * modal automatically) lands in a follow-up PR; for now the user lands
 * on the module root.
 */

import {
  type Hit,
  type HubModuleAction,
  type HubModuleId,
  pushScored,
} from "./searchTypes";

interface ActionDef {
  moduleId: HubModuleId;
  action: HubModuleAction;
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
    action: "add_expense",
    title: "Додати витрату",
    subtitle: "Фінік · одна команда замість FAB",
    icon: "💳",
    keywords:
      "витрата витрати кошти гроші платіж кав каву кафе spend spent expense add transaction trans tx finyk фінік",
  },
  {
    moduleId: "fizruk",
    action: "start_workout",
    title: "Почати тренування",
    subtitle: "Фізрук · стартує сесію без переходу",
    icon: "🏋️",
    keywords:
      "тренування трен зал гим жим кардіо біг workout train start gym lift run fizruk фізрук",
  },
  {
    moduleId: "routine",
    action: "add_habit",
    title: "Додати звичку",
    subtitle: "Рутина · нова звичка одним тапом",
    icon: "✅",
    keywords: "звичка habit рутина streak серія додати add new daily routine",
  },
  {
    moduleId: "nutrition",
    action: "add_meal",
    title: "Додати прийом їжі",
    subtitle: "Харчування · прийом їжі без модалки",
    icon: "🥗",
    keywords:
      "їжа їсти прийом сніданок обід вечеря перекус калорії білок meal eat food breakfast lunch dinner snack ккал nutrition харчування",
  },
];

export function searchActions(tokens: string[]): Hit[] {
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
 * AI handoff hit — emitted when the user has typed a 2+ char query.
 * Activating it triggers the inline AI rail (no route change), mirroring
 * the web behaviour.
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
