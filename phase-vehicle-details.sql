-- phase-vehicle-details.sql
-- Adds P11d / CO2 / engine cc / date of registration to covase_hires.
-- These fields exist in the legacy spreadsheet and should carry over so the
-- platform can display the same level of vehicle detail when a hire card is
-- expanded. Not shown on the Pipeline card itself.
--
-- Safe to re-run (uses IF NOT EXISTS guards).

BEGIN;

ALTER TABLE covase_hires
  ADD COLUMN IF NOT EXISTS p11d_value           NUMERIC,
  ADD COLUMN IF NOT EXISTS co2_emissions        INTEGER,
  ADD COLUMN IF NOT EXISTS engine_cc            INTEGER,
  ADD COLUMN IF NOT EXISTS date_of_registration DATE;

COMMENT ON COLUMN covase_hires.p11d_value IS
  'Manufacturer P11d value (£). Lifted from supplier records / vehicle data.';
COMMENT ON COLUMN covase_hires.co2_emissions IS
  'CO2 emissions in g/km. Used for BIK / company car tax context.';
COMMENT ON COLUMN covase_hires.engine_cc IS
  'Engine displacement in cc. 0 / NULL for fully electric vehicles.';
COMMENT ON COLUMN covase_hires.date_of_registration IS
  'DVLA first registration date for the vehicle on hire.';

COMMIT;

-- Rollback hint (manual, if ever needed):
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS p11d_value;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS co2_emissions;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS engine_cc;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS date_of_registration;
