/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * Що зникне з виходом з акаунта: недоставлена черга синку (`data-19`) плюс
 * анонімні рядки незавершеного переносу цього акаунта (`data-46`). Одна
 * функція для `logout()` і для `SessionsSection`, яка питає ДО відкликання
 * сесії: два лічильники в двох місцях розійшлися б.
 */
import {
  countLogoutLoss,
  inspectAnonymousLeftoversOnLogout,
  type AnonymousLeftovers,
} from "../durability/anonymousLeftoversOnLogout";
import { flushPendingSyncOpsBeforeLogout } from "../syncEngine/flushBeforeLogout";

export interface LogoutLossCheck {
  /** Скільки записів зникне (для діалогу); `0` — питати нема про що. */
  readonly lost: number;
  /** Скільки з них анонімні рядки, які ще не перенесено в профіль. */
  readonly anonymousRows: number;
  /**
   * Незавершений перенос цього акаунта, якщо він є. `logout()` стирає його
   * лише після згоди людини (або коли `lost === 0`).
   */
  readonly leftovers: AnonymousLeftovers | null;
}

export async function checkLogoutLoss(): Promise<LogoutLossCheck> {
  const { pending, unknown } = await flushPendingSyncOpsBeforeLogout();
  // `unknown` — fail-open, як і раніше: черга недостовірна й рахується як 0.
  const queued = unknown ? 0 : pending;
  const leftovers = await inspectAnonymousLeftoversOnLogout();
  return {
    lost: countLogoutLoss(queued, leftovers),
    anonymousRows: leftovers?.rows ?? 0,
    leftovers,
  };
}
