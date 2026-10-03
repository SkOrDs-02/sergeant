/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Тонкий injection-point «в аутбокс щойно ліг новий рядок».
 *
 * AI-CONTEXT: writer-runtime із самого початку мав API
 * `notifyEnqueued()` — негайний flush замість очікування інтервалу — але
 * жоден дуал-райт його не викликав (нуль виробничих call-site-ів на web
 * і mobile). Через це єдиними тригерами push-у лишались ~30-секундний
 * таймер і події `online`/`visibilitychange`, тобто кожен локальний
 * запис чекав до ~36 с (інтервал + джитер), а короткоживуча вкладка
 * могла закритись, так нічого й не надіславши.
 *
 * Реєстр, а не прямий імпорт синглтона, — навмисно: `enqueueOutboxUpsert`
 * лежить на write-path кожного модуля, а `syncEngine/singleton.ts`
 * статично тягне `authClient`. Прямий імпорт зшив би ці два графи в один
 * chunk — саме та форма циклічної залежності, що вже валила прод
 * TDZ-крашем (див. коментар на початку `singleton.ts`).
 */

import { emitSyncOutboxChanged } from "./outboxChanged.js";

type NudgeFn = () => void;

let nudge: NudgeFn | null = null;

/**
 * Реєструє нудж, який `enqueueOutboxUpsert` смикає після успішної
 * вставки. Викликається один раз, коли підіймається writer-runtime.
 * Повторний виклик замінює попередній обробник.
 */
export function setOutboxEnqueueNudge(fn: NudgeFn | null): void {
  nudge = fn;
}

/**
 * Повідомляє writer-runtime про свіжий рядок. No-op, поки runtime не
 * піднявся (до цього моменту рядок і так забере перший тік після boot-у).
 * Помилку обробника ковтаємо: нудж — оптимізація латентності, він не має
 * права зламати локальний запис.
 */
export function notifyOutboxEnqueued(): void {
  // Індикатор черги оновлюємо ДО гарду: рядок уже в аутбоксі, і його
  // видно в лічильнику незалежно від того, чи піднявся writer-runtime.
  emitSyncOutboxChanged();
  if (!nudge) return;
  try {
    nudge();
  } catch {
    /* нудж — best-effort, локальний запис важливіший */
  }
}

/** Скидання глобального стану між тестами. */
export function __resetOutboxNudgeForTests(): void {
  nudge = null;
}
