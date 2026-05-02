/**
 * Public entry-point для OpenAPI generation.
 *
 * Imports:
 *   - `import { buildOpenApiDocument } from "@sergeant/shared/openapi"` —
 *     повертає готовий OpenAPI 3.1 JSON-документ.
 */
import { createDocument } from "zod-openapi";

import { paths } from "./routes";

export { paths };

/**
 * Збирає фінальний OpenAPI 3.1 документ. Викликається з generator-скрипта
 * (`scripts/api/generate-openapi.mjs`) і з тестів.
 */
export function buildOpenApiDocument() {
  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "Sergeant API",
      version: "v1",
      description:
        "Сгенеровано з zod-схем у `@sergeant/shared/schemas/api`. " +
        "Не редагуй вручну — `pnpm api:generate-openapi` перегенерує.",
    },
    servers: [
      {
        url: "https://sergeant.app",
        description: "Production (Vercel edge → Railway)",
      },
      {
        url: "http://localhost:3000",
        description: "Local dev (apps/server, default Express PORT)",
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description:
            "Better Auth session cookie. Web-клієнт надсилає автоматично; mobile використовує bearerAuth.",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Mobile (Expo) bearer-токен з Better Auth. Web використовує cookieAuth.",
        },
      },
    },
    paths,
  });
}
