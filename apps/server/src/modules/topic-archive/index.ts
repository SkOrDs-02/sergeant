/**
 * Public exports for the topic-archive module (migration 047). Callers
 * (HTTP routes, tools, tests) import from here so internal file layout
 * stays free to evolve.
 */

export * from "./types.js";
export { recordTopicMessage, listTopicMessages } from "./store.js";
export type {
  RecordTopicMessageInput,
  RecordTopicMessageResult,
  ListTopicMessagesFilters,
} from "./store.js";
