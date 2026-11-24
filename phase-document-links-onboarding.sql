-- phase-document-links-onboarding.sql (applied by Claude 24 Nov 2026)
-- The documents check constraint only allowed the original record types, so
-- onboarding uploads (policy PDFs, signed agreements) failed with 23514.
-- Adds 'onboarding' and 'onboarding_policy'. Also hides the orphan
-- covase_documents rows left by the failed uploads that day (deleted_at).
ALTER TABLE covase_document_links DROP CONSTRAINT IF EXISTS covase_document_links_record_type_check;
ALTER TABLE covase_document_links ADD CONSTRAINT covase_document_links_record_type_check
  CHECK (record_type = ANY (ARRAY['account','contact','vehicle','assignment','hire','movement','fine','claim','invoice','order','quote','onboarding','onboarding_policy']));
