-- 159: маркер «чеки Сільпо стерто» на підключенні (аудит 2026-10-01, data-47).
-- Spec: docs/work/specs/silpo-mcp-integration.md § Рішення дизайну (wipe).
--
-- Проблема. `POST /api/silpo/wipe` видаляв лише `silpo_receipts`, а
-- `silpo_connection` лишав у статусі `connected`. Полер (раз на ≤8 год) і
-- «Оновити чеки» одразу тягнули ті самі замовлення, відновлювали зняті лінки
-- (відхилення каскадно зникають разом із чеком, міграція 127), а автоімпорт
-- удруге писав позиції в комору. «Видалити назавжди» не трималось.
--
-- Рішення власника (варіант «а»): підключення лишається, а на ньому стоїть
-- маркер. `receipts_wiped_at` = момент останнього wipe. Синк пропускає
-- замовлення з `purchased_at <= receipts_wiped_at`, `pantry-claim` у режимі
-- `auto` теж не бронює позиції таких чеків. Чеки, куплені ПІСЛЯ wipe,
-- синхронізуються як звичайно.
--
-- Additive, single-phase: одна nullable колонка без DEFAULT і без бекфілу.
-- NULL = wipe ніколи не робили (поточна поведінка для всіх наявних рядків).
-- Двофазність не потрібна: старий код колонку не читає й не пише, а
-- `INSERT ... ON CONFLICT DO UPDATE` у `persistTokens` її не чіпає, тож
-- повторний OAuth без disconnect маркер не скидає.

ALTER TABLE silpo_connection
  ADD COLUMN IF NOT EXISTS receipts_wiped_at TIMESTAMPTZ;

COMMENT ON COLUMN silpo_connection.receipts_wiped_at IS
  'Момент останнього POST /api/silpo/wipe. Синк не вставляє замовлення з purchased_at <= це значення, auto-claim комори не бронює їх позиції. NULL = wipe не було.';
