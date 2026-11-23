-- phase-onboarding.sql
-- Driver onboarding (design: onboarding-design.md, approved by Simon 23 Nov 2026).
-- One case per driver joining a client's car scheme (new starter, opting in /
-- role change, returning). Each case has a checklist of steps; the steps table
-- is also the to-do list the Drivetech browser skills will read and write later.
--
-- ADDITIVE ONLY: three new tables, one sequence, permissive policies (as
-- everywhere), realtime, and audit triggers if the audit phase is installed.
-- No existing table or row is touched. Safe to re-run. Rollback at the bottom.
--
-- Client policies (steps, emails, document rules) live in covase_config key
-- 'onboarding_policies' -- no SQL needed for those. Policy documents use the
-- existing covase_documents / covase_document_links with record_type
-- 'onboarding_policy'; files sent or received on a case use record_type
-- 'onboarding'.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS covase_onboarding_ref_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE covase_onboarding_ref_seq TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Cases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS covase_onboarding_cases (
  id                   TEXT PRIMARY KEY DEFAULT ('onb-' || gen_random_uuid()::text),
  case_ref             TEXT NOT NULL UNIQUE DEFAULT ('CVN-' || lpad(nextval('covase_onboarding_ref_seq')::text, 4, '0')),
  account_id           TEXT REFERENCES covase_accounts(id) ON DELETE SET NULL,
  client_name          TEXT,
  policy_key           TEXT,
  case_type            TEXT NOT NULL DEFAULT 'new_starter'
                       CHECK (case_type IN ('new_starter','opt_in','returning')),
  basis                TEXT CHECK (basis IS NULL OR basis IN ('perm','fixed_term')),
  job_title            TEXT,
  start_date           DATE,
  -- driver
  first_name           TEXT,
  last_name            TEXT,
  preferred_name       TEXT,
  email                TEXT,
  mobile               TEXT,
  address_line1        TEXT,
  address_line2        TEXT,
  town                 TEXT,
  county               TEXT,
  postcode             TEXT,
  contact_id           TEXT REFERENCES covase_contacts(id) ON DELETE SET NULL,
  dynamics_contact_id  TEXT,
  -- vehicle
  vehicle_route        TEXT NOT NULL DEFAULT 'undecided'
                       CHECK (vehicle_route IN ('short_hire','existing_vehicle','new_lease','undecided')),
  vehicle_type         TEXT NOT NULL DEFAULT 'car' CHECK (vehicle_type IN ('car','lcv')),
  hire_id              TEXT REFERENCES covase_hires(id) ON DELETE SET NULL,
  vehicle_reg          TEXT,
  vehicle_desc         TEXT,
  dynamics_vehicle_id  TEXT,
  -- housekeeping
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  source_email         TEXT,
  emails               JSONB NOT NULL DEFAULT '[]'::jsonb,
  sheet_text           TEXT,
  notes                TEXT,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS covase_onboarding_cases_account_idx ON covase_onboarding_cases(account_id);
CREATE INDEX IF NOT EXISTS covase_onboarding_cases_status_idx  ON covase_onboarding_cases(status);
COMMENT ON TABLE covase_onboarding_cases IS
  'Driver onboarding case (CVN-nnnn): one driver joining a client car scheme. Steps in covase_onboarding_steps; rules in covase_config onboarding_policies. emails = log of driver emails sent [{key,subject,to,from,sent_at,attachments}].';

-- ---------------------------------------------------------------------------
-- 2. Steps (checklist; also the browser skills' to-do list and results)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS covase_onboarding_steps (
  id          TEXT PRIMARY KEY DEFAULT ('onbs-' || gen_random_uuid()::text),
  case_id     TEXT NOT NULL REFERENCES covase_onboarding_cases(id) ON DELETE CASCADE,
  step_key    TEXT NOT NULL,
  label       TEXT,
  kind        TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('auto','browser','manual','driver')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'todo'
              CHECK (status IN ('todo','ready','in_progress','done','skipped','failed')),
  result      TEXT,
  error       TEXT,
  done_at     TIMESTAMPTZ,
  done_by     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, step_key)
);
CREATE INDEX IF NOT EXISTS covase_onboarding_steps_queue_idx ON covase_onboarding_steps(kind, status);
COMMENT ON TABLE covase_onboarding_steps IS
  'Checklist rows per onboarding case. kind=browser + status=ready is the queue a Claude browser skill works through; it writes status/result/error back.';

-- ---------------------------------------------------------------------------
-- 3. Nominees (read-only oversight; written by the Drivetech status skill)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS covase_onboarding_nominees (
  id            TEXT PRIMARY KEY DEFAULT ('onbn-' || gen_random_uuid()::text),
  case_id       TEXT NOT NULL REFERENCES covase_onboarding_cases(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  check_status  TEXT,
  checked_at    TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, name)
);

-- ---------------------------------------------------------------------------
-- 4. RLS (permissive, as everywhere), realtime, audit
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['covase_onboarding_cases','covase_onboarding_steps','covase_onboarding_nominees'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_app_all', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t || '_app_all', t);
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    IF to_regprocedure('public.covase_audit_capture()') IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION covase_audit_capture()', t || '_audit', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Check (read-only): should return 3
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_name IN ('covase_onboarding_cases','covase_onboarding_steps','covase_onboarding_nominees');

-- ---------------------------------------------------------------------------
-- Rollback (manual). Loses every onboarding case entered since.
-- ---------------------------------------------------------------------------
-- DROP TABLE IF EXISTS covase_onboarding_nominees;
-- DROP TABLE IF EXISTS covase_onboarding_steps;
-- DROP TABLE IF EXISTS covase_onboarding_cases;
-- DROP SEQUENCE IF EXISTS covase_onboarding_ref_seq;
