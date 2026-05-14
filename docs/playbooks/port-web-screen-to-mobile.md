# Playbook: Порт web-екрану в mobile

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

**Trigger:** "Перенести екран з `apps/web` у `apps/mobile`" / чергова фаза RN migration / mobile-фіча повинна повторити існуючий web capability без дублювання domain-логіки.

## Owner surface

- Primary surfaces: `apps/mobile`, `apps/web`.
- Governing skills: `sergeant-mobile-expo`, `sergeant-monorepo-boundaries`.

## Required context

- Спершу `sergeant-start-here`, потім `sergeant-mobile-expo`.
- Далі обов'язково звір `sergeant-monorepo-boundaries`, щоб винести shared-логіку в пакет, а не дублювати.
- Якщо екран залежить від нового API або schema change — спочатку виконай відповідний playbook для backend-поверхні.

## Steps

### 1. Розклади web-екран на reusable і platform-specific частини

- Спільна domain-логіка.
- Спільний API contract.
- Web-only UI glue (розмітка, DOM-виклики).
- Web-only storage, browser, router або DOM behavior.

### 2. Винеси shared-логіку туди, де їй місце

- Domain math / parsing / schemas → `packages/*`.
- Спільне використання API → `packages/api-client`.
- Не копіюй поведінку просто тому, що так швидше сьогодні.

### 3. Побудуй mobile-екран нативно

- Використовуй Expo Router patterns.
- Не тягни web-only imports або DOM API.
- Вживай mobile-conventions для storage та runtime замість browser-варіантів.

### 4. Під'єднай дані і navigation

- React Query keys мають залишатися factory-based.
- Session/auth flow має бути mobile-safe.
- Navigation-дерево оновлюй у mobile layout, а не через web-ассумпції.

### 5. Перевір UX parity без pixel-copy

- Паритет поведінки важливіший за буквальне копіювання DOM layout.
- Переконайся, що mobile-екран відчувається native і не ламає shared-domain ассумпцій.

## Verification

- [ ] `pnpm lint`.
- [ ] `pnpm typecheck`.
- [ ] `pnpm --filter @sergeant/mobile test`.
- [ ] У mobile-екрані немає DOM або web-only imports.
- [ ] Shared-логіка не продубльована без причини.
- [ ] Navigation і data flow працюють на mobile-runtime.

## Коли цей playbook не застосовується

- Потрібно лише поправити існуючий mobile-екран — UI-переносу немає.
- Задача лише про shared-domain пакет без UI-поверхні.

## Related playbooks and skills

- [add-api-endpoint.md](./add-api-endpoint.md)
- Skill: `sergeant-mobile-expo`
- Skill: `sergeant-monorepo-boundaries`
