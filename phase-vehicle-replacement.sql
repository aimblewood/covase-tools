-- phase-vehicle-replacement.sql
-- Adds replaces_hire_id to covase_hires so that when a vehicle is swapped
-- mid-booking, we can preserve per-allocation history instead of overwriting
-- the original allocation's vehicle / date / rate data.
--
-- Model: when a replacement happens, the existing covase_hires row is flipped
-- to hire_status='offhired' with end_date set to the changeover date (matching
-- the existing offhire convention where end_date doubles as the actual off-hire
-- date). A new covase_hires row is inserted carrying the same booking-level
-- fields (customer, driver, delivery address), new vehicle data, new dates and
-- new rate, with replaces_hire_id pointing at the row it replaces.
--
-- A booking may have a chain of allocations: A ← B ← C, where A was the
-- original allocation and C is currently active. Chain length is unbounded
-- in principle but expected to be short (typically 0-2 swaps).
--
-- ON DELETE SET NULL chosen so the chain breaks gracefully if a historical
-- allocation is ever deleted, rather than blocking the delete. Switch to
-- RESTRICT later if accidental history loss becomes a concern.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE covase_hires
  ADD COLUMN IF NOT EXISTS replaces_hire_id TEXT
  REFERENCES covase_hires(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS covase_hires_replaces_hire_id_idx
  ON covase_hires(replaces_hire_id)
  WHERE replaces_hire_id IS NOT NULL;

COMMENT ON COLUMN covase_hires.replaces_hire_id IS
  'When a vehicle is swapped mid-booking, the new allocation row points at the previous allocation here. NULL on the first (or only) allocation of a booking. Forms a chain of historical allocations for a single booking.';

COMMIT;

-- Rollback (manual):
-- DROP INDEX IF EXISTS covase_hires_replaces_hire_id_idx;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS replaces_hire_id;
