/**
 * @scaffolded
 * @status Scaffolded
 * @owner @Skords-01
 * @nextStep Wire `internalFetch` into the routine-strategy dev surface
 *           (goals/list, weekly review) and delete this tag once a live
 *           caller imports it. See AGENTS.md → Hard Rule #10.
 *
 * Scaffolded helper — knip reports zero importers until the routine-strategy
 * dev wiring lands. Do NOT delete as part of dead-code cleanup — see Hard
 * Rule #10 in AGENTS.md.
 *
 * Browser-side wrapper for `/api/internal/*` calls (audit
 * `docs/audits/2026-05-13-page-audit-09-routine-strategy.md` F1 —
 * Option B: keep internal-route, ship bearer from a dev env var).
 *
 * `INTERNAL_API_KEY` is the same PAT the n8n workflows send; the server
 * accepts it on `/api/internal/*` routes. Exposing it to the browser is
 * acceptable ONLY in dev — Hard Rule #20 explicitly forbids shipping
 * PATs to production. In prod builds `VITE_INTERNAL_API_KEY` is unset
 * and `internalFetch` short-circuits to a `403` response so caller
 * code surfaces the misconfiguration (instead of silently leaking the
 * request without auth).
 *
 * Usage:
 * ```ts
 * const res = await internalFetch("/api/internal/strategic/goals/list", {
 *   method: "POST",
 *   body: JSON.stringify({ weekStart }),
 * });
 * ```
 *
 * Caller still owns `Content-Type` / `Accept` / response parsing.
 */
export async function internalFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const key = import.meta.env["VITE_INTERNAL_API_KEY"] as string | undefined;
  if (!key) {
    // Hard Rule #20: refuse to send an unauthenticated request to an
    // `/api/internal/*` route from the browser. Return a synthetic 403
    // so callers fall into their existing error path with a clear
    // signal that the dev env is misconfigured (or the call slipped
    // into a prod build that should never see this code path).
    return new Response(
      JSON.stringify({
        ok: false,
        error: "internal_api_key_missing",
        message:
          "VITE_INTERNAL_API_KEY is not set — refusing to call /api/internal/* unauthenticated.",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${key}`);
  return fetch(path, { ...init, headers });
}
