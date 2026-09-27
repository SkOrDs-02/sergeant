/**
 * Моменти, показані сьогодні: де вони живуть до кінця доби.
 *
 * Стан per-viewer у `localStorage` (ADR-0096 § Consequences, спека
 * `reward-loop-and-reminders.md`): рядок має пережити перезавантаження
 * сторінки і зникнути на новому день-ключі пристрою (ADR-0078).
 * Серверний стан на кожен показ означав би запис у базу на кожну дію, тож
 * повтор моменту на іншому пристрої того ж дня прийнято свідомо.
 */

import { useEffect, useState } from "react";
import { z } from "zod";
import { STORAGE_KEYS } from "@sergeant/shared";

import {
  safeReadLSValidated,
  safeWriteLS,
  webKVStore,
} from "@shared/lib/storage/storage";
import { useDeviceDayKey } from "@shared/hooks/useDeviceDayKey";

import { useStorageReady } from "../../db/storageReady";
import { ANALYTICS_EVENTS, trackEvent } from "../../observability/analytics";
import { markSignalShown } from "../../observability/valueSignalAttribution";
import type { Moment } from "./moments";

const KEY = STORAGE_KEYS.MOMENTS_TODAY;

const MomentSchema = z.object({
  kind: z.enum(["threshold", "streak", "freeze", "dayClosed", "approach"]),
  target: z.string(),
  value: z.number().optional(),
});

const StoredSchema = z.object({
  dayKey: z.string(),
  byTarget: z.record(z.string(), MomentSchema),
});

type Stored = z.infer<typeof StoredSchema>;

// `webKVStore.onChange` ловить лише запис з ІНШОЇ вкладки (подія
// `storage`, контракт DOM). Рядок має зʼявитись і в цій вкладці, тож
// власні записи розсилаємо самі.
const localListeners = new Set<() => void>();

function read(dayKey: string): Stored["byTarget"] {
  const stored = safeReadLSValidated<Stored | null>(KEY, StoredSchema, null);
  // Учорашній запис читається як порожній: рядок живе до кінця доби.
  return stored && stored.dayKey === dayKey ? stored.byTarget : {};
}

/** Моменти сьогоднішнього дня, за ціллю (`"day"` або id звички). */
export function readMoments(dayKey: string): Record<string, Moment> {
  return read(dayKey) as Record<string, Moment>;
}

/**
 * Зберегти момент запису або прибрати рядки, яких запис більше не
 * підтверджує (зняту відмітку). Новий момент одразу йде в телеметрію
 * через наявний шов `value_signal_shown`: рядок зʼявляється в тому самому
 * елементі, який людина щойно натиснула, тобто показ стається тут.
 */
export function applyMoment(
  dayKey: string,
  module: string,
  moment: Moment | null,
  clearTargets: readonly string[] = [],
): void {
  const byTarget = { ...read(dayKey) };
  for (const t of clearTargets) delete byTarget[t];
  if (moment) byTarget[moment.target] = moment;
  safeWriteLS(KEY, { dayKey, byTarget });
  for (const listener of localListeners) listener();
  if (!moment) return;
  const signal = `${module}-moment-${moment.kind}`;
  markSignalShown({ signal, module });
  trackEvent(ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN, {
    module,
    signal,
    surface: "module",
  });
}

/**
 * Момент для цілі на сьогодні або `null`. Оновлюється, коли інша частина
 * екрана записала момент, на зміні доби пристрою і тоді, коли сховище
 * догрузилось.
 *
 * Останнє не дрібниця: `webKVStore` тримає ключ у SQLite-`kv_store`, а
 * до кінця асинхронного bootstrap читання падають у порожній
 * `localStorage`. Без `useStorageReady` перший рендер після
 * перезавантаження читав порожнечу і рядок зникав, хоч мав жити до кінця
 * доби (`core/db/storageReady.ts`).
 */
export function useMoment(target: string): Moment | null {
  const dayKey = useDeviceDayKey();
  const storageReady = useStorageReady();
  const [moment, setMoment] = useState<Moment | null>(
    () => readMoments(dayKey)[target] ?? null,
  );
  useEffect(() => {
    const sync = () => setMoment(readMoments(dayKey)[target] ?? null);
    sync();
    localListeners.add(sync);
    const unsubscribe = webKVStore.onChange(KEY, sync);
    return () => {
      localListeners.delete(sync);
      unsubscribe();
    };
  }, [dayKey, target, storageReady]);
  return moment;
}
