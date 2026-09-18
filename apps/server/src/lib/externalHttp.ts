import {
  externalHttpDurationMs,
  externalHttpRequestsTotal,
} from "../obs/metrics.js";

/**
 * Уніфікований recorder для outbound HTTP-викликів. Замінює чотири
 * майже ідентичні per-upstream helper-и (`recordMono`, `recordPrivat`,
 * `recordLookup`, `recordSend`) — лейбл `upstream` відрізняв їх один від
 * одного і більше нічим.
 *
 * Викликай ОДИН раз на обробку зовнішнього запиту (навіть при retry —
 * рахуємо «логічний» outcome, не кожну HTTP-спробу окремо). Всі throw-и
 * всередині блоку metrics перехоплюються: metrics не мають ламати handler.
 *
 * `outcome` — вільний рядок, але на практиці одне з:
 * `"ok" | "error" | "timeout" | "rate_limited" | "hit" | "circuit_open"`.
 * Типізуємо як `string`, а не union: нові outcome-и додаються регулярно,
 * а card-множина Prometheus-лейбла і так контрольована cardinality-перевіркою
 * у `server/obs/metrics.js`.
 */
export type ExternalHttpOutcome = string;

export function recordExternalHttp(
  upstream: string,
  outcome: ExternalHttpOutcome,
  ms?: number | null,
): void {
  try {
    externalHttpRequestsTotal.inc({ upstream, outcome });
    if (ms != null) {
      externalHttpDurationMs.observe({ upstream, outcome }, ms);
    }
  } catch {
    /* metrics must never break a request */
  }
}
