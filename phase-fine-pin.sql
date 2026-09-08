-- phase-fine-pin.sql
-- PIN / verification code printed on fine notices — needed for online driver
-- nomination submissions once an address is confirmed. Extracted automatically
-- by the Lex intake agent from the notice PDF. Safe to re-run.

ALTER TABLE covase_fines ADD COLUMN IF NOT EXISTS pin TEXT;

-- Rollback (manual):
-- ALTER TABLE covase_fines DROP COLUMN IF EXISTS pin;
