/**
 * Public exports for the alerts module (ADR-0038). Callers (HTTP routes,
 * tests) import from here so internal file layout stays free to evolve.
 */

export * from "./types.js";
export {
  recordAlertPost,
  recordAlertAck,
  markAlertEscalated,
  listPendingAlerts,
} from "./store.js";
export type {
  RecordAlertPostInput,
  RecordAlertPostResult,
  RecordAlertAckInput,
  RecordAlertAckResult,
  MarkAlertEscalatedResult,
  ListPendingAlertsFilters,
} from "./store.js";
