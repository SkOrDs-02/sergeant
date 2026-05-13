/**
 * Public exports for the alerts module (ADR-0038). Callers (HTTP routes,
 * tests) import from here so internal file layout stays free to evolve.
 */

export * from "./types.js";
export {
  recordAlertPost,
  recordAlertAck,
  markAlertEscalated,
  markAlertRepeated,
  markAlertSentryWarned,
  markAlertSnoozed,
  listPendingAlerts,
  findRecentDedupMatch,
  incrementOccurrence,
  recordTelegramMessage,
} from "./store.js";
export type {
  RecordAlertPostInput,
  RecordAlertPostResult,
  RecordAlertAckInput,
  RecordAlertAckResult,
  MarkAlertEscalatedResult,
  MarkAlertRepeatedResult,
  MarkAlertSentryWarnedResult,
  MarkAlertSnoozedInput,
  MarkAlertSnoozedResult,
  ListPendingAlertsFilters,
  FindRecentDedupMatchInput,
  IncrementOccurrenceResult,
  RecordTelegramMessageInput,
} from "./store.js";
export {
  postOrEditDedupedAlert,
  formatOccurrenceCounterText,
  createTelegramApiClient,
  DEFAULT_DEDUP_WINDOW_MS,
} from "./telegramShipper.js";
export type {
  PostOrEditDedupedAlertInput,
  PostOrEditDedupedAlertResult,
  TelegramApiClient,
  TelegramSendMessageInput,
  TelegramSendMessageOutput,
  TelegramEditMessageInput,
  TelegramEditMessageOutput,
} from "./telegramShipper.js";
