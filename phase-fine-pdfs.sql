-- phase-fine-pdfs.sql
-- Stores each fine's notice PDF in Supabase Storage and links it on the record.
--   * covase_fines.pdf_url — public URL of the stored notice
--   * storage bucket 'fine-notices' (public read) + policies so the app/n8n
--     anon key can upload
-- Safe to re-run.

ALTER TABLE covase_fines ADD COLUMN IF NOT EXISTS pdf_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('fine-notices', 'fine-notices', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$ BEGIN
  CREATE POLICY "fine_notices_read" ON storage.objects
    FOR SELECT TO anon, authenticated USING (bucket_id = 'fine-notices');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "fine_notices_insert" ON storage.objects
    FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'fine-notices');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "fine_notices_update" ON storage.objects
    FOR UPDATE TO anon, authenticated
    USING (bucket_id = 'fine-notices') WITH CHECK (bucket_id = 'fine-notices');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Rollback (manual):
-- DROP POLICY IF EXISTS "fine_notices_update" ON storage.objects;
-- DROP POLICY IF EXISTS "fine_notices_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "fine_notices_read" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id='fine-notices';
-- ALTER TABLE covase_fines DROP COLUMN IF EXISTS pdf_url;
