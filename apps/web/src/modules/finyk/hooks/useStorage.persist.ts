import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { readJSON, writeJSONDebounced } from "../lib/finykStorage";

export function reportSilentError(scope: string, error: unknown) {
  console.warn(`[finyk] ${scope}`, error);
}

// Визначаємо "очікувану форму" за дефолтом: array / plain-object / скаляр.
// Це дозволяє тихо відкинути пошкоджений JSON у localStorage (наприклад,
// коли ключ випадково був перезаписаний іншим модулем або ручною правкою)
// і ввімкнути модуль з дефолтом, замість того щоб падати на мапах/фільтрах.
export function matchesShape(value: unknown, defaultVal: unknown): boolean {
  if (Array.isArray(defaultVal)) return Array.isArray(value);
  if (defaultVal && typeof defaultVal === "object") {
    return value != null && typeof value === "object" && !Array.isArray(value);
  }
  return true;
}

export function usePersist<T>(
  key: string,
  defaultVal: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [val, setVal] = useState<T>(() => {
    const stored = readJSON(key, defaultVal);
    if (!matchesShape(stored, defaultVal)) {
      reportSilentError(`usePersist shape mismatch ("${key}")`, stored);
      return defaultVal;
    }
    return stored as T;
  });
  useEffect(() => {
    writeJSONDebounced(key, val);
  }, [key, val]);
  return [val, setVal];
}
