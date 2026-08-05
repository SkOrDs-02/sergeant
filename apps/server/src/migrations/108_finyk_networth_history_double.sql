-- 108: `finyk_networth_history.networth` REAL → DOUBLE PRECISION.
--
-- Pre-beta schema-debt audit 2026-08-04. `REAL` (Postgres `float4`) has
-- ~6-7 significant decimal digits; net-worth values accumulate multiple
-- assets/debts summed client-side (`NetworthEntry.networth`) and can
-- legitimately exceed 7 significant digits for a household with several
-- accounts (e.g. `12345678.90`). Past that point `float4` silently
-- rounds — the value that comes back from a SELECT is not byte-identical
-- to what the client computed and sent, which breaks the "LWW comparisons
-- match the LS shape byte-for-byte" invariant documented in migration
-- 039's header comment for this exact table. `DOUBLE PRECISION`
-- (`float8`, ~15-17 significant digits) matches the JS `number` (IEEE-754
-- double) the client already uses, so client → server → client round-trips
-- stop lossy-rounding.
--
-- Widening cast (float4 → float8) is lossless and requires no data
-- migration — every representable REAL value has an exact DOUBLE
-- PRECISION representation. Not a two-phase change (Hard Rule #4 applies
-- to DROP, not to a lossless type widening); single ALTER is safe even
-- with existing rows.
--
-- Scope note: this migration intentionally does NOT convert `networth`
-- to integer minor units (kopiykas) — that is a larger, cross-cutting
-- finyk-on-server money-representation change tracked separately (finyk's
-- eventual move off client-computed floats), out of scope here.

ALTER TABLE finyk_networth_history
  ALTER COLUMN networth TYPE DOUBLE PRECISION USING networth::double precision;
