-- phase-movement-addr2.sql
-- Movement endpoints get a separate Address line 2 (PAF line_2 / Dynamics
-- address2 no longer squashed into line 1). Safe to re-run; no data touched.

ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS pickup_address_line2 TEXT;
ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS dropoff_address_line2 TEXT;

-- Rollback (manual):
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS dropoff_address_line2;
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS pickup_address_line2;
