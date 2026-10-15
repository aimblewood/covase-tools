-- query-delivery-county-gap.sql
-- READ ONLY. Nothing here changes a row. Paste into the Supabase SQL editor.
--
-- WHY THIS IS A QUERY AND NOT A MIGRATION: a backfill of covase_hires.delivery_county
-- was offered as "fill it from the linked contact", but covase_contacts holds no
-- address at all -- phase-dynamics-linking.sql only ever added dynamics_id to it.
-- The county has only ever come from the Dynamics Contact Lookup webhook
-- (address1_stateorprovince) at the moment a booking is made. So there is no
-- column in Supabase to copy from, and no SQL can do this.
--
-- Filling the gap means calling Dynamics once per hire, which is a job for the
-- platform or n8n, not the database. This query sizes the job first: how many
-- hires are missing a county, and how many of those even have a driver contact
-- that Dynamics could be asked about.

-- 1. The headline: how big is the gap, and how much of it is addressable?
SELECT
  count(*)                                                         AS hires_total,
  count(*) FILTER (WHERE coalesce(delivery_county, '') = '')       AS missing_county,
  count(*) FILTER (WHERE coalesce(delivery_county, '') = ''
                     AND driver_contact_id IS NOT NULL)            AS missing_but_has_contact,
  count(*) FILTER (WHERE coalesce(delivery_county, '') = ''
                     AND driver_contact_id IS NULL)                AS missing_and_unresolvable
FROM covase_hires
WHERE hire_status <> 'cancelled';

-- 2. Narrow it to the ones worth fixing: a county is only of any use on a hire
--    that is live or still to run. Old off-hired bookings can stay as they are.
SELECT
  count(*) AS worth_filling
FROM covase_hires
WHERE coalesce(delivery_county, '') = ''
  AND driver_contact_id IS NOT NULL
  AND hire_status IN ('pending', 'requested', 'booked', 'active');

-- 3. The actual list, newest first, so the job can be done by hand if it is short.
--    dynamics_id is what the Contact Lookup webhook needs.
SELECT
  h.job_ref,
  h.customer,
  h.driver,
  h.hire_status,
  h.delivery_town,
  h.delivery_postcode,
  c.dynamics_id AS driver_dynamics_id
FROM covase_hires h
LEFT JOIN covase_contacts c ON c.id = h.driver_contact_id
WHERE coalesce(h.delivery_county, '') = ''
  AND h.driver_contact_id IS NOT NULL
  AND h.hire_status IN ('pending', 'requested', 'booked', 'active')
ORDER BY h.start_date DESC NULLS LAST;

-- 4. Sanity check on the premise above: does covase_contacts hold anything
--    county-shaped after all? Expect zero rows. If this returns a column, say so
--    and a real SQL backfill becomes possible.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'covase_contacts'
  AND (column_name ILIKE '%count%' OR column_name ILIKE '%address%'
       OR column_name ILIKE '%town%' OR column_name ILIKE '%postcode%'
       OR column_name ILIKE '%state%' OR column_name ILIKE '%province%');
