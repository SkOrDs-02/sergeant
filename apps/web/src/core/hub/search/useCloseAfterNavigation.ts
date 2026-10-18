/**
 * Last validated: 2026-10-10
 * Status: Active
 *
 * Закриває пошук хаба ПІСЛЯ того, як навігація, яку він ініціював,
 * справді змінила адресу, а не в момент кліку.
 *
 * AI-CONTEXT: пошук тримає запис історії через `useHistoryDismiss`, а той
 * відкочує запис (`history.back()`) через 150 мс після розмонтування, якщо
 * адреса за цей час не змінилась. Маршрути модулів — `lazy: () => import(…)`,
 * і data router виконує `history.push` лише ПІСЛЯ завантаження чанка. Якщо
 * закрити пошук одразу, то на холодному чанку (saveData/2g, перші секунди
 * сесії) відкат приходить раніше за push: роутер отримує POP і скасовує
 * очікувану навігацію, тож «Фінік» у пошуку нічого не робить. Тому пошук
 * лишається змонтованим, поки `location.key` не зміниться; після цього
 * хук бачить іншу адресу і запис не чіпає.
 *
 * Логіку `useHistoryDismiss` не змінено (AI-DANGER, окремо ux-74).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

export interface CloseAfterNavigation {
  /** Навігацію вже запущено, пошук чекає на зміну адреси. */
  navigating: boolean;
  /**
   * Викликати ПЕРЕД командою навігації. Запамʼятовує поточну адресу і
   * закриє пошук, щойно `location.key` стане іншим.
   */
  closeAfterNavigation: () => void;
}

export function useCloseAfterNavigation(
  onClose: () => void,
): CloseAfterNavigation {
  const { key } = useLocation();
  const [fromKey, setFromKey] = useState<string | null>(null);
  const firedRef = useRef(false);

  const closeAfterNavigation = useCallback(() => {
    firedRef.current = false;
    setFromKey(key);
  }, [key]);

  useEffect(() => {
    if (fromKey === null || key === fromKey || firedRef.current) return;
    firedRef.current = true;
    onClose();
  }, [fromKey, key, onClose]);

  return { navigating: fromKey !== null, closeAfterNavigation };
}
