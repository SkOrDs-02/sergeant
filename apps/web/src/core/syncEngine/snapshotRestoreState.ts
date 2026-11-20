/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Чи триває зараз відновлення локальної копії зі знімка сервера
 * (`snapshotRestore.ts`). Читає аркуш «Синхронізація», щоб показати рядок
 * «Відновлення з сервера» (рішення власника 2026-11-19: відновлення тихе, у
 * фоні, видно лише там). Модульний стан на сторінку, без збереження: після
 * перезавантаження відновлення або почнеться знову, або вже не потрібне.
 */
import { useSyncExternalStore } from "react";

let restoring = false;
const listeners = new Set<() => void>();

export function setSnapshotRestoring(value: boolean): void {
  if (restoring === value) return;
  restoring = value;
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* слухач ніколи не має ламати синк */
    }
  }
}

export function isSnapshotRestoring(): boolean {
  return restoring;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `true`, поки триває відновлення зі знімка. */
export function useSnapshotRestoring(): boolean {
  return useSyncExternalStore(
    subscribe,
    isSnapshotRestoring,
    isSnapshotRestoring,
  );
}

/** Лише для тестів. */
export function __resetSnapshotRestoringForTests(): void {
  restoring = false;
  listeners.clear();
}
