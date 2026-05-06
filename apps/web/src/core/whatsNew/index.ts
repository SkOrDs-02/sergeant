/**
 * Barrel for `<WhatsNewModal />` (PR-18 у FTUX master tracker §3.3).
 *
 * HubHomeView рендерить modal через цей entry-point — driver-hook +
 * presentational component поряд, тести / storybook deep-import-ять
 * напряму.
 */

export { WhatsNewModal } from "./WhatsNewModal";
export type { WhatsNewModalProps } from "./WhatsNewModal";

export { useWhatsNew, SHOW_DELAY_MS } from "./useWhatsNew";
export type { UseWhatsNewOptions, UseWhatsNewResult } from "./useWhatsNew";

export { RELEASES, pickRelease } from "./releases";
export type {
  WhatsNewCta,
  WhatsNewItem,
  WhatsNewItemKind,
  WhatsNewRelease,
} from "./releases";

export {
  readLastSeenId,
  writeLastSeenId,
  WHATS_NEW_LAST_SEEN_KEY,
} from "./storage";
