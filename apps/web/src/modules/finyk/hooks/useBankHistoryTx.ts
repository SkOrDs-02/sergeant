/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { useMemo } from "react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { useFinykMirrorTransactions } from "./useFinykStatTransactions";

/**
 * Зливає мережевий стрім банку з історією SQLite-дзеркала. Один запис на `id`,
 * при збігу виграє МЕРЕЖЕВИЙ (`network`): він свіжіший за дзеркало, а дзеркало
 * лише добирає те, чого мережа не віддала (дні поза поточним місяцем).
 *
 * Чиста функція. Якщо дзеркало нічого не додає, повертає той самий масив
 * `network` (стабільна ідентичність для залежностей `useMemo`). Записи
 * мережі без `id` лишаються як є, дзеркальні без `id` пропускаються.
 */
export function mergeBankHistory(
  network: readonly Transaction[],
  mirror: readonly Transaction[],
): readonly Transaction[] {
  if (mirror.length === 0) return network;
  const seen = new Set<string>();
  for (const tx of network) {
    if (tx.id) seen.add(tx.id);
  }
  const extra: Transaction[] = [];
  for (const tx of mirror) {
    if (!tx.id || seen.has(tx.id)) continue;
    seen.add(tx.id);
    extra.push(tx);
  }
  if (extra.length === 0) return network;
  return [...network, ...extra].sort((a, b) => (b.time || 0) - (a.time || 0));
}

/**
 * Банківська історія для лімітів і міжмісячних інсайтів: мережевий `realTx`
 * плюс дзеркало (див. {@link mergeBankHistory}).
 *
 * AI-DANGER: `realTx` після відповіді мережі містить ЛИШЕ поточний київський
 * місяць (`useMonobankWebhook` питає один місяць, а дзеркало він віддає
 * замість мережі тільки поки та порожня). Тижневий ліміт на межі місяців,
 * разовий ліміт, створений раніше, і порівняння «цей місяць проти минулого»
 * без дзеркала недораховують. Місячні агрегати («цього місяця») далі
 * клампляться `filterToKyivMonth`, тут вікна немає навмисно.
 */
export function useBankHistoryTx(
  realTx: readonly Transaction[],
): readonly Transaction[] {
  const mirror = useFinykMirrorTransactions();
  return useMemo(() => mergeBankHistory(realTx, mirror), [realTx, mirror]);
}
