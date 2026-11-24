-- phase-logins.sql  (logins-plan.md step 2, Simon 24 Nov 2026)
-- Logins for Covase Tools: Supabase Auth (email + password) plus
--   covase_profiles      one row per person: role (admin/user), allowed modules, active
--   covase_app_settings  shared browser keys (ORS, Ideal Postcodes, map tiles) — signed-in members only
--   covase_is_member()   / covase_is_admin()  helpers for policies
--
-- ADDITIVE ONLY. New tables are locked from the start (no anon access at all).
-- Existing tables are NOT touched here — the lock on them is step 4
-- (phase-lock.sql), run only on Simon's say-so.
-- Users are created by the n8n workflow "Covase — User Admin" (service key),
-- never from the browser. Safe to re-run. Rollback at the bottom.

BEGIN;

CREATE TABLE IF NOT EXISTS covase_profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  modules     TEXT[],            -- NULL = every module; otherwise sidebar item keys
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE covase_profiles IS
  'Covase Tools users. A signed-in Supabase Auth user only counts as a member with an active row here (so a stray sign-up gets nothing). modules NULL = all.';

CREATE TABLE IF NOT EXISTS covase_app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE covase_app_settings IS
  'Settings only members may read (e.g. browser_keys: ORS, Ideal Postcodes, tile URL). Admins write.';

CREATE OR REPLACE FUNCTION covase_is_member() RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM covase_profiles WHERE user_id = auth.uid() AND active) $$;
CREATE OR REPLACE FUNCTION covase_is_admin() RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM covase_profiles WHERE user_id = auth.uid() AND active AND role = 'admin') $$;
REVOKE ALL ON FUNCTION covase_is_member(), covase_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION covase_is_member(), covase_is_admin() TO authenticated;

ALTER TABLE covase_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE covase_app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON covase_profiles, covase_app_settings FROM anon;
GRANT SELECT, UPDATE ON covase_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON covase_app_settings TO authenticated;

DROP POLICY IF EXISTS covase_profiles_read ON covase_profiles;
CREATE POLICY covase_profiles_read ON covase_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR covase_is_admin());
DROP POLICY IF EXISTS covase_profiles_admin_update ON covase_profiles;
CREATE POLICY covase_profiles_admin_update ON covase_profiles FOR UPDATE TO authenticated
  USING (covase_is_admin()) WITH CHECK (covase_is_admin());

DROP POLICY IF EXISTS covase_app_settings_read ON covase_app_settings;
CREATE POLICY covase_app_settings_read ON covase_app_settings FOR SELECT TO authenticated
  USING (covase_is_member());
DROP POLICY IF EXISTS covase_app_settings_admin_write ON covase_app_settings;
CREATE POLICY covase_app_settings_admin_write ON covase_app_settings FOR INSERT TO authenticated
  WITH CHECK (covase_is_admin());
DROP POLICY IF EXISTS covase_app_settings_admin_update ON covase_app_settings;
CREATE POLICY covase_app_settings_admin_update ON covase_app_settings FOR UPDATE TO authenticated
  USING (covase_is_admin()) WITH CHECK (covase_is_admin());

COMMIT;

-- Check (read-only): SELECT count(*) FROM information_schema.tables WHERE table_name IN ('covase_profiles','covase_app_settings');  -- 2

-- Rollback (manual):
-- DROP TABLE IF EXISTS covase_app_settings; DROP TABLE IF EXISTS covase_profiles;
-- DROP FUNCTION IF EXISTS covase_is_admin(); DROP FUNCTION IF EXISTS covase_is_member();
