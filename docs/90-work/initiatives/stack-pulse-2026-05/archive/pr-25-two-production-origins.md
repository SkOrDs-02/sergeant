# PR-25: Consolidate `fizruk.vercel.app` + `sergeant.vercel.app` → один production origin

> **Last touched:** 2026-07-20 by @cursoragent. **Next review:** ніколи (read-only архів).
> **Status:** Closed — merged [#3392](https://github.com/Skords-01/Sergeant/pull/3392) (301 redirect + Sentry release unification), CORS cleanup [#327](https://github.com/Skords-01/Sergeant/pull/327), OAuth console cleanup (@Skords-01 2026-07-20), ADR-0074 §74.2 single-origin policy (2026-07-20). Fast-forward archived 2026-07-20.

|                    |                                                                               |
| ------------------ | ----------------------------------------------------------------------------- |
| **Severity**       | Medium (M9)                                                                   |
| **Linked finding** | M9 (`00-overview.md`)                                                         |
| **Owner**          | @Skords-01                                                                    |
| **Effort**         | 1–2 дні + 7d soak                                                             |
| **Risk**           | Medium (мобайл users могли мати закешований OAuth callback на fizruk-домен)   |
| **Touches**        | Vercel project config, `apps/server/src/http/cors.ts`, OAuth provider configs |

## Контекст

Historically прод обслуговувався **двома** Vercel-доменами (`fizruk.vercel.app` + `sergeant.vercel.app`). Це дублювало CORS/OAuth/Sentry config. З consolidated origin canonical = `sergeant.vercel.app`; `fizruk.vercel.app` лишається лише як 301 redirect у `apps/web/vercel.json`.

## Acceptance criteria (DoD)

- [x] `apps/web/vercel.json` має 301 redirect.
- [x] `apps/server/src/http/cors.ts` без `fizruk.vercel.app` — [#327](https://github.com/Skords-01/Sergeant/pull/327).
- [x] Google / Apple OAuth allowlists без fizruk callback — manual cleanup @Skords-01 (2026-07-20).
- [x] Sentry releases єдиного формату `sergeant@${SHORT_SHA}` через shared `formatRelease` (`packages/shared/src/observability/release.ts`).
- [x] ADR-0074 §74.2 «Single origin policy» з rationale.
- [x] Тест: `apps/web/src/test/integration/redirect.test.ts` перевіряє 301 на `fizruk.vercel.app`.

## Refs

- [ADR-0074 §74.2](../../../../04-governance/adr/0074-hosting-hetzner-coolify.md#adr-742--single-canonical-web-origin)
- [Vercel rewrites + redirects](https://vercel.com/docs/edge-network/rewrites)
- ADR-0043 cloudsync v1 sunset (mentions fizruk vs sergeant)
