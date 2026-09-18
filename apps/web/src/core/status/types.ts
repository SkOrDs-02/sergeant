/**
 * Wire types for the `/api/status` response (PR-41).
 *
 * Single source of truth lives in `apps/server/src/http/status.ts` —
 * the server cannot import from `apps/web`, and `apps/web` cannot
 * import server-internals, so we keep a small structural duplicate
 * here and assert it against the server shape in
 * `StatusPage.test.tsx` (covers compile-time + runtime drift).
 */

export type ComponentStatus = "operational" | "degraded" | "down";

export type ComponentId = "server" | "database" | "n8n" | "console-bot";

export interface StatusComponent {
  id: ComponentId;
  label: string;
  status: ComponentStatus;
}

export interface StatusLastIncident {
  at: string;
  component: ComponentId;
}

export interface StatusResponse {
  status: ComponentStatus;
  timestamp: string;
  components: StatusComponent[];
  lastIncident: StatusLastIncident | null;
}
