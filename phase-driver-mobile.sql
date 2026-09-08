-- phase-driver-mobile.sql
-- Adds driver_mobile to covase_hires so the booking carries a snapshot of
-- the driver's contact number at the time of booking. Pulled from the
-- Dynamics 365 contact record at driver-lookup time (workflow already
-- returns `mobile` from `mobilephone` falling back to `telephone1`).
--
-- Rationale: snapshot rather than relying on covase_contacts.mobile, so
-- historical hires keep the number that was used when the supplier was
-- contacted, even if the driver's number changes later.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE covase_hires
  ADD COLUMN IF NOT EXISTS driver_mobile TEXT;

COMMENT ON COLUMN covase_hires.driver_mobile IS
  'Driver contact number snapshotted from Dynamics at booking time. UK mobile typical, but stored as-entered (no normalisation).';

COMMIT;

-- Rollback (manual):
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS driver_mobile;
