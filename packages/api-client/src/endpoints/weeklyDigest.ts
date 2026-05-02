import type {
  WeeklyDigestRequest as SharedWeeklyDigestRequest,
  WeeklyDigestResponse as SharedWeeklyDigestResponse,
  WeeklyDigestReport as SharedWeeklyDigestReport,
} from "@sergeant/shared/schemas";
import type { HttpClient } from "../httpClient";

// SSOT for the `/api/weekly-digest` contract lives in
// `@sergeant/shared/schemas/api` (AGENTS.md Hard Rule #3). Both the server
// handler and this api-client derive their types from the same Zod schema;
// the server additionally validates Claude's output against the schema
// before it ever reaches this client.
//
// Historical: every field of both the request (`WeeklyDigestPayload`) and
// the response (`WeeklyDigestResponse`) was typed as `unknown`, which was a
// way to silence the type checker rather than describe the contract. The
// request is a structured weekly-aggregate blob (`WeeklyDigestSchema`), and
// the response is a four-module AI-generated report (`WeeklyDigestReportSchema`)
// — both are now honestly typed.

export type WeeklyDigestPayload = SharedWeeklyDigestRequest;
export type WeeklyDigestReport = SharedWeeklyDigestReport;
export type WeeklyDigestResponse = SharedWeeklyDigestResponse;

export interface WeeklyDigestEndpoints {
  generate: (payload: WeeklyDigestPayload) => Promise<WeeklyDigestResponse>;
}

export function createWeeklyDigestEndpoints(
  http: HttpClient,
): WeeklyDigestEndpoints {
  return {
    generate: (payload) =>
      http.post<WeeklyDigestResponse>("/api/weekly-digest", payload),
  };
}
