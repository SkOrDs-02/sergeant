# PR-08: API versioning consolidation (видалити v1-rewrite-shim)

> **Last validated:** 2026-05-03 by Devin. **Next review:** 2026-08-03.
> **Status:** Planned

|              |                                                                       |
| ------------ | --------------------------------------------------------------------- |
| **Severity** | High (H2)                                                             |
| **Owner**    | TBD                                                                   |
| **Effort**   | 0.5 дня                                                               |
| **Risk**     | Medium (видалення shim-а може вплинути на mobile-shell старих версій) |
| **Touches**  | `apps/server/src/app.ts`, OpenAPI spec, mobile API-клієнт             |

## Контекст

```ts
// apps/server/src/app.ts:41–53 (приблизно)
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/v1/")) {
    req.url = req.url.replace("/api/v1/", "/api/");
  }
  next();
});
```

Цей shim:

- Existed «just in case» — клієнти ніколи не вказували `/v1/`.
- Стійкий до видалення: якщо мобільний клієнт відправляє `/v1/`, він autonomously redirected без awareness-у.
- Робить **версіонування ілюзорним**: `/api/v2/` ніколи не зможе існувати окремо, бо немає роутингу що це різні layers.

Якщо api-versioning потрібно — слід використати proper `Accept: application/vnd.sergeant.v2+json` header або path-based з реальним routing-divergence. Якщо не потрібно — видалити shim.

## Scope

### Decision першочергово (research, не цей PR)

- Перевірити логи Vercel/Railway за останні 30 днів: чи є **будь-які** запити з `/api/v1/`?
  - Якщо ні (probable): просто видалити shim.
  - Якщо так (mobile-shell старих versions): додати explicit deprecation-header `Sunset:` з датою sunset, тримати shim 90 днів, потім видалити.

### Implementation (after decision)

- Видалити middleware (lines 41–53).
- Оновити OpenAPI spec (`apps/server/openapi.yaml` if exists) — переконатись, що тільки `/api/...` paths.
- Якщо клієнти на v1 знайдені:
  - Sentry breadcrumb на кожному `/api/v1/` request з `tag: deprecated_v1_path`.
  - Email-notification до mobile-team з вимогою upgrade.
  - У `apps/mobile-shell/Info.plist` додати `MIN_API_PATH_VERSION=v2` (якщо ще немає).

## Out of scope

- Real API-versioning strategy (це окремий ADR, якщо потрібен v2 у майбутньому).

## Acceptance criteria (DoD)

- [ ] 30-day Vercel/Railway log analysis report — у `docs/notes/spikes/2026-05-api-v1-usage.md`.
- [ ] Якщо usage > 0 → 90-day deprecation plan з `Sunset:` header і tracking-метриками.
- [ ] Якщо usage == 0 → shim видалений, OpenAPI clean.
- [ ] Тест: `GET /api/v1/health` повертає 404 (after removal).
- [ ] ADR-0044 «No prefix-based API versioning unless v2 split is real» (якщо decision = remove).

## Тести

- `apps/server/src/__tests__/api-versioning.test.ts` — `/api/v1/health` → 404 (після видалення) або `200` з `Sunset:` header (під час deprecation).

## Rollout

- 1 PR на decision (research). 1 PR на implementation. Якщо deprecation — 3-й PR на final removal через 90 днів.

## Risks & mitigations

| Risk                                     | Mitigation                                           |
| ---------------------------------------- | ---------------------------------------------------- |
| Старі mobile-shell-и зламаються          | 90-day grace + monitoring + force-upgrade dialog     |
| Видаляли shim — потім виявили v1-traffic | Шukати тільки після log-analysis + Sentry monitoring |

## Touchpoints (file:line)

- `apps/server/src/app.ts:41–53`
- `apps/server/openapi.yaml` (якщо існує)
- `apps/mobile-shell/` — config-check
- `docs/adr/0044-api-versioning-policy.md` — новий ADR

## Refs

- [HTTP `Sunset` header RFC 8594](https://datatracker.ietf.org/doc/html/rfc8594)
- Stripe API versioning model
