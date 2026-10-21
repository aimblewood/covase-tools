-- phase-crm-foundations.sql
-- CRM foundations (plan step 2): structured addresses, account details for
-- funders/dealers, extra named addresses per account, and the document library.
--
-- ADDITIVE ONLY. Adds columns, tables, a private storage bucket, policies,
-- realtime and audit triggers. It changes no existing row and drops nothing:
--   * the old free-text `address` on accounts and contacts is left exactly as
--     it is (the screens keep showing it until the new fields are filled; no
--     guessing a town/county out of free text);
--   * covase_accounts.type already allows client/funder/dealer/supplier/both,
--     so account types need no change here.
-- Safe to re-run. Rollback at the bottom.
--
-- Written against the live shape read on 2026-10-21 (query-crm-shape.sql).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Structured addresses on accounts and contacts
--    Same field set as hires/movements already use, so the Ideal Postcodes
--    lookup (pafField) drops straight in.
-- ---------------------------------------------------------------------------

ALTER TABLE covase_accounts
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS address_line3 TEXT,
  ADD COLUMN IF NOT EXISTS town          TEXT,
  ADD COLUMN IF NOT EXISTS county        TEXT,
  ADD COLUMN IF NOT EXISTS postcode      TEXT,
  ADD COLUMN IF NOT EXISTS country       TEXT;

ALTER TABLE covase_contacts
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS address_line3 TEXT,
  ADD COLUMN IF NOT EXISTS town          TEXT,
  ADD COLUMN IF NOT EXISTS county        TEXT,
  ADD COLUMN IF NOT EXISTS postcode      TEXT,
  ADD COLUMN IF NOT EXISTS country       TEXT;

COMMENT ON COLUMN covase_accounts.address IS
  'Legacy single free-text address. Superseded by address_line1..country; kept read-only for history, never parsed.';
COMMENT ON COLUMN covase_contacts.address IS
  'Legacy single free-text address. Superseded by address_line1..country (type in address_type); kept read-only for history, never parsed.';

-- ---------------------------------------------------------------------------
-- 2. Account details the lease journey needs
-- ---------------------------------------------------------------------------

ALTER TABLE covase_accounts
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS website        TEXT,
  ADD COLUMN IF NOT EXISTS company_number TEXT,
  ADD COLUMN IF NOT EXISTS vat_number     TEXT,
  ADD COLUMN IF NOT EXISTS ordering_route TEXT;

