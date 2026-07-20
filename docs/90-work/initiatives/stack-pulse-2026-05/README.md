# Stack pulse — 2026-05

> **Last touched:** 2026-07-20 by @cursoragent. **Next review:** 2026-10-18.
> **Status:** Closed (residual carry-over) — програма виконана; усі 39 PR-планів у [`archive/`](./archive/). Єдиний відкритий хвіст: **PR-29 PR-2** (drop `window.__sergeantShellNavigate`, earliest **2026-08-11**).

Серія планів-PR-ів для виправлення слабких місць стеку Sergeant, виявлених
під час глибокого зрізу 2026-05-03.

> **Прогрес (2026-07-20):** 38/39 PR-планів **Closed** (картки в [`archive/`](./archive/)).
> **1 carry-over:** [`pr-29`](./pr-29-shell-navigate-broadcast-channel.md) PR-2 — прибрати legacy global shim після compatibility window.

---

## Живий хвіст

| PR  | План                                                                                      | Статус                                                               | Наступний крок                                             |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| 29  | [`Shell-navigate global → BroadcastChannel`](./pr-29-shell-navigate-broadcast-channel.md) | PR-1 Closed [#2526](https://github.com/Skords-01/Sergeant/pull/2526) | PR-2: drop `window.__sergeantShellNavigate` (≥ 2026-08-11) |

Trigger-gated backlog (PR-17, 19, 23, 27 тощо) — у [`archive/`](./archive/), активується лише за подією з таблиці в [`archive/00-overview.md`](./archive/00-overview.md).

---

## Де шукати закриті картки

- [`archive/README.md`](./archive/README.md) — індекс архіву
- [`../hardening-matrix.md`](../hardening-matrix.md) — зведена матриця «що зроблено»
- [`../../04-governance/adr/0074-hosting-hetzner-coolify.md`](../../04-governance/adr/0074-hosting-hetzner-coolify.md) §74.2 — canonical single web origin (PR-25)

---

## Convention (historical)

При закритті PR-плану: `Status: Closed`, посилання на merged PR, `git mv` у [`archive/`](./archive/), оновити цей README + [`hardening-matrix.md`](../hardening-matrix.md).
