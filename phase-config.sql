-- phase-config.sql
-- Generic key/value store for shared, platform-managed configuration.
-- First use: the supplier booking email template
--   key   = 'supplier_booking_template'
--   value = { "subject": "...", "bodyHtml": "..." }
-- Read/written by the app via the anon key, matching the RLS posture of the
-- other covase_* tables in this project.
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS covase_config (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE covase_config IS
  'Shared app configuration as key/value. e.g. supplier_booking_template -> { subject, bodyHtml }.';

-- Enable RLS (clears the Supabase admin warning) AND add a permissive policy so
-- the app's anon key can still read/write — RLS with no policy blocks everyone,
-- which is what caused error 42501. This grants full access to anon +
-- authenticated, matching how the app already uses the other covase_* tables.
-- Note: this is not truly "more secure" than the app's current model (the anon
-- key can still do everything); it satisfies the linter and gives you a single
-- policy to tighten later if you ever add real per-user auth.
ALTER TABLE covase_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS covase_config_app_all ON covase_config;
CREATE POLICY covase_config_app_all ON covase_config
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- Rollback (manual):
-- DROP TABLE IF EXISTS covase_config;
