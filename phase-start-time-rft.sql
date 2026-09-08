-- phase-start-time-rft.sql
-- Adds preferred_start_time + rft_per_day to covase_hires.
--
-- preferred_start_time: hour-granular delivery/start window (8am–6pm in the UI).
-- Stored as TIME so we get proper sort/filter semantics in SQL.
--
-- rft_per_day: passthrough daily charge (some hires attract it, some don't).
-- Represents an amount the supplier bills Covase that Covase passes on to the
-- client at the same rate. The platform calcs treat it as added to both
-- supplier cost AND client sell — profit-neutral. NULL = no RFT on this hire.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE covase_hires
  ADD COLUMN IF NOT EXISTS preferred_start_time TIME,
  ADD COLUMN IF NOT EXISTS rft_per_day          NUMERIC;

COMMENT ON COLUMN covase_hires.preferred_start_time IS
  'Preferred delivery / start time, hour-granular (08:00–18:00) in the UI. Stored as TIME for correct sort/filter.';
COMMENT ON COLUMN covase_hires.rft_per_day IS
  'Daily RFT (passthrough surcharge). Supplier charges Covase and Covase charges client at the same rate. Profit-neutral. NULL when the hire does not attract RFT.';

COMMIT;

-- Rollback (manual):
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS preferred_start_time;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS rft_per_day;
