-- phase-delivery-county.sql
-- Adds the missing county field to the covase_hires delivery address.
--
-- phase-delivery-address.sql shipped line1/line2/town/postcode but no county,
-- even though the Dynamics Contact Lookup webhook already returns it
-- (address1_stateorprovince) and both covase_movements (pickup_county /
-- dropoff_county) and the offhire block (collection_county) store one.
--
-- Without this column the offhire "collect from the delivery address" path had
-- to hardcode an empty county, so a county typed on the booking was dropped
-- from the collection address and the supplier email.
--
-- Run this BEFORE deploying the platform code that writes delivery_county —
-- PostgREST rejects the whole PATCH/POST if the column is missing, which would
-- break saving a hire.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE covase_hires
  ADD COLUMN IF NOT EXISTS delivery_county TEXT;

COMMENT ON COLUMN covase_hires.delivery_county IS 'County. Snapshotted from the driver Dynamics contact (address1_stateorprovince) at booking time, same as the other delivery_* fields.';

COMMIT;

-- Rollback (manual):
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS delivery_county;
