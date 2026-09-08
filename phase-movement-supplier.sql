-- phase-movement-supplier.sql
-- Adds a supplier to covase_movements: the third-party company the movement is
-- outsourced to. Dropdown in the app is driven by CRM supplier accounts
-- (covase_accounts.type='supplier'), so we store the FK plus a denormalised
-- name snapshot (consistent with client_account_id + customer).
-- Safe to re-run; no data touched.

BEGIN;

ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS supplier_account_id TEXT REFERENCES covase_accounts(id) ON DELETE SET NULL;

COMMIT;

-- Rollback (manual):
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS supplier_account_id;
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS supplier;
