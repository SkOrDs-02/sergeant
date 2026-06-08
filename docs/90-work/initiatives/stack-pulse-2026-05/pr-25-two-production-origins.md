# PR-25: Consolidate `fizruk.vercel.app` + `sergeant.vercel.app` → один production origin

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Planned

|                    |                                                                               |
| ------------------ | ----------------------------------------------------------------------------- |
| **Severity**       | Medium (M9)                                                                   |
| **Linked finding** | M9 (`00-overview.md`)                                                         |
| **Owner**          | TBD (sponsor: @Skords-01)                                                     |
| **Effort**         | 1–2 дні + 7d soak                                                             |
| **Risk**           | Medium (мобайл users можуть мати закешований OAuth callback на fizruk-домен)  |
| **Touches**        | Vercel project config, `apps/server/src/http/cors.ts`, OAuth provider configs |
| **Trigger**        | next CSP / CORS-related incident OR mobile-shell deep-link bug                |

## Контекст

Зараз продакшн обслуговується **двома** Vercel-доменами:

- `fizruk.vercel.app` — historic domain (з часів коли app називався Fizruk-only)
- `sergeant.vercel.app` — current canonical (після rebrand-у)

Обидва відповідають на однаковий traffic. Але:

- CORS allowlist у `apps/server/src/http/cors.ts` має дублі.
- OAuth provider redirect-URI list (Google, Apple) має entries для обох.
- Sentry releases dedupe-ляться по domain → подвійний ріст errors.
- Mobile-shell (Capacitor) deep-link `mailto://` config має 2 origins.
- ADR-0009 hosting split не пояснює, чому два, не один.

При CSP-update / CORS-change потрібно дублювати правки. Невипадкові incidents від drift-у вже траплялись (ADR-0043 згадує).

## Scope

### 1. Decision: keep `sergeant.vercel.app`

`fizruk.vercel.app` → 301 redirect на `sergeant.vercel.app` через Vercel rewrites:

```json
// apps/web/vercel.json
{
  "redirects": [
    {
      "source": "/:path*",
      "has": [{ "type": "host", "value": "fizruk.vercel.app" }],
      "destination": "https://sergeant.vercel.app/:path*",
      "permanent": true
    }
  ]
}
```

### 2. CORS / CSRF / OAuth cleanup

- `apps/server/src/http/cors.ts` — drop fizruk.vercel.app з allowlist через 30 днів after redirect deploy.
- Google / Apple / GitHub OAuth — drop fizruk callback URI through provider console.

### 3. Sentry releases unification

`packages/shared/src/observability/release.ts` — `release: sergeant@${SHORT_SHA}` (без origin-у). Це також закриває R3 redundancy (cross-SDK release-name).

### 4. Capacitor / mobile-shell

`apps/mobile-shell/src/index.ts` — single origin reference. Існуючий `parseDeepLink.test.ts` перевіряє sergeant.vercel.app.

### 5. ADR update

`docs/adr/0009-hosting-split-railway-vercel.md` — додати section «Single origin policy» з rationale (CORS simplification, Sentry release dedup, OAuth allowlist).

## Out of scope

- Migration на custom domain (e.g., `app.sergeant.io`) — окремий PR.
- Deprecation OAuth providers що не підтримують HTTPS-only callbacks — backlog.

## Acceptance criteria (DoD)

- [ ] `apps/web/vercel.json` має 301 redirect.
- [ ] `apps/server/src/http/cors.ts` без `fizruk.vercel.app` (через 30d soak).
- [ ] Google / Apple OAuth allowlists без fizruk callback (manual step + screenshot).
- [ ] Sentry releases єдиного формату `sergeant@${SHORT_SHA}` через 3 SDK (server, web, mobile).
- [ ] ADR-0009 оновлений з single-origin rationale.
- [ ] Тест: `apps/web/src/test/integration/redirect.test.ts` перевіряє 301 на `fizruk.vercel.app`.

## Тести

- `apps/server/src/http/cors.test.ts` — після cleanup, `fizruk.vercel.app` блокується.
- E2E: real-fetch test з `Origin: https://fizruk.vercel.app` → 403 (post-30d).

## Rollout

1. PR-1: 301 redirect + Sentry release unification (no breaking change for users).
2. 30d monitoring of redirect-traffic ratio (target: <1% requests з old domain).
3. PR-2: drop fizruk з CORS / OAuth allowlists.

## Risks & mitigations

| Risk                                                                        | Mitigation                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Mobile-shell з cached OAuth callback на fizruk → 301 redirect ламає OAuth   | Mobile-shell вже має sergeant.vercel.app у `parseDeepLink.test.ts`; додати regression test |
| External webhooks (Monobank, etc.) hardcoded fizruk endpoint                | Audit `MONOBANK_WEBHOOK_URL` env-var; одно-разовий update у Monobank console               |
| Redirect cycle (fizruk → sergeant, але sergeant → fizruk при redirect-loop) | Unit-test перевіряє правило одностороннє                                                   |

## Touchpoints (file:line)

- `apps/web/vercel.json` — нові redirects
- `apps/server/src/http/cors.ts` — drop fizruk.vercel.app (post-soak)
- `apps/server/src/http/cors.test.ts` — update assertions
- `apps/mobile-shell/src/index.ts` — verify single origin
- `apps/mobile-shell/src/__tests__/parseDeepLink.test.ts` — assertions
- `packages/shared/src/observability/release.ts` — single release format
- `docs/adr/0009-hosting-split-railway-vercel.md` — add section

## Refs

- [Vercel rewrites + redirects](https://vercel.com/docs/edge-network/rewrites)
- ADR-0009 hosting split
- ADR-0043 cloudsync v1 sunset (mentions fizruk vs sergeant)
