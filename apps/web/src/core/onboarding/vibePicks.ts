/**
 * Thin web adapter over `@sergeant/shared/lib/vibePicks`. The shared
 * module owns key constants, sanitization and normalization rules;
 * this file just binds them to a `window.localStorage`-backed
 * `KVStore` so existing call-sites (OnboardingWizard, HubDashboard,
 * FirstActionSheet, analytics, …) keep the exact same API they had
 * before the mobile port.
 */

import {
  type DashboardModuleId,
  ALL_MODULES as SHARED_ALL_MODULES,
  dismissSoftAuth as sharedDismissSoftAuth,
  clearFirstActionPending as sharedClearFirstActionPending,
  getFirstActionStartedAt as sharedGetFirstActionStartedAt,
  getSessionDays as sharedGetSessionDays,
  getTimeToValueMs as sharedGetTimeToValueMs,
  getVibePicks as sharedGetVibePicks,
  isFirstActionPending as sharedIsFirstActionPending,
  isFirstRealEntryDone as sharedIsFirstRealEntryDone,
  isSoftAuthDismissed as sharedIsSoftAuthDismissed,
  markFirstActionPending as sharedMarkFirstActionPending,
  markFirstActionStartedAt as sharedMarkFirstActionStartedAt,
  markFirstRealEntryDone as sharedMarkFirstRealEntryDone,
  recordSessionDay as sharedRecordSessionDay,
  saveTimeToValueMs as sharedSaveTimeToValueMs,
  saveVibePicks as sharedSaveVibePicks,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage";

export type HubModuleId = DashboardModuleId;

export const ALL_MODULES: HubModuleId[] = [...SHARED_ALL_MODULES];

export function getVibePicks(): HubModuleId[] {
  return sharedGetVibePicks(webKVStore);
}

export function saveVibePicks(picks: HubModuleId[]): void {
  sharedSaveVibePicks(webKVStore, picks);
}

export function markFirstActionPending(): void {
  sharedMarkFirstActionPending(webKVStore);
}

export function clearFirstActionPending(): void {
  sharedClearFirstActionPending(webKVStore);
}

export function isFirstActionPending(): boolean {
  return sharedIsFirstActionPending(webKVStore);
}

export function markFirstRealEntryDone(): void {
  sharedMarkFirstRealEntryDone(webKVStore);
}

export function isFirstRealEntryDone(): boolean {
  return sharedIsFirstRealEntryDone(webKVStore);
}

export function isSoftAuthDismissed(): boolean {
  return sharedIsSoftAuthDismissed(webKVStore);
}

export function dismissSoftAuth(): void {
  sharedDismissSoftAuth(webKVStore);
}

export function markFirstActionStartedAt(): void {
  sharedMarkFirstActionStartedAt(webKVStore);
}

export function getFirstActionStartedAt(): number | null {
  return sharedGetFirstActionStartedAt(webKVStore);
}

export function saveTimeToValueMs(ms: number): void {
  sharedSaveTimeToValueMs(webKVStore, ms);
}

export function getTimeToValueMs(): number | null {
  return sharedGetTimeToValueMs(webKVStore);
}

export function recordSessionDay(): number {
  return sharedRecordSessionDay(webKVStore);
}

export function getSessionDays(): number {
  return sharedGetSessionDays(webKVStore);
}
