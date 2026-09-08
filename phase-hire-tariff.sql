-- phase-hire-tariff.sql
-- Adds the rental tariff band to short hires (used on the booking and as a
-- merge field in the supplier booking email). Values used by the app:
--   '1-2 days', '3-6 days', '7-27 days', '28 days+'
-- Stored as free TEXT (not a CHECK constraint) so the bands can be tweaked
-- app-side without a migration.
-- Safe to re-run.

BEGIN;

ALTER TABLE covase_hires ADD COLUMN IF NOT EXISTS tariff TEXT;

COMMENT ON COLUMN covase_hires.tariff IS
  'Rental tariff band, e.g. 1-2 days / 3-6 days / 7-27 days / 28 days+.';

COMMIT;

-- Rollback (manual):
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS tariff;
