import client from "prom-client";

import { register } from "./registry.js";

// ───────────────────────── HTTP (RED) ─────────────────────────
export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status", "module"],
  registers: [register],
});

export const httpRequestDurationMs = new client.Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request duration in ms",
  labelNames: ["method", "path", "status_class"],
  buckets: [5, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [register],
});

// Дедикований лічильник 4xx/5xx по route: інкрементуємо тільки коли
// `status >= 400`, тож error-rate формулою стає
//   sum by (path) (rate(http_errors_total[5m]))
//   / sum by (path) (rate(http_request_duration_ms_count[5m]))
// без фільтра регексом по `status`. `module` лейбл із ALS потрібен, щоб
// алерти могли бути per-domain.
export const httpErrorsTotal = new client.Counter({
  name: "http_errors_total",
  help: "HTTP responses with status >= 400 by route",
  labelNames: ["method", "path", "status_class", "module"],
  registers: [register],
});

export const httpInFlight = new client.Gauge({
  name: "http_in_flight",
  help: "In-flight HTTP requests",
  labelNames: ["method"],
  registers: [register],
});
