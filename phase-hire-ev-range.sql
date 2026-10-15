-- phase-hire-ev-range.sql
-- Adds EV range to the short-hire vehicle details.
--
-- Sits alongside the fields added by phase-vehicle-details.sql (p11d_value,
-- co2_emissions, engine_cc, date_of_registration) and fuel_type. Those already
-- note that engine_cc is "0 / NULL for fully electric vehicles" -- ev_range is
-- the figure that actually means something on those bookings.
--
-- Stored in MILES as a whole number, matching how suppliers quote it and how
-- the rest of the platform handles distance (the movements mileage maths is all
-- miles). Suppliers quote range in several flavours -- WLTP combined, real-world,
-- "up to" -- so this is the single headline figure, not a breakdown.
--
-- Two tables:
--   covase_hires            the field itself
--   covase_supplier_replies so the reply agent can carry an extracted range
--                           through to the Apply button, exactly as it already
--                           does for engine_cc / co2_emissions / p11d_value
--
-- Run this BEFORE deploying the platform code that writes ev_range --
-- PostgREST rejects the whole PATCH/POST if a column is missing, which would
-- break saving a hire outright.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE covase_hires
  ADD COLUMN IF NOT EXISTS ev_range INTEGER;

ALTER TABLE covase_supplier_replies
  ADD COLUMN IF NOT EXISTS ev_range INTEGER;

COMMENT ON COLUMN covase_hires.ev_range IS
  'Electric range in MILES (whole number). The supplier''s headline figure for the vehicle on hire -- usually WLTP combined. NULL for non-electrified vehicles, and NULL simply means not captured rather than zero.';

COMMENT ON COLUMN covase_supplier_replies.ev_range IS
  'EV range in miles as extracted from the supplier reply, pending Apply onto the hire. Mirrors engine_cc / co2_emissions / p11d_value.';

COMMIT;

-- Rollback (manual):
-- ALTER TABLE covase_hires            DROP COLUMN IF EXISTS ev_range;
-- ALTER TABLE covase_supplier_replies DROP COLUMN IF EXISTS ev_range;
