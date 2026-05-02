# Typography Audit 2026-04

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Короткий reference audit для Hard Rule #16.

## Findings

- У repo вже були випадки дріфту на typography scale, коли в UI потрапляли надто малі text sizes на interactive surfaces.
- Ручне міксування `font-size`, `line-height` і `font-weight` без semantic slots створювало непомітний, але накопичуваний visual drift.
- Найризикованіші місця: dashboard cards, secondary meta text, small labels на touch targets.

## Decision

- Встановити 12px як мінімальний typography floor для production UI, якщо немає окремо задокументованого винятку.
- Використовувати semantic `.text-style-*` utilities там, де роль елемента вже описана design system.
- Перевіряти typography changes разом із accessibility і touch-target rules, а не ізольовано.

## Related sources

- [AGENTS.md](../../AGENTS.md)
- [docs/design/design-system.md](../design/design-system.md)
- [docs/governance/hard-rules-matrix.md](../governance/hard-rules-matrix.md)
