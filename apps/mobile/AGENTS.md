# Agents in apps/mobile

> **Last validated:** 2026-05-10 by @Skords-01 / Devin. **Next review:** 2026-08-08.
> **Status:** Active

> **Single source of truth → root [`AGENTS.md`](../../AGENTS.md).** Sub-tree quick reference для агентів, що працюють в `apps/mobile/` (Expo + React Native). Сусідній `apps/mobile-shell/` (Capacitor wrapper) ділить ту саму specialist skill, але має окрему build pipeline (web bundle через `apps/web`).

## Specialist skill

[`.agents/skills/sergeant-mobile-expo/SKILL.md`](../../.agents/skills/sergeant-mobile-expo/SKILL.md) — `apps/mobile`, `apps/mobile-shell`, Expo Router boundaries, NativeWind, MMKV, no DOM leakage.

## Stack snapshot

Expo 52 + React Native 0.76 + Expo Router (file-based) + NativeWind. Storage: MMKV (не localStorage). Тести: Jest. E2E: Detox (iOS sim). Статус — **internal dev-client**: готово до `eas build --profile development`, ще не для store. Mobile strategy ADR — [`0052-mobile-strategy-capacitor-primary`](../../docs/adr/0052-mobile-strategy-capacitor-primary.md).

## Quick commands

```bash
pnpm --filter @sergeant/mobile start            # Expo dev server
pnpm --filter @sergeant/mobile ios              # iOS sim
pnpm --filter @sergeant/mobile android          # Android emu
pnpm --filter @sergeant/mobile web              # Expo web (debug)
pnpm --filter @sergeant/mobile typecheck
pnpm --filter @sergeant/mobile test             # Jest (--passWithNoTests OK)
pnpm --filter @sergeant/mobile test:coverage
pnpm --filter @sergeant/mobile e2e:test:ios     # Detox iOS sim
pnpm --filter @sergeant/mobile check-build-config  # before EAS build
```

## Surface-specific gotchas

- **No DOM leakage:** mobile-код не імпортує `window`/`document`/DOM-only API. Перевіряй імпорти зі shared-пакетів і не тягни напряму з `apps/web`. ESLint ловить найочевидніше — але краще перевіряти у feature-cycle.
- **Storage:** MMKV, не localStorage. Спільні утиліти зі shared-пакетів повинні бути storage-agnostic (приймати storage adapter), інакше web/mobile почнуть розходитись.
- **Routing:** Expo Router file-based (`app/` directory). Не плутати з `react-router-dom` з web.
- **NativeWind:** Tailwind-like, але **не** Tailwind — частина класів не підтримується. Tailwind preset з `@sergeant/design-tokens` — джерело правди для токенів; перевіряй сумісність із NativeWind перед використанням.
- **Build config:** `pnpm --filter @sergeant/mobile check-build-config` валідує `app.config.ts` + `eas.json` перед EAS build — запускай локально перед PR, що чіпає mobile config.
- **Domain invariants** (Kyiv time, kopiykas as `number`, Better Auth opaque user IDs) — однакові з web/server, див. корінь.

## Deeper docs

- App README: [`apps/mobile/README.md`](./README.md)
- Mobile strategy ADR: [`docs/adr/0052-mobile-strategy-capacitor-primary.md`](../../docs/adr/0052-mobile-strategy-capacitor-primary.md)
- Capacitor / deep links / RN migration: [`docs/mobile/`](../../docs/mobile/)
- Routing catalog: [`docs/agents/agent-skills-catalog.md`](../../docs/agents/agent-skills-catalog.md)
- Domain invariants: [`docs/architecture/domain-invariants.md`](../../docs/architecture/domain-invariants.md)
