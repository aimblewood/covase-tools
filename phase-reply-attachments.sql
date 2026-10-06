-- phase-reply-attachments.sql
-- Stores supplier-reply email attachments so they can be viewed in the platform
-- and read by the reply agent.
--
-- Two problems this solves:
--   1. Attachments on a supplier reply (VE103 forms, PDFs) were fetched by
--      nobody — the agent only ever saw the HTML body stripped to text, and the
--      review queue had no way to show them.
--   2. Ogilvie confirm pricing by pasting a SCREENSHOT of the quote into the
--      email rather than typing it. Stripping tags threw the image away, so the
--      agent saw an empty message and the price was invisible.
--
-- Shape of the JSONB array (one object per kept attachment):
--   [{ "name": "quote.png", "type": "image/png", "size": 48213,
--      "url": "https://…/storage/v1/object/public/reply-attachments/sr-…/0-quote.png",
--      "inline": true }]
-- Empty array = checked, nothing worth keeping (signature logos are filtered
-- out upstream by size, so an email with only a logo lands here as []).
--
-- PREREQUISITE, run this first: create a PUBLIC Storage bucket named
--   reply-attachments
-- (Supabase → Storage → New bucket → name `reply-attachments`, Public ON).
-- Same pattern as the existing `fine-notices` bucket.
--
-- Run this BEFORE the n8n Supplier Reply Processor change is published —
-- PostgREST rejects the whole insert if the column is missing, which would
-- stop supplier replies being saved at all.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE covase_supplier_replies
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN covase_supplier_replies.attachments IS
  'Email attachments kept for this reply: [{name,type,size,url,inline}]. Files live in the public reply-attachments Storage bucket. Inline images below the size floor (signature logos) are filtered out before they get here.';

COMMIT;

-- Rollback (manual):
-- ALTER TABLE covase_supplier_replies DROP COLUMN IF EXISTS attachments;
-- (the reply-attachments bucket and its objects are removed separately in Storage)
