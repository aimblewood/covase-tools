-- phase-dynamics-linking.sql
-- Adds Dynamics 365 linkage to contacts + hires so the short-hire form can
-- typeahead-search Microsoft Dynamics (via n8n) in the same way the invoice
-- generator does, and deep-link out to the D365 record.
--
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS guards).

BEGIN;

-- 1) Contacts get a Dynamics ID (parity with covase_accounts, covase_vehicles)
ALTER TABLE covase_contacts
  ADD COLUMN IF NOT EXISTS dynamics_id TEXT;

COMMENT ON COLUMN covase_contacts.dynamics_id IS
  'Microsoft Dynamics 365 contact GUID / transition ref. Populated when the contact is matched or created via the Dynamics lookup.';

-- 2) Hires get a proper FK to the driver contact record
--    `driver` TEXT stays as the denormalised display name (belt-and-braces:
--    keeps existing rows readable, avoids breaking any view that reads
--    covase_hires.driver directly). New hires should populate both when
--    selected via the lookup.
ALTER TABLE covase_hires
  ADD COLUMN IF NOT EXISTS driver_contact_id TEXT
    REFERENCES covase_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_covase_hires_driver_contact_id
  ON covase_hires(driver_contact_id);

COMMENT ON COLUMN covase_hires.driver_contact_id IS
  'FK to covase_contacts. Set when driver is selected via the Dynamics lookup or picked from an existing contact. covase_hires.driver remains the display name.';

-- 3) Helpful: index on contacts.dynamics_id so the lookup can match fast
CREATE INDEX IF NOT EXISTS idx_covase_contacts_dynamics_id
  ON covase_contacts(dynamics_id)
  WHERE dynamics_id IS NOT NULL;

-- 4) Same for accounts (probably already there; harmless if it exists)
CREATE INDEX IF NOT EXISTS idx_covase_accounts_dynamics_id
  ON covase_accounts(dynamics_id)
  WHERE dynamics_id IS NOT NULL;

COMMIT;

-- Rollback hint (manual, if ever needed):
-- ALTER TABLE covase_hires DROP COLUMN IF EXISTS driver_contact_id;
-- ALTER TABLE covase_contacts DROP COLUMN IF EXISTS dynamics_id;
-- DROP INDEX IF EXISTS idx_covase_hires_driver_contact_id;
-- DROP INDEX IF EXISTS idx_covase_contacts_dynamics_id;
-- DROP INDEX IF EXISTS idx_covase_accounts_dynamics_id;
