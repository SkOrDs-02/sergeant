/** @status Active */

/**
 * Фізрук: рядки сесії з рішення власника OD-28 (2026-11-18).
 *
 * - `duringWorkoutSettings` — Налаштування → Розділи → Фізрук → «Під час
 *   тренування», тумблер «Не гасити екран» (Фз-1).
 * - `finishConfirm` — підтвердження «Завершити зараз?» і 10 секунд на
 *   «Повернутись у сесію» (Фз-2).
 *
 * AI-CONTEXT: винесено з `uk.fizruk.ts`, бо той стоїть під `max-lines: 600`
 * (Hard Rule #18). Спредиться в `messages.fizruk` поруч із
 * `fizrukPageMessages`, тож виклики лишаються `messages.fizruk.<ключ>`.
 * Ключі верхнього рівня не повинні збігатися з ключами `uk.fizruk.ts`.
 */
import { fizrukMeasureMessages } from "./uk.fizrukMeasure";

export const fizrukSessionMessages = {
  // Тип виміру вправи (окремий файл каталогу, спека типу виміру): спред
  // тут, а не в `uk.ts`, бо той упирається в 600 рядків.
  ...fizrukMeasureMessages,
  duringWorkoutSettings: {
    title: "Під час тренування",
    keepScreenOnLabel: "Не гасити екран",
    keepScreenOnDescription:
      "Поки відкрита сесія, екран не вимикається. Трохи більше витрачає батарею.",
    keepScreenOnUnsupported:
      "Цей браузер не вміє тримати екран увімкненим. Вимкни автоблокування в налаштуваннях телефону на час тренування.",
  },
  finishConfirm: {
    title: "Завершити зараз?",
    undoHint: "Після завершення ще {sec} секунд можна повернутись у сесію.",
    confirm: "Завершити",
    cancel: "Ще тренуюсь",
    minutes: "{n} хв",
    seconds: "{n} с",
    exerciseOne: "вправа",
    exerciseFew: "вправи",
    exerciseMany: "вправ",
    setOne: "підхід",
    setFew: "підходи",
    setMany: "підходів",
    undoLabel: "Повернутись у сесію",
  },
};
