import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearFormDraft,
  peekFormDraft,
  stashFormDraft,
} from "@shared/lib/storage/formDrafts";
import { useLatestRef } from "./useLatestRef";

/**
 * Чернетка форми, що переживає розмонтування під замком застосунку
 * (sec-13, priv-15). Механізм і життєвий цикл: `@shared/lib/storage/formDrafts`.
 *
 * - `formId` — стабільний id форми; `null` вимикає чернетку (екземпляр форми,
 *   який не відновлюється).
 * - `snapshot` — серіалізований стан форми або `null`, коли зберігати нічого
 *   (аркуш закритий чи порожній). Читається у cleanup розмонтування.
 * - `restored` — чернетка, що лежала в сховищі на момент монтування.
 * - `take()` — віддати чернетку й стерти її зі сховища; значення живе до кінця
 *   поточного таска (StrictMode), далі повертається `null`.
 * - `discard()` — стерти чернетку явно (успішний сабміт, закриття форми).
 */
export function useLockDraft<T>(
  formId: string | null,
  snapshot: T | null,
): { restored: T | null; take: () => T | null; discard: () => void } {
  const [restored] = useState<T | null>(() =>
    formId ? peekFormDraft<T>(formId) : null,
  );
  const pendingRef = useRef<T | null>(restored);
  const snapshotRef = useLatestRef(snapshot);
  const readSnapshot = useCallback(() => snapshotRef.current, [snapshotRef]);

  useEffect(() => {
    if (!formId) return undefined;
    return () => {
      const latest = readSnapshot();
      if (latest !== null) stashFormDraft(formId, latest);
    };
  }, [formId, readSnapshot]);

  const take = useCallback((): T | null => {
    const value = pendingRef.current;
    if (formId) clearFormDraft(formId);
    // Одноразовість з запасом на подвійний запуск ефектів у StrictMode: обидва
    // запуски йдуть в одному таску й мають побачити те саме значення, а
    // наступні відкриття форми (інший таск) — уже ні.
    if (value !== null) {
      setTimeout(() => {
        pendingRef.current = null;
      }, 0);
    }
    return value;
  }, [formId]);

  const discard = useCallback(() => {
    pendingRef.current = null;
    if (formId) clearFormDraft(formId);
  }, [formId]);

  return { restored, take, discard };
}
