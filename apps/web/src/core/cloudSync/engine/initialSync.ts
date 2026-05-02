import { syncApi } from "@shared/api";
import { trackEvent, ANALYTICS_EVENTS } from "../../observability/analytics";
import { SYNC_MODULES } from "../config";
import { isModulePushSuccess } from "../conflict/pushSuccess";
import { resolveInitialSync } from "../conflict/resolver";
import {
  clearDirtyModule,
  getDirtyModules,
  getModuleModifiedTimes,
} from "../state/dirtyModules";
import { isMigrationDone, markMigrationDone } from "../state/migration";
import { applyModuleData, hasLocalData } from "../state/moduleData";
import { getModuleVersion, setModuleVersion } from "../state/versions";
import type {
  EngineArgs,
  PullAllModuleBody,
  PullAllResponse,
  PushAllResponse,
} from "../types";
import { buildModulesPayload } from "./buildPayload";
import { replayOfflineQueue } from "./replay";
import { retryAsync } from "./retryAsync";

export type InitialSyncArgs = EngineArgs & {
  onNeedMigration(): void;
};

type UserId = string | undefined;

function ensureMigrationDone(userId: UserId): void {
  if (!isMigrationDone(userId)) markMigrationDone(userId);
}

function applyAdoptCloud(
  applyModules: Array<{
    mod: string;
    data: Record<string, unknown>;
    version?: number;
  }>,
  userId: UserId,
): void {
  for (const { mod, data, version } of applyModules) {
    applyModuleData(mod, data);
    if (userId && version) setModuleVersion(userId, mod, version);
  }
}

async function applyMerge(
  plan: {
    applyModules: Array<{ mod: string; data: Record<string, unknown> }>;
    setVersions: Array<{ mod: string; version: number }>;
    dirtyMods: string[];
    skippedDirty: string[];
  },
  userId: UserId,
): Promise<void> {
  for (const { mod, data } of plan.applyModules) applyModuleData(mod, data);
  if (userId) {
    for (const { mod, version } of plan.setVersions) {
      // Не підтягуємо cloud-version для модулів, чиї cloud-дані ми зараз
      // свідомо пропустили через локальні непушнуті зміни (`skippedDirty`).
      // Інакше наступний push не побачить різниці й проковтне conflict.
      if (plan.skippedDirty.includes(mod)) continue;
      setModuleVersion(userId, mod, version);
    }
  }
  if (plan.skippedDirty.length > 0) {
    // Мʼяке логування для тріажу — щоб було видно, що initialSync НЕ накотив
    // cloud на ці модулі. Pushу нижче уже обробить їх як звичайні dirty-мод-и.
    console.warn(
      "[cloudSync] initialSync: skipped cloud apply for dirty modules",
      plan.skippedDirty,
    );
  }
  if (plan.dirtyMods.length === 0) return;
  const modules = buildModulesPayload(plan.dirtyMods, getModuleModifiedTimes());
  if (Object.keys(modules).length === 0) return;
  // Let ApiError propagate to the caller's catch so onError fires and
  // markMigrationDone is skipped — matches pre-refactor behavior where
  // `if (pushRes.ok) clearAllDirty()` combined with the syncApi-throwing
  // transport meant a push failure aborted the whole initialSync.
  const pushResult = (await retryAsync(() => syncApi.pushAll(modules), {
    label: "initialSync.merge",
  })) as PushAllResponse;
  // Per-module clear: якщо сервер повернув `{ conflict: true }` (LWW loser),
  // `clearAllDirty()` мовчки дропав локальний dirty-флаг → наступний pull
  // накатував cloud, і локальні зміни зникали без попередження. Тепер
  // очищаємо лише не-conflict модулі, а conflict-модулі лишаються dirty і
  // будуть перевідправлені разом із наступним push-у (або користувач
  // побачить попередження через telemetry).
  const results = pushResult?.results ?? {};
  const conflicted: string[] = [];
  for (const mod of Object.keys(modules)) {
    const r = results[mod];
    if (isModulePushSuccess(r)) {
      clearDirtyModule(mod);
    } else {
      conflicted.push(mod);
    }
  }
  if (conflicted.length > 0) {
    console.warn(
      "[cloudSync] initialSync.merge: server rejected push for modules (kept dirty for retry)",
      conflicted,
    );
    // Окрема подія для initial-merge гілки: сигналізує про збіг dirty-flag
    // і cloud-snapshot, який свіжіший за локальну версію — типово трапляється
    // коли користувач вмикає синк на другому пристрої.
    trackEvent(ANALYTICS_EVENTS.SYNC_CONFLICT_RESOLVED, {
      kind: "initial-merge",
      modules: conflicted.length,
    });
  }
}

/**
 * First-run sync after auth: drain offline queue, pull cloud state, and
 * reconcile with local state via `resolveInitialSync`.
 *
 * Returns `true` when the run completed without throwing (including the
 * `needMigration` branch, which is a completed decision — not a failure —
 * and whose resolution happens via the modal). Returns `false` if any
 * network / API error was caught, so the caller can decide whether to
 * retry. Behavior otherwise matches the original `initialSync` in
 * `useCloudSync.js` 1:1.
 */
export async function initialSync(args: InitialSyncArgs): Promise<boolean> {
  const { user, onStart, onSuccess, onError, onNeedMigration, onSettled } =
    args;
  onStart();
  try {
    await replayOfflineQueue();

    const { modules: cloudModules } = (await retryAsync(
      () => syncApi.pullAll(),
      { label: "initialSync.pull" },
    )) as PullAllResponse;

    const plan = resolveInitialSync({
      cloud: cloudModules as
        | Record<string, PullAllModuleBody | undefined>
        | undefined,
      hasAnyLocalData: Object.keys(SYNC_MODULES).some(hasLocalData),
      migrated: isMigrationDone(user?.id),
      userId: user?.id,
      modifiedTimes: getModuleModifiedTimes(),
      getLocalVersion: getModuleVersion,
      dirtyModules: getDirtyModules(),
    });

    if (plan.kind === "needMigration") {
      onNeedMigration();
      return true;
    }

    switch (plan.kind) {
      case "adoptCloud":
        applyAdoptCloud(plan.applyModules, user?.id);
        break;
      case "merge":
        await applyMerge(plan, user?.id);
        break;
      case "noop":
        break;
    }
    ensureMigrationDone(user?.id);

    onSuccess(new Date());
    return true;
  } catch (err) {
    args.onErrorRaw?.(err);
    onError(err instanceof Error ? err.message : String(err));
    return false;
  } finally {
    onSettled();
  }
}
