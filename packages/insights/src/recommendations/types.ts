// Типи для реєстру правил рекомендацій.
//
// Замінюють «довгі buildFooRecs() з десятком if'ів», даючи тестованість
// per-rule і декларативний пріоритет. Натхненно json-rules-engine, але без
// DSL — правило це звичайна функція `evaluate(ctx)`.
//
// Пакет `@sergeant/insights` — DOM-free: жодних `localStorage`, `window`,
// `document`. Споживачі (apps/web, apps/mobile) будують `Ctx` локально
// і передають у правила.

import type { ModuleAccent, StatusColor } from "@sergeant/design-tokens";

/**
 * Імперативна CTA-дія для рекомендації. Повторює літерали
 * `HubModuleAction` з `apps/web/src/shared/lib/modules/hubNav.ts` — джерелом
 * правди є цей пакет, `hubNav.ts` реекспортує звідси.
 */
export type HubModuleAction =
  | "add_expense"
  | "start_workout"
  | "add_meal"
  | "add_meal_photo"
  | "add_habit";

export type Module = ModuleAccent | "hub";
export type RecSeverity = StatusColor;

export interface Rec {
  id: string;
  module: Module;
  priority: number;
  severity?: RecSeverity;
  icon: string;
  title: string;
  body: string;
  // Навігаційна дія (модуль або "reports"). Залишаємо як fallback — колись
  // просто відкривала розділ. Нове поле `pwaAction` вмикає імперативний
  // CTA ("Додати витрату", "Почати тренування"), який виконується одним
  // тапом без додаткового кроку «Відкрити модуль».
  action: string;
  /**
   * Опційний hash-фрагмент усередині модуля (без `#`). Дозволяє інсайту
   * глибоко лінкувати на конкретну вкладку чи елемент — напр.
   * `"budgets?cat=smoking"` відкриває Планування та підсвічує ліміт
   * категорії «Цигарки». Споживачі (web/mobile) трактують його як
   * route-hash для активного модуля.
   */
  actionHash?: string;
  pwaAction?: HubModuleAction;
}

export interface Rule<Ctx> {
  /** Унікальний ключ для логів/трейсингу (не плутати з id конкретного Rec). */
  id: string;
  module: Module;
  /**
   * Запускає правило. Повертає 0..N рекомендацій. Не мутує контекст.
   * Помилки правила мають бути оброблені — див. `runRules`.
   */
  evaluate(ctx: Ctx): Rec[];
}