DO $$ BEGIN
  ALTER TABLE covase_accounts ADD CONSTRAINT covase_accounts_ordering_route_check
    CHECK (ordering_route IS NULL OR ordering_route IN ('email_po','online_platform','funder_placed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN covase_accounts.ordering_route IS
  'Dealers/manufacturers/funders: how this supplier takes vehicle orders. email_po = Covase PO emailed; online_platform = ordered on their portal (e.g. Tesla); funder_placed = the funder orders the car (e.g. Ogilvie "Lessor Supply"). Drives the vehicle order checklist.';

-- ---------------------------------------------------------------------------
-- 3. Extra named addresses per account
--    e.g. Lex: registration address (with fleet number) and invoice address,
--    printed on every dealer PO; a client's delivery sites.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS covase_account_addresses (
  id            TEXT PRIMARY KEY DEFAULT ('adr-' || gen_random_uuid()::text),
  account_id    TEXT NOT NULL REFERENCES covase_accounts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'other'
                CHECK (kind IN ('registration','invoice','delivery','other')),
  label         TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  address_line3 TEXT,
  town          TEXT,
  county        TEXT,
  postcode      TEXT,
  country       TEXT,
  reference     TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS covase_account_addresses_account_idx
  ON covase_account_addresses(account_id);

COMMENT ON TABLE covase_account_addresses IS
  'Named addresses an account needs besides its main one: registration (with reference = e.g. Lex fleet number), invoice, delivery sites.';

-- ---------------------------------------------------------------------------
-- 4. Document library
--    One file row per stored file; links attach it to any number of records
--    (a signed contract belongs to the vehicle, the account and the driver).
--    Files live in the PRIVATE bucket `documents`: no public URLs, the app
--    opens them through short-lived signed links.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS covase_documents (
  id            TEXT PRIMARY KEY DEFAULT ('doc-' || gen_random_uuid()::text),
  storage_path  TEXT NOT NULL UNIQUE,
  file_name     TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT,
  doc_type      TEXT NOT NULL DEFAULT 'other'
                CHECK (doc_type IN ('quotation','funder_quote','purchase_order','order_confirmation',
                                    'contract','signed_contract','v5','driving_licence','delivery_note',
                                    'invoice','photo','correspondence','other')),
  title         TEXT,
  notes         TEXT,
  source        TEXT NOT NULL DEFAULT 'upload'
                CHECK (source IN ('upload','generated','email')),
  uploaded_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

COMMENT ON TABLE covase_documents IS
  'Document library: one row per stored file in the private `documents` bucket. Removing a document sets deleted_at (the file is kept), so nothing is lost by a mis-click.';

CREATE TABLE IF NOT EXISTS covase_document_links (
  id            TEXT PRIMARY KEY DEFAULT ('dln-' || gen_random_uuid()::text),
  document_id   TEXT NOT NULL REFERENCES covase_documents(id) ON DELETE CASCADE,
  record_type   TEXT NOT NULL
                CHECK (record_type IN ('account','contact','vehicle','assignment','hire','movement',
                                       'fine','claim','invoice','order','quote')),
  record_id     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, record_type, record_id)
);

CREATE INDEX IF NOT EXISTS covase_document_links_record_idx
  ON covase_document_links(record_type, record_id);

COMMENT ON TABLE covase_document_links IS
  'Attaches a document to a record. record_type + record_id (no FK, as records live in different tables; orders/quotes arrive with the lease CRM).';

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('documents', 'documents', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;

-- Same access level as every other table today (anon + authenticated).
-- Tightened to signed-in users only when ORBIS logins land. No DELETE policy:
-- files are never removed from the browser.
DO $$ BEGIN
  CREATE POLICY documents_read ON storage.objects
    FOR SELECT TO anon, authenticated USING (bucket_id = 'documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY documents_insert ON storage.objects
    FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY documents_update ON storage.objects
    FOR UPDATE TO anon, authenticated
    USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 5. RLS on the new tables (Simon's permissive pattern, as everywhere else)
-- ---------------------------------------------------------------------------

ALTER TABLE covase_account_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS covase_account_addresses_app_all ON covase_account_addresses;
CREATE POLICY covase_account_addresses_app_all ON covase_account_addresses
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE covase_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS covase_documents_app_all ON covase_documents;
CREATE POLICY covase_documents_app_all ON covase_documents
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE covase_document_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS covase_document_links_app_all ON covase_document_links;
CREATE POLICY covase_document_links_app_all ON covase_document_links
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. Realtime: new tables + allocations (not yet published)
-- ---------------------------------------------------------------------------

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_account_addresses; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_documents;         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_document_links;    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_assignments;       EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 7. Change history: the covase_audit trigger (phase-audit-trail.sql) on the
--    CRM tables -- only if that phase has been run. On 2026-10-21 it had not
--    (covase_audit_capture() did not exist), so this step skips itself;
--    re-run this file after phase-audit-trail.sql and the triggers appear.
-- ---------------------------------------------------------------------------

DO $$
DECLARE t TEXT;
BEGIN
  IF to_regprocedure('public.covase_audit_capture()') IS NULL THEN
    RAISE NOTICE 'covase_audit_capture() not installed: audit triggers skipped (run phase-audit-trail.sql, then re-run this file)';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['covase_accounts','covase_contacts','covase_vehicles','covase_assignments',
                           'covase_account_addresses','covase_documents','covase_document_links'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION covase_audit_capture()', t || '_audit', t);
  END LOOP;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Check it worked (read-only): should list 3 new tables and the bucket.
-- ---------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
--  WHERE table_name IN ('covase_account_addresses','covase_documents','covase_document_links');
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'documents';

-- ---------------------------------------------------------------------------
-- Rollback (manual, in this order). Dropping the tables loses any documents
-- or addresses entered since; the stored files stay in the bucket.
-- ---------------------------------------------------------------------------
-- DROP TRIGGER IF EXISTS covase_document_links_audit ON covase_document_links;
-- DROP TRIGGER IF EXISTS covase_documents_audit ON covase_documents;
-- DROP TRIGGER IF EXISTS covase_account_addresses_audit ON covase_account_addresses;
-- DROP TRIGGER IF EXISTS covase_assignments_audit ON covase_assignments;
-- DROP TRIGGER IF EXISTS covase_vehicles_audit ON covase_vehicles;
-- DROP TRIGGER IF EXISTS covase_contacts_audit ON covase_contacts;
-- DROP TRIGGER IF EXISTS covase_accounts_audit ON covase_accounts;
-- ALTER PUBLICATION supabase_realtime DROP TABLE covase_assignments;
-- DROP POLICY IF EXISTS documents_update ON storage.objects;
-- DROP POLICY IF EXISTS documents_insert ON storage.objects;
-- DROP POLICY IF EXISTS documents_read ON storage.objects;
-- DROP TABLE IF EXISTS covase_document_links;
-- DROP TABLE IF EXISTS covase_documents;
-- DROP TABLE IF EXISTS covase_account_addresses;
-- ALTER TABLE covase_accounts DROP CONSTRAINT IF EXISTS covase_accounts_ordering_route_check;
-- ALTER TABLE covase_accounts DROP COLUMN IF EXISTS ordering_route, DROP COLUMN IF EXISTS vat_number,
--   DROP COLUMN IF EXISTS company_number, DROP COLUMN IF EXISTS website, DROP COLUMN IF EXISTS phone,
--   DROP COLUMN IF EXISTS country, DROP COLUMN IF EXISTS postcode, DROP COLUMN IF EXISTS county,
--   DROP COLUMN IF EXISTS town, DROP COLUMN IF EXISTS address_line3, DROP COLUMN IF EXISTS address_line2,
--   DROP COLUMN IF EXISTS address_line1;
-- ALTER TABLE covase_contacts DROP COLUMN IF EXISTS country, DROP COLUMN IF EXISTS postcode,
--   DROP COLUMN IF EXISTS county, DROP COLUMN IF EXISTS town, DROP COLUMN IF EXISTS address_line3,
--   DROP COLUMN IF EXISTS address_line2, DROP COLUMN IF EXISTS address_line1;
-- DELETE FROM storage.buckets WHERE id = 'documents';   -- only once the bucket is empty
