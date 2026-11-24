-- phase-lock.sql  (logins-plan.md step 4 — run ONLY on Simon's explicit yes)
-- Locks Covase Tools data to signed-in members. Before: every covase_* table
-- had a permissive policy for the anon key (anyone holding the key — which sits
-- in every browser and, after this, in the public repo — could read and write
-- everything). After: only an authenticated user with an active
-- covase_profiles row (covase_is_member()) can read/write; n8n uses the
-- service key, which bypasses RLS. Same for the Storage buckets' policies.
--
-- NOT touched: other apps' tables in this project (whatsapp_messages,
-- conversation_controls, script_writer_data, ami_settings); covase_profiles /
-- covase_app_settings / covase_dynamics_changes (already member-only).
-- The three public buckets (invoice-pdfs, fine-notices, reply-attachments) stay
-- public for now: their stored links keep working, but nobody can list or
-- upload without signing in. Making them private is a follow-up (needs signed
-- links in the app).
--
-- Order on the day: both users signed in (the live app already sends their
-- token) → run this → merge the PR that bakes in the key and makes sign-in
-- compulsory. ROLLBACK at the bottom restores the old open policies in one go.

BEGIN;

DO $$
DECLARE t TEXT; p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'covase_config','covase_supplier_replies','covase_hires','covase_claims','covase_fines',
    'covase_contacts','covase_accounts','covase_movements','covase_vehicles',
    'covase_onboarding_cases','covase_onboarding_steps','covase_onboarding_nominees',
    'covase_account_addresses','covase_documents','covase_document_links','covase_invoices',
    'covase_orders','covase_purchase_orders','covase_assignments','covase_mileage_readings','covase_quotes'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON %I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (covase_is_member()) WITH CHECK (covase_is_member())', t || '_members', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
  END LOOP;
END $$;

-- Sequences behind job refs / ids: signed-in users need them for inserts.
DO $$
DECLARE s RECORD;
BEGIN
  FOR s IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' AND sequence_name LIKE 'covase%' LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO authenticated', s.sequence_name);
  END LOOP;
END $$;

-- Storage: replace the anon policies with member-only ones.
DROP POLICY IF EXISTS "Allow reads 1iokggx_0"   ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads 1iokggx_0" ON storage.objects;
DROP POLICY IF EXISTS documents_insert ON storage.objects;
DROP POLICY IF EXISTS documents_read   ON storage.objects;
DROP POLICY IF EXISTS documents_update ON storage.objects;
DROP POLICY IF EXISTS fine_notices_insert ON storage.objects;
DROP POLICY IF EXISTS fine_notices_read   ON storage.objects;
DROP POLICY IF EXISTS fine_notices_update ON storage.objects;
DROP POLICY IF EXISTS reply_attachments_insert ON storage.objects;
DROP POLICY IF EXISTS reply_attachments_read   ON storage.objects;
DROP POLICY IF EXISTS reply_attachments_update ON storage.objects;
DROP POLICY IF EXISTS covase_members_read   ON storage.objects;
DROP POLICY IF EXISTS covase_members_insert ON storage.objects;
DROP POLICY IF EXISTS covase_members_update ON storage.objects;
CREATE POLICY covase_members_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('documents','fine-notices','reply-attachments','invoice-pdfs') AND public.covase_is_member());
CREATE POLICY covase_members_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('documents','fine-notices','reply-attachments','invoice-pdfs') AND public.covase_is_member());
CREATE POLICY covase_members_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('documents','fine-notices','reply-attachments','invoice-pdfs') AND public.covase_is_member());

COMMIT;

-- Check (read-only): no covase_* policy should mention anon any more:
-- SELECT tablename, policyname, roles FROM pg_policies WHERE tablename LIKE 'covase%' AND roles::text LIKE '%anon%';

-- ---------------------------------------------------------------------------
-- ROLLBACK — reopens everything exactly as before (run as one block):
-- ---------------------------------------------------------------------------
-- DO $$ DECLARE t TEXT; BEGIN
--   FOREACH t IN ARRAY ARRAY['covase_config','covase_supplier_replies','covase_hires','covase_claims','covase_fines',
--     'covase_contacts','covase_accounts','covase_movements','covase_vehicles','covase_onboarding_cases','covase_onboarding_steps',
--     'covase_onboarding_nominees','covase_account_addresses','covase_documents','covase_document_links','covase_invoices',
--     'covase_orders','covase_purchase_orders','covase_assignments','covase_mileage_readings','covase_quotes'] LOOP
--     IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
--     EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_members', t);
--     EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t || '_app_all', t);
--     EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon', t);
--   END LOOP; END $$;
-- DO $$ DECLARE s RECORD; BEGIN FOR s IN SELECT sequence_name FROM information_schema.sequences
--   WHERE sequence_schema='public' AND sequence_name LIKE 'covase%' LOOP
--   EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO anon', s.sequence_name); END LOOP; END $$;
-- DROP POLICY IF EXISTS covase_members_read ON storage.objects; DROP POLICY IF EXISTS covase_members_insert ON storage.objects;
-- DROP POLICY IF EXISTS covase_members_update ON storage.objects;
-- CREATE POLICY covase_open_read ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id IN ('documents','fine-notices','reply-attachments','invoice-pdfs'));
-- CREATE POLICY covase_open_insert ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id IN ('documents','fine-notices','reply-attachments','invoice-pdfs'));
-- CREATE POLICY covase_open_update ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id IN ('documents','fine-notices','reply-attachments','invoice-pdfs'));
