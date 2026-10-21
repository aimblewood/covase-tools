-- query-crm-shape.sql — READ-ONLY. Changes nothing.
-- Shows the current shape of the CRM / fleet tables so the CRM foundations
-- migration (phase-crm-foundations.sql) is written against what is really
-- there, not what the docs remember.
-- One statement on purpose: the Supabase SQL editor only shows the result of
-- the last statement, so columns and constraints come back as one grid.
-- (Row counts / values in use were run 2026-10-21: accounts 7 client + 6
-- supplier, all active; contacts 199, all driver / home; vehicles 55;
-- assignments 0.)
-- The editor caps results at 100 rows: if the grid stops at exactly 100,
-- change the ORDER BY line to add  OFFSET 99  and run again for the rest.

SELECT table_name, 'column' AS kind, lpad(ordinal_position::text, 3, '0') AS pos,
       column_name AS name,
       data_type || CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END
                 || COALESCE(' DEFAULT ' || column_default, '') AS detail
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('covase_accounts','covase_contacts','covase_vehicles','covase_assignments')
UNION ALL
SELECT conrelid::regclass::text, 'constraint', '999', conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid::regclass::text IN ('covase_accounts','covase_contacts','covase_vehicles','covase_assignments')
ORDER BY 1, 3, 4;
