-- phase-offhire.sql
-- Offhire facility for rental bookings: collection details captured when an
-- offhire request is sent to the supplier. The booking keeps its status and
-- gains a badge; it auto-advances to Offhired when the collection date/time
-- passes (handled by the app). Safe to re-run; no data touched.

ALTER TABLE covase_hires ADD COLUMN IF NOT EXISTS collection_address_line1 TEXT;
ALTER TABLE covase_hires ADD COLUMN IF NOT EXISTS collection_address_line2 TEXT;
ALTER TABLE covase_hires ADD COLUMN IF NOT EXISTS collection_town TEXT;
ALTER TABLE covase_hires ADD COLUMN IF NOT EXISTS collection_county TEXT;
ALTER TABLE covase_hires ADD COLUMN IF NOT EXISTS collection_postcode TEXT;
ALTER TABLE covase_hires ADD COLUMN IF NOT EXISTS collection_date DATE;
ALTER TABLE covase_hires ADD COLUMN IF NOT EXISTS collection_time TIME;
ALTER TABLE covase_hires ADD COLUMN IF NOT EXISTS offhire_notes TEXT;
ALTER TABLE covase_hires ADD COLUMN IF NOT EXISTS offhire_requested_at TIMESTAMPTZ;

-- Rollback (manual):
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS offhire_requested_at;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS offhire_notes;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS collection_time;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS collection_date;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS collection_postcode;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS collection_county;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS collection_town;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS collection_address_line2;
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS collection_address_line1;
