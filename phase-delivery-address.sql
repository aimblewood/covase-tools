-- phase-delivery-address.sql
-- Adds structured delivery-address fields to covase_hires so the supplier
-- booking-email automation has somewhere to read the "deliver to" block from.
--
-- Address sourced from the driver's Dynamics 365 contact record (pulled at
-- driver-lookup time in the New Hire modal), stored as a snapshot on the
-- hire so historical hires keep their delivery info even if the contact
-- moves house later.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE covase_hires
  ADD COLUMN IF NOT EXISTS delivery_address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS delivery_town          TEXT,
  ADD COLUMN IF NOT EXISTS delivery_postcode      TEXT;

COMMENT ON COLUMN covase_hires.delivery_address_line1 IS 'Street address line 1, snapshotted from driver Dynamics contact at booking time.';
COMMENT ON COLUMN covase_hires.delivery_address_line2 IS 'Street address line 2 (optional).';
COMMENT ON COLUMN covase_hires.delivery_town       IS 'Town / city.';
COMMENT ON COLUMN covase_hires.delivery_postcode   IS 'UK postcode. Stored as-entered (no formatting normalisation).';

COMMIT;

-- Rollback (manual):
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS delivery_address_line1;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS delivery_address_line2;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS delivery_town;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS delivery_postcode;
