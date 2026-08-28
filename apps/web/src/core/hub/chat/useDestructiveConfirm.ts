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
 *
 * AI-CONTEXT (B39, 2026-08-25): `items` несе не лише імʼя інструмента, а й
 * опційний `summary` — короткий людський опис аргументів САМЕ цього
 * виклику (наприклад, патерн і ліміт для `batch_categorize`). До фіксу
 * діалог показував тільки назву, тож людина погоджувалась на «масову
 * категоризацію» не бачачи, який патерн і скільки транзакцій воно
 * зачепить. Масив, а не `Record<name, summary>` — той самий інструмент
 * може прийти в батчі двічі з різними аргументами (два `delete_transaction`
 * з різними `tx_id`), і ключування по імені втратило б другий виклик.
 */
import { useCallback, useRef, useState } from "react";

/** Один інструмент батчу, що потребує згоди. */
export interface DestructiveConfirmItem {
  /** Імʼя інструмента (tool name). */
  name: string;
  /**
   * Короткий опис аргументів САМЕ цього виклику. `undefined`, коли в
   * інструмента немає аргументів, вартих показу в модалці (`clear_pantry`).
   */
  summary?: string;
}

/** Опис одного очікуваного підтвердження. */
export interface PendingDestructiveConfirm {
  /** Інструменти (+ короткий опис аргументів), які потребують згоди. */
  items: readonly DestructiveConfirmItem[];
}

export interface UseDestructiveConfirmResult {
  /** `null`, коли діалог закритий. */
  pending: PendingDestructiveConfirm | null;
  /**
   * Просить згоди на перелічені інструменти. Резолвиться `true` (виконуємо)
   * або `false` (скасовано).
   */
  request: (items: readonly DestructiveConfirmItem[]) => Promise<boolean>;
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
    (items: readonly DestructiveConfirmItem[]) =>
      new Promise<boolean>((resolve) => {
        // Захист від накладання: якщо попередній діалог якимось чином
        // лишився невирішеним, закриваємо його ВІДМОВОЮ. Мовчазне
        // перезаписування резолвера підвісило б попередній `send()`
        // назавжди, а резолв `true` виконав би дію, якої ніхто не
        // підтверджував.
        const stale = resolveRef.current;
        if (stale) stale(false);
        resolveRef.current = resolve;
        setPending({ items });
      }),
    [],
  );

  const accept = useCallback(() => settle(true), [settle]);
  const reject = useCallback(() => settle(false), [settle]);

  return { pending, request, accept, reject };
}
