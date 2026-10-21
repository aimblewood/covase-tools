-- query-crm-shape.sql — READ-ONLY. Changes nothing.
-- Shows the current shape of the CRM / fleet tables so the CRM foundations
-- migration (phase-crm-foundations.sql) is written against what is really
-- there, not what the docs remember. Run in the Supabase SQL editor and paste
-- all three result grids back.

-- 1) Every column on the CRM / fleet tables
SELECT table_name, ordinal_position AS pos, column_name, data_type,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('covase_accounts','covase_contacts','covase_vehicles','covase_assignments')
ORDER BY table_name, ordinal_position;

-- 2) Constraints (checks, foreign keys, uniques) on those tables
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid::regclass::text IN ('covase_accounts','covase_contacts','covase_vehicles','covase_assignments')
ORDER BY 1, 2;

-- 3) How the existing data is spread: row counts and the values in use for
--    the type/status fields the migration builds on
SELECT 'accounts' AS what, COALESCE(type,'(blank)') AS value, count(*) FROM covase_accounts GROUP BY 2
UNION ALL
SELECT 'accounts.status', COALESCE(status,'(blank)'), count(*) FROM covase_accounts GROUP BY 2
UNION ALL
SELECT 'contacts.contact_type', COALESCE(contact_type,'(blank)'), count(*) FROM covase_contacts GROUP BY 2
UNION ALL
SELECT 'contacts.address_type', COALESCE(address_type,'(blank)'), count(*) FROM covase_contacts GROUP BY 2
UNION ALL
SELECT 'vehicles (rows)', '', count(*) FROM covase_vehicles
UNION ALL
SELECT 'assignments (rows)', '', count(*) FROM covase_assignments
ORDER BY 1, 2;
