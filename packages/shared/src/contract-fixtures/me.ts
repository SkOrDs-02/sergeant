/**
 * Canonical fixtures for `GET /api/me` / `GET /api/v1/me`.
 *
 * The route is described in `apps/server/src/routes/me.ts` and consumed
 * by `packages/api-client/src/endpoints/me.ts`. Both sides validate via
 * `MeResponseSchema` from `../schemas/api`.
 *
 * Each named case represents a real shape the producer might emit:
 *
 * - `minimal` — newly created account, no display name, no avatar,
 *   email verified.
 * - `full` — fully populated profile (name, avatar, email).
 * - `legacyNoCreatedAt` — pre-`createdAt` accounts where the column was
 *   nullable. Schema must accept `createdAt: null` (see
 *   `UserSchema` rationale at `schemas/api.ts:32`).
 * - `unverified` — email present but not yet verified — the UI
 *   conditionally surfaces a "verify email" banner off this flag.
 */

import { MeResponseSchema, type MeResponse } from "../schemas/api";

export const meFixtures = {
  minimal: {
    user: {
      id: "user_minimal_001",
      email: "minimal@example.com",
      name: null,
      image: null,
      emailVerified: true,
      createdAt: "2026-01-15T10:30:00.000Z",
    },
  },
  full: {
    user: {
      id: "user_full_002",
      email: "full@example.com",
      name: "Тест Фульний",
      image: "https://avatars.example.com/full.png",
      emailVerified: true,
      createdAt: "2025-09-01T08:15:42.000Z",
    },
  },
  legacyNoCreatedAt: {
    user: {
      id: "user_legacy_003",
      email: "legacy@example.com",
      name: "Legacy User",
      image: null,
      emailVerified: true,
      createdAt: null,
    },
  },
  unverified: {
    user: {
      id: "user_unverified_004",
      email: "pending@example.com",
      name: null,
      image: null,
      emailVerified: false,
      createdAt: "2026-04-20T12:00:00.000Z",
    },
  },
} as const satisfies Record<string, MeResponse>;

export type MeFixtureCase = keyof typeof meFixtures;

/**
 * Same fixtures, but typed as `unknown` — pass these into
 * `MeResponseSchema.parse()` to exercise the runtime parser path. The
 * `as const satisfies …` shape above already proves the static type is
 * valid; the `unknown` view proves the schema also accepts the JSON.
 */
export const meRawFixtures: Record<MeFixtureCase, unknown> = meFixtures;

/** Cheap self-check: every named fixture must parse through the schema. */
export function assertMeFixturesValid(): void {
  for (const [name, fixture] of Object.entries(meFixtures)) {
    const result = MeResponseSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "me.${name}" no longer matches MeResponseSchema: ${result.error.message}`,
      );
    }
  }
}
