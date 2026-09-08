-- phase-supplier-booking-email.sql
-- Fields for the automated supplier booking-request email feature.
--   covase_accounts.booking_email       — address the booking request is emailed to (supplier accounts only)
--   covase_hires.supplier_email_sent_at — when the request was sent (NULL = not yet sent)
-- The email itself is sent by the n8n workflow "Covase — Supplier Booking Request"
-- (webhook covase-supplier-booking-request), from the Covase Rentals mailbox.
-- Safe to re-run.

BEGIN;

ALTER TABLE covase_accounts ADD COLUMN IF NOT EXISTS booking_email TEXT;
ALTER TABLE covase_hires    ADD COLUMN IF NOT EXISTS supplier_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN covase_accounts.booking_email IS
  'Email address supplier booking requests are sent to. Only meaningful for type = supplier.';
COMMENT ON COLUMN covase_hires.supplier_email_sent_at IS
  'When the automated booking request was emailed to the supplier. NULL = not yet sent.';

COMMIT;

-- Rollback (manual):
-- ALTER TABLE covase_hires    DROP COLUMN IF EXISTS supplier_email_sent_at;
-- ALTER TABLE covase_accounts DROP COLUMN IF EXISTS booking_email;
