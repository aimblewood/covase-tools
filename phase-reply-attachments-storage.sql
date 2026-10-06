-- phase-reply-attachments-storage.sql
-- Storage RLS policies for the reply-attachments bucket.
--
-- Marking a bucket "Public" in the Supabase UI only grants public READS.
-- Writing an object still goes through RLS on storage.objects, so the n8n
-- Upload Attachment node was refused with:
--   403 Unauthorized — "new row violates row-level security policy"
-- (execution 24609, all five files). The bucket exists and is public; it just
-- had no INSERT policy for the anon role the workflow authenticates as.
--
-- UPDATE is needed as well as INSERT: the upload sends x-upsert:true, so
-- re-processing the same email overwrites rather than erroring.
--
-- Mirrors the permissive anon,authenticated pattern used everywhere else in
-- this project, scoped to this one bucket.
--
-- PREREQUISITE: the public bucket `reply-attachments` must already exist.
--
-- Safe to re-run.

BEGIN;

DROP POLICY IF EXISTS "reply_attachments_read"   ON storage.objects;
DROP POLICY IF EXISTS "reply_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "reply_attachments_update" ON storage.objects;

CREATE POLICY "reply_attachments_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'reply-attachments');

CREATE POLICY "reply_attachments_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'reply-attachments');

CREATE POLICY "reply_attachments_update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'reply-attachments')
  WITH CHECK (bucket_id = 'reply-attachments');

COMMIT;

-- Rollback (manual):
-- DROP POLICY IF EXISTS "reply_attachments_read"   ON storage.objects;
-- DROP POLICY IF EXISTS "reply_attachments_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "reply_attachments_update" ON storage.objects;
--
-- After running this, re-mark the test email unread and hit ⚡ Check mailbox
-- now — the upsert means re-processing simply overwrites, so nothing to clean.
