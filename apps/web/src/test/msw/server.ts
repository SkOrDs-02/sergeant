// MSW server instance for Vitest (Node / jsdom).
//
// Usage in a test file:
//
//   import { server } from "../../test/msw/server";
//   import { http, HttpResponse } from "msw";
//
//   beforeEach(() => {
//     server.use(
//       http.get("*/api/v1/mono", () =>
//         HttpResponse.json({ name: "Test", accounts: [] }),
//       ),
//     );
//   });
//
// The server lifecycle (listen / resetHandlers / close) is wired in
// `src/test/setup.ts` so every test suite starts clean.
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
