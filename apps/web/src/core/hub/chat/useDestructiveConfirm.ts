/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Гейт підтвердження перед виконанням незворотних chat-інструментів.
 *
 * Канон `hub-coach` §8: «Деструктивне — тільки з підтвердженням» — «явна
 * згода людини **перед** виконанням, а не після». До цього модуля контракт
 * не виконувався: сім інструментів виконувались одразу, а користувач бачив
 * червону картку з бейджем «Виконано» і тост «скасувати». Канон називає це
 * прямо — **undo замість confirm**, визнаний борг.
 *
 * Межа взята з рішення founder-а 2026-07-25 (#8): підтвердження вимагає
 * тільки незворотне (видалення, перезапис), решта виконується одразу з
 * кнопкою «скасувати». Класифікація — `TOOL_RISK` у `@sergeant/shared`.
 *
 * AI-CONTEXT: хук навмисно віддає `Promise<boolean>`, а не колбек. Виклик
 * стоїть посеред async-послідовності `send()` (запит → tool_calls →
 * виконання → другий запит), і колбек змусив би розрізати її на дві
 * половини з проміжним станом. Await на промісі лишає послідовність
 * лінійною й читабельною — а це та функція, у якій помилка означає
 * несанкціоновану зміну даних.
 */
import { useCallback, useRef, useState } from "react";

/** Опис одного очікуваного підтвердження. */
export interface PendingDestructiveConfirm {
  /** Імена інструментів (tool name), які потребують згоди. */
  toolNames: readonly string[];
}

export interface UseDestructiveConfirmResult {
  /** `null`, коли діалог закритий. */
  pending: PendingDestructiveConfirm | null;
  /**
   * Просить згоди на перелічені інструменти. Резолвиться `true` (виконуємо)
   * або `false` (скасовано).
   */
  request: (toolNames: readonly string[]) => Promise<boolean>;
  /** Користувач підтвердив. */
  accept: () => void;
  /** Користувач відмовився — або закрив діалог, або натиснув Esc. */
  reject: () => void;
}

export function useDestructiveConfirm(): UseDestructiveConfirmResult {
  const [pending, setPending] = useState<PendingDestructiveConfirm | null>(
    null,
  );
  // Резолвер живе в ref, а не в state: він не бере участі в рендері, і
  // покласти його в state означало б зайвий цикл + ризик, що `accept`
  // прочитає застарілий екземпляр.
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPending(null);
    // Ідемпотентність: подвійний клік по «Так» або Esc одразу після
    // підтвердження не має резолвити проміс двічі й тим паче не має
    // запускати виконання вдруге.
    if (resolve) resolve(ok);
  }, []);

  const request = useCallback(
    (toolNames: readonly string[]) =>
      new Promise<boolean>((resolve) => {
        // Захист від накладання: якщо попередній діалог якимось чином
        // лишився невирішеним, закриваємо його ВІДМОВОЮ. Мовчазне
        // перезаписування резолвера підвісило б попередній `send()`
        // назавжди, а резолв `true` виконав би дію, якої ніхто не
        // підтверджував.
        const stale = resolveRef.current;
        if (stale) stale(false);
        resolveRef.current = resolve;
        setPending({ toolNames });
      }),
    [],
  );

  const accept = useCallback(() => settle(true), [settle]);
  const reject = useCallback(() => settle(false), [settle]);

  return { pending, request, accept, reject };
}
