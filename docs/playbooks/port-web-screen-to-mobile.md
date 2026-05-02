# Playbook: Port Web Screen to Mobile

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** "Перенести екран з `apps/web` у `apps/mobile`" / чергова фаза RN migration / mobile feature має повторити існуючий web capability без дублювання domain logic.

## Owner surface

- Primary surfaces: `apps/mobile`, `apps/web`
- Governing skills: `sergeant-mobile-expo`, `sergeant-monorepo-boundaries`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-mobile-expo`.
- Далі обов'язково звір `sergeant-monorepo-boundaries`, щоб винести shared logic у package, а не дублювати.
- Якщо screen залежить від нового API або schema change, спочатку виконай відповідний playbook для backend surface.

## Steps

### 1. Розклади web screen на reusable і platform-specific частини

- Shared domain logic
- Shared API contract
- Web-only UI glue
- Web-only storage, browser, router або DOM behavior

### 2. Винеси shared logic туди, де їй місце

- Domain math / parsing / schemas -> `packages/*`
- Shared API usage -> `packages/api-client`
- Не копіюй behavior просто тому, що так швидше сьогодні

### 3. Побудуй mobile screen нативно

- Використовуй Expo Router patterns.
- Не тягни web-only imports або DOM APIs.
- Використовуй mobile storage/runtime conventions замість browser ones.

### 4. Під'єднай дані і navigation

- React Query keys мають лишатись factory-based.
- Session/auth flow має бути mobile-safe.
- Navigation tree оновлюй у mobile layout, а не через web assumptions.

### 5. Перевір UX parity без pixel-copy

- Паритет поведінки важливіший за буквальне копіювання DOM layout.
- Переконайся, що mobile screen відчувається native і не ламає shared domain assumptions.

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm --filter @sergeant/mobile test`
- [ ] Немає DOM або web-only imports у mobile screen
- [ ] Shared logic не продубльована без причини
- [ ] Navigation і data flow працюють на mobile runtime

## When not to use this playbook

- Потрібно лише поправити існуючий mobile screen.
- Задача лише про shared domain package без UI переносу.

## Related playbooks and skills

- [add-api-endpoint.md](./add-api-endpoint.md)
- Skill: `sergeant-mobile-expo`
- Skill: `sergeant-monorepo-boundaries`
