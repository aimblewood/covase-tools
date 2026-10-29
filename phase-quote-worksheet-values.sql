-- phase-quote-worksheet-values.sql — 29 Oct 2026
-- Keeps everything the funder worksheet reader found on the quote, including
-- fields Simon chose to leave out, so leaving a field out only affects what
-- goes into the quote and nothing read from the worksheet is lost.
-- Shape: {"values": {field: value, ...}, "off": [field, ...]}
-- Idempotent. Safe to run more than once.

ALTER TABLE covase_quotes ADD COLUMN IF NOT EXISTS worksheet_values JSONB;

-- make PostgREST see the new column straight away
NOTIFY pgrst, 'reload schema';

-- Rollback:
-- ALTER TABLE covase_quotes DROP COLUMN IF EXISTS worksheet_values;
