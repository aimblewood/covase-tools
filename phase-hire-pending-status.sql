-- phase-hire-pending-status.sql
-- Adds 'pending' to the allowed values for covase_hires.hire_status.
--
-- Context: 'pending' is a new pipeline stage BEFORE 'requested' — a hire we know
-- is needed but haven't yet sent to the supplier. The existing CHECK constraint
-- (covase_hires_hire_status_check) only permits requested/booked/active/offhired/
-- cancelled, so without this the app can't save a Pending booking.
--
-- Not destructive to data: this only swaps a CHECK constraint. It's wrapped in a
-- transaction, so if any existing row has a status outside the new list, the whole
-- thing rolls back and the old constraint stays in place (nothing is lost). Safe to
-- re-run.

BEGIN;

ALTER TABLE covase_hires DROP CONSTRAINT IF EXISTS covase_hires_hire_status_check;

ALTER TABLE covase_hires ADD CONSTRAINT covase_hires_hire_status_check
  CHECK (hire_status IN ('pending','requested','booked','active','offhired','cancelled'));

COMMIT;

-- Rollback (manual) — revert to the previous allowed set:
-- BEGIN;
-- ALTER TABLE covase_hires DROP CONSTRAINT IF EXISTS covase_hires_hire_status_check;
-- ALTER TABLE covase_hires ADD CONSTRAINT covase_hires_hire_status_check
--   CHECK (hire_status IN ('requested','booked','active','offhired','cancelled'));
-- COMMIT;
