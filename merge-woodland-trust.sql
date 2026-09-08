-- merge-woodland-trust.sql  (one-off — 19 Aug 2026)
-- Merges the duplicate "The Woodland Trust" accounts:
--   KEEP   acc-s006               (seeded Apr 2026; 38 hires, 3 movements, 40 contacts)
--   DELETE acc-1786981413206-0    (created 17 Aug by the claims import; 27 claims, 18 contacts)
--
-- ⚠ THIS SCRIPT DELETES THE DUPLICATE ACCOUNT ROW. The delete is irreversible
-- once committed. Everything runs in a single transaction: if any statement
-- fails, the whole thing rolls back and nothing changes.

BEGIN;

-- 1) Move the Dynamics GUID to the surviving account
--    (dupe cleared first in case dynamics_id is uniquely indexed)
UPDATE covase_accounts SET dynamics_id = NULL
 WHERE id = 'acc-1786981413206-0';
UPDATE covase_accounts
   SET dynamics_id = 'ec57e422-d3f7-e811-a972-002248014773',
       company_name = 'The Woodland Trust',
       updated_at = NOW()
 WHERE id = 'acc-s006';

-- 2) Repoint everything that references the duplicate
UPDATE covase_claims    SET client_account_id  = 'acc-s006' WHERE client_account_id  = 'acc-1786981413206-0';
UPDATE covase_contacts  SET account_id         = 'acc-s006' WHERE account_id         = 'acc-1786981413206-0';
-- Belt-and-braces (0 rows expected on each, per the reference counts):
UPDATE covase_hires     SET client_account_id  = 'acc-s006' WHERE client_account_id  = 'acc-1786981413206-0';
UPDATE covase_movements SET client_account_id  = 'acc-s006' WHERE client_account_id  = 'acc-1786981413206-0';
UPDATE covase_movements SET supplier_account_id= 'acc-s006' WHERE supplier_account_id= 'acc-1786981413206-0';

-- 3) Delete the now-unreferenced duplicate  ⚠ irreversible
DELETE FROM covase_accounts WHERE id = 'acc-1786981413206-0';

COMMIT;

-- Verify afterwards (should return exactly ONE row, with the dynamics_id set):
-- SELECT id, company_name, dynamics_id FROM covase_accounts WHERE company_name ILIKE '%woodland%';
