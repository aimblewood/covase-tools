-- phase-movement-contacts.sql
-- Movement endpoints get contact details (for the supplier request email) and
-- the movement records when its request email was sent. Safe to re-run.

ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS pickup_contact_name TEXT;
ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS pickup_contact_phone TEXT;
ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS dropoff_contact_name TEXT;
ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS dropoff_contact_phone TEXT;
ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS supplier_email_sent_at TIMESTAMPTZ;

-- Rollback (manual):
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS supplier_email_sent_at;
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS dropoff_contact_phone;
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS dropoff_contact_name;
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS pickup_contact_phone;
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS pickup_contact_name;
