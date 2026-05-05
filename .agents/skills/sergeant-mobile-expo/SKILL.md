---
name: sergeant-mobile-expo
description: Use when editing Sergeant Expo screens, React Native, mobile navigation, MMKV flows, Capacitor shell, or web→mobile ports; UA: правиш Expo/RN/MMKV/Capacitor/mobile-shell.
---

# Sergeant Mobile Expo

Sergeant mobile is not a thin copy of the web app. It uses Expo Router, NativeWind, mobile storage patterns, and platform-specific constraints that should stay distinct from `apps/web`.

## Covers

- `apps/mobile/**`
- `apps/mobile-shell/**`
- shared domain packages when the change is mobile-driven

## Hard Rules

- Treat NativeWind and Tailwind as related but not interchangeable.
- Use mobile storage conventions such as MMKV or the existing persistence layer; do not port raw web localStorage assumptions.
- Keep DOM or browser-only APIs out of mobile code.
- Each `_layout.tsx` is a navigation boundary; route changes should respect Expo Router structure.

## Placement

- cross-platform business logic -> domain packages under `packages/*-domain`
- mobile app UI and navigation -> `apps/mobile/**`
- Capacitor packaging glue only -> `apps/mobile-shell/**`

## Verify

- Run the nearest Jest coverage for the touched mobile surface.
- If navigation or deep links changed, inspect the matching docs in `docs/mobile/`.
- If the change ports a web feature, confirm which parts stay shared and which remain platform-specific.

## Playbooks

- `docs/playbooks/release.md` — canonical release playbook (Expo and Capacitor shell sections).
- Catalog: `docs/agents/agent-skills-catalog.md`.
