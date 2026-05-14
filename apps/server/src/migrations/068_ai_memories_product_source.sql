-- 068: ai_memories `product` source — нова namespace для PostHog → AI memory sync.
--
-- Контекст: PR-19 (#2605) активував AI memory ingest для `finyk`/`cofounder`
-- через server-side hooks; PR-22 (#2712) додав retroactive backfill з
-- `tg_topic_archive` (`cofounder`). Цей PR (PostHog → AI memory sync) додає
-- behavioral-event source: коли user робить значущу action у продукт
-- (completes onboarding, hits first-action, activates v2 milestone, починає
-- subscription) — analytics event автоматично mirror-иться у memory як
-- structured text, тож `/recall` має cross-source view ("коли я останній
-- раз активувався у фінику?").
--
-- ─── Семантика ─────────────────────────────────────────────────────────
--
-- `product` — новий source-namespace; isolation pattern як у `cofounder`
-- (ADR-0031 §3): rows цього source-у пише ТІЛЬКИ event-sync handler
-- (`POST /api/ai-memory/event-sync`), читає `/recall` через optional
-- `sources=['product']` filter або combined `['cofounder', 'product']` для
-- founder-у. Не змішується з `chat`/`finyk`/`digest` — кожен source
-- лишається own bucket-ом.
--
-- Source ref (`source_ref`): canonical event name + idempotency-suffix
-- ("onboarding_completed:<userId>:<dateKey>" — формується у event-mapper-і).
-- UNIQUE partial index на `(user_id, source, source_ref) WHERE source_ref
-- IS NOT NULL` (025) природно блокує дубляж, тож якщо event прилетить
-- двічі за день (browser tab reload + idempotent flag race) — другий
-- запис буде no-op.
--
-- ─── ADR-0031 §3 isolation ───────────────────────────────────────────
--
-- `cofounder` source хардкодиться у `recall_memory` openclaw tool
-- (`apps/server/src/modules/openclaw/tools.ts`) як `sources=['cofounder']`.
-- Це не зачіпається — openclaw bot бачить тільки cofounder-namespace.
-- `product` доступний через API-recall (`POST /api/ai-memory/recall`), де
-- caller явно вказує `sources` у body, або через combined recall з
-- допустимим mix-ом.
--
-- ─── Why not extend cofounder ─────────────────────────────────────────
--
-- Можна було б писати product events як `source='cofounder'` з distinct
-- `metadata.kind = 'product_event'`. Не вибрали бо:
--   1. Vector-search recall у openclaw зараз hardcode-ить `cofounder` —
--      product events почали б "забруднювати" cofounder DM-recall з
--      auto-generated text-ами замість founder-input narrative-у.
--   2. Окремий source дозволяє `/recall sources=['cofounder']` лишити
--      founder-input clean, а UI-recall (web) — combined view.
--   3. Soft-delete (067 `deleted_at`) — sympathetic до per-source policies
--      (можна додати auto-prune product-events старші 90 днів окремо).
--
-- ─── Партиційний caveat ──────────────────────────────────────────────
--
-- `ai_memories` HASH-партиційована (025). DROP CONSTRAINT / ADD CONSTRAINT
-- на parent каскадиться у партиції автоматично (Postgres ≥11). Тому ALTER
-- TABLE лише parent-у.

ALTER TABLE ai_memories
  DROP CONSTRAINT IF EXISTS ai_memories_source_check;

ALTER TABLE ai_memories
  ADD CONSTRAINT ai_memories_source_check
  CHECK (source IN (
    'chat',
    'finyk',
    'fizruk',
    'nutrition',
    'routine',
    'journal',
    'digest',
    'cofounder',
    'product'
  ));

COMMENT ON CONSTRAINT ai_memories_source_check ON ai_memories IS
  'Доменний source. Розширено у 028 на ''cofounder'' (ADR-0031), у 068 на ''product'' для PostHog → AI memory sync. Strict isolation на app-рівні (recall_memory tool хардкодить sources=[''cofounder''], product читається через POST /api/ai-memory/recall).';
