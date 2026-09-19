/**
 * Last validated: 2026-09-16
 * Status: Active
 *
 * Prev-снапшот для diff-у dual-write — з ОСТАННЬОГО НАМІРУ хука, а не з
 * сирого SQLite-кешу.
 *
 * AI-CONTEXT: кеш причинно позаду черги dual-write (refresh іде після
 * apply), тож два записи поспіль у цьому вікні diff-илися проти одного й
 * того самого старого стану. «Видалити → Повернути» з undo-тоста давало
 * «[E] → [E]» — жодного op-а, restore не писався, а refresh після delete
 * стирав повернутий запис із UI (журнал тіла, E2E deep-module-crud,
 * 2026-09-16, PR #64). Той самий патерн стояв у КОЖНОМУ fizruk-хуку, що
 * пише через `persist`, — тому prev тепер будується тут, в одному місці.
 *
 * Модель: хук тримає ref останнього зрізу, який він ПОПРОСИВ записати.
 * Тік кешу означає, що черга затихла і кеш = наш стан (оверлей саме ним
 * і замінив state), тому ref скидається і наступний diff знову йде від
 * кешу — включно з чужими рядками, що приїхали через sync. Решта зрізів
 * стану завжди береться з кешу: хук володіє лише своїм ключем.
 */
import { useEffect, useRef, type MutableRefObject } from "react";

import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  peekFizrukDualWriteState,
} from "./fizrukDualWriteState";
import type { FizrukDualWriteState } from "./sqliteWriter/diff/index";

export type FizrukDualWriteSliceKey = keyof FizrukDualWriteState;

/** Ref останнього наміру для одного зрізу; `null` — намір не відомий, беремо кеш. */
export type FizrukIntendedSliceRef<K extends FizrukDualWriteSliceKey> =
  MutableRefObject<FizrukDualWriteState[K] | null>;

export interface FizrukDualWriteTransition {
  readonly prev: FizrukDualWriteState;
  readonly next: FizrukDualWriteState;
}

/**
 * Ref наміру для зрізу `K`. Скидається на кожному тіку кешу — після тіка
 * оверлей уже замінив локальний стан кешем, і кеш знову є правдою.
 */
export function useFizrukIntendedSlice<K extends FizrukDualWriteSliceKey>(
  sqliteCacheTick: number,
): FizrukIntendedSliceRef<K> {
  const ref = useRef<FizrukDualWriteState[K] | null>(null);
  useEffect(() => {
    ref.current = null;
  }, [sqliteCacheTick]);
  return ref;
}

function withSlice<K extends FizrukDualWriteSliceKey>(
  base: FizrukDualWriteState,
  key: K,
  slice: FizrukDualWriteState[K],
): FizrukDualWriteState {
  return { ...base, [key]: slice } as FizrukDualWriteState;
}

/**
 * Пара `prev`/`next` для `triggerFizrukDualWrite` і фіксація `nextSlice`
 * як нового наміру. Викликати рівно один раз на кожен запис — саме цей
 * виклик і є «наміром», проти якого diff-иться наступний.
 */
export function fizrukDualWriteTransition<K extends FizrukDualWriteSliceKey>(
  key: K,
  intended: FizrukIntendedSliceRef<K>,
  nextSlice: FizrukDualWriteState[K],
): FizrukDualWriteTransition {
  const cached = peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
  const prev =
    intended.current === null
      ? cached
      : withSlice(cached, key, intended.current);
  intended.current = nextSlice;
  return { prev, next: withSlice(cached, key, nextSlice) };
}
