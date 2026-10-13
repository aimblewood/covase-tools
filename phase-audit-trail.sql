-- phase-audit-trail.sql
-- Adds a change history (audit trail) for records in the platform.
--
-- WHY: "what changed on this booking, and when?" is currently unanswerable.
-- Nothing in the platform or in Supabase keeps a history of a row's previous
-- values, so when a hire's dates, vehicle or supplier reference change there is
-- no record of what they were before, who changed them, or when. Supabase's own
-- logs cover API requests, not field-level values, and they age out.
--
-- WHAT THIS GIVES YOU: one append-only table, covase_audit, with one row per
-- insert / update / delete, carrying
--   * the field-level diff (old value -> new value, only the fields that moved)
--   * a full snapshot of the row, so deleted records stay recoverable
-- populated by a database trigger, so it catches changes from ANY source --
-- the platform, the n8n agents, PostgREST, or the Supabase SQL editor itself.
--
-- SCOPE: this script turns the trigger on for covase_hires only. The triggers
-- for movements, fines and claims are written out at the bottom, commented, so
-- they can be switched on one at a time once this one has proved itself on the
-- live system.
--
-- Safe to re-run. Rollback at the bottom.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The log table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS covase_audit (
  id          BIGSERIAL PRIMARY KEY,
  table_name  TEXT        NOT NULL,
  record_id   TEXT        NOT NULL,
  job_ref     TEXT,
  action      TEXT        NOT NULL CHECK (action IN ('insert','update','delete')),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor       TEXT,
  diff        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  snapshot    JSONB
);

COMMENT ON TABLE  covase_audit             IS 'Append-only change history. One row per insert/update/delete on an audited table, written by the covase_audit_capture() trigger.';
COMMENT ON COLUMN covase_audit.record_id   IS 'The audited row''s id (e.g. hire-1234).';
COMMENT ON COLUMN covase_audit.job_ref     IS 'The audited row''s job_ref at the time of the change (CVB-/CVM-nnnn), copied in so the log reads without a join.';
COMMENT ON COLUMN covase_audit.actor       IS 'Best-effort: the PostgREST role (anon/authenticated) or DB user. The anon key is shared, so this identifies the route in, NOT the person.';
COMMENT ON COLUMN covase_audit.diff        IS 'Only the fields that changed: {"field": {"old": <value>, "new": <value>}}. Empty on insert and delete (the snapshot carries the whole row).';
COMMENT ON COLUMN covase_audit.snapshot    IS 'Full row: the NEW row on insert/update, the OLD row on delete. Deletes stay recoverable from this.';

-- Lookups: "history of this record, newest first".
CREATE INDEX IF NOT EXISTS covase_audit_record_idx
  ON covase_audit (table_name, record_id, changed_at DESC);

-- Lookups: "history around this date".
CREATE INDEX IF NOT EXISTS covase_audit_changed_at_idx
  ON covase_audit (changed_at DESC);

-- Lookups by supplier reservation reference (FVSL…), which is how Fourways
-- bookings are identified in conversation. Reads from the snapshot so it still
-- finds the history of a hire that has since been deleted.
CREATE INDEX IF NOT EXISTS covase_audit_supplier_ref_idx
  ON covase_audit ((snapshot ->> 'supplier_ref'));

-- ---------------------------------------------------------------------------
-- 2. The capture trigger
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so it can write to covase_audit even though covase_audit
-- has no INSERT policy -- that is deliberate: the anon key can read the log
-- but cannot write to it or edit it, so the history cannot be doctored from
-- the browser.
--
-- The whole insert is wrapped in an exception handler. If anything at all goes
-- wrong in here (table renamed, disk full, bad data), the audit write is
-- silently skipped and the user's save still succeeds. An audit trail must
-- never be the reason a booking won't save.

CREATE OR REPLACE FUNCTION covase_audit_capture()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  old_j    JSONB;
  new_j    JSONB;
  diff     JSONB := '{}'::jsonb;
  k        TEXT;
  rec_id   TEXT;
  the_ref  TEXT;
  snap     JSONB;
  act      TEXT;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      old_j := to_jsonb(OLD);
      snap  := old_j;
    ELSIF TG_OP = 'INSERT' THEN
      new_j := to_jsonb(NEW);
      snap  := new_j;
    ELSE
      old_j := to_jsonb(OLD);
      new_j := to_jsonb(NEW);
      snap  := new_j;

      -- Field-level diff. updated_at moves on every save, so on its own it is
      -- noise -- skip it, and if nothing else moved, write no row at all.
      -- That keeps "opened the modal and pressed Save" out of the history.
      FOR k IN SELECT jsonb_object_keys(new_j) LOOP
        CONTINUE WHEN k = 'updated_at';
        IF (old_j -> k) IS DISTINCT FROM (new_j -> k) THEN
          diff := diff || jsonb_build_object(
            k, jsonb_build_object('old', old_j -> k, 'new', new_j -> k)
          );
        END IF;
      END LOOP;

      IF diff = '{}'::jsonb THEN
        RETURN NEW;
      END IF;
    END IF;

    rec_id  := COALESCE(snap ->> 'id', '(unknown)');
    the_ref := snap ->> 'job_ref';

    -- Who/what made the change, best effort. PostgREST publishes the JWT
    -- claims as a setting; which of the two shapes it uses depends on its
    -- version, so try both and fall back to the session role. Note this
    -- function is SECURITY DEFINER, so current_user would always read
    -- 'postgres' -- session_user is the useful fallback.
    BEGIN
      act := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''),
        session_user::text
      );
    EXCEPTION WHEN OTHERS THEN
      act := session_user::text;
    END;

    INSERT INTO covase_audit (table_name, record_id, job_ref, action, actor, diff, snapshot)
    VALUES (TG_TABLE_NAME, rec_id, the_ref, lower(TG_OP), act, diff, snap);

  EXCEPTION WHEN OTHERS THEN
    -- Never block the write being audited.
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION covase_audit_capture() IS 'Writes one covase_audit row per change. Fails open: if the audit insert errors, the original write still succeeds.';

-- ---------------------------------------------------------------------------
-- 3. Turn it on for short hires
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS covase_hires_audit ON covase_hires;
CREATE TRIGGER covase_hires_audit
  AFTER INSERT OR UPDATE OR DELETE ON covase_hires
  FOR EACH ROW EXECUTE FUNCTION covase_audit_capture();

-- ---------------------------------------------------------------------------
-- 4. RLS: readable, not writable
-- ---------------------------------------------------------------------------

ALTER TABLE covase_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS covase_audit_select ON covase_audit;
CREATE POLICY covase_audit_select ON covase_audit
  FOR SELECT TO anon, authenticated
  USING (true);

-- Deliberately NO insert/update/delete policies. The trigger writes as the
-- table owner (SECURITY DEFINER); nothing holding the anon key can add to,
-- alter or erase the history.
--
-- Belt and braces: Supabase's default privileges hand anon/authenticated full
-- table rights on anything new in the public schema, so take the write rights
-- back explicitly rather than leaning on the missing policies alone.
GRANT SELECT ON covase_audit TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON covase_audit FROM anon, authenticated;

COMMIT;


-- ===========================================================================
-- How to read it
-- ===========================================================================
--
-- Everything that happened to a Fourways booking since 9 September:
--
--   SELECT changed_at, action, actor, diff
--   FROM covase_audit
--   WHERE table_name = 'covase_hires'
--     AND (
--       snapshot ->> 'supplier_ref' = 'FVSL050792'
--       OR record_id IN (SELECT id FROM covase_hires WHERE supplier_ref = 'FVSL050792')
--     )
--     AND changed_at >= '2026-09-09'
--   ORDER BY changed_at;
--
-- The same for a job ref:
--
--   SELECT changed_at, action, actor, diff
--   FROM covase_audit
--   WHERE table_name = 'covase_hires' AND job_ref = 'CVB-0042'
--   ORDER BY changed_at;
--
-- One line per field change, rather than a JSON blob per save:
--
--   SELECT a.changed_at, a.job_ref, d.key AS field,
--          d.value -> 'old' AS was, d.value -> 'new' AS now
--   FROM covase_audit a
--   CROSS JOIN LATERAL jsonb_each(a.diff) AS d
--   WHERE a.table_name = 'covase_hires'
--     AND a.changed_at >= now() - interval '7 days'
--   ORDER BY a.changed_at DESC, d.key;
--
-- Recover a deleted hire:
--
--   SELECT snapshot FROM covase_audit
--   WHERE action = 'delete' AND record_id = 'hire-…';
--
-- NOTE: history starts the moment this script runs. It cannot reconstruct
-- changes made before that -- including the FVSL050792 changes since
-- 9 September, which are not recorded anywhere and are genuinely gone.


-- ===========================================================================
-- Extend to the other tables (run one at a time, when wanted)
-- ===========================================================================
--
-- DROP TRIGGER IF EXISTS covase_movements_audit ON covase_movements;
-- CREATE TRIGGER covase_movements_audit
--   AFTER INSERT OR UPDATE OR DELETE ON covase_movements
--   FOR EACH ROW EXECUTE FUNCTION covase_audit_capture();
--
-- DROP TRIGGER IF EXISTS covase_fines_audit ON covase_fines;
-- CREATE TRIGGER covase_fines_audit
--   AFTER INSERT OR UPDATE OR DELETE ON covase_fines
--   FOR EACH ROW EXECUTE FUNCTION covase_audit_capture();
--
-- DROP TRIGGER IF EXISTS covase_claims_audit ON covase_claims;
-- CREATE TRIGGER covase_claims_audit
--   AFTER INSERT OR UPDATE OR DELETE ON covase_claims
--   FOR EACH ROW EXECUTE FUNCTION covase_audit_capture();


-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
--
-- DROP TRIGGER IF EXISTS covase_hires_audit ON covase_hires;
-- DROP TRIGGER IF EXISTS covase_movements_audit ON covase_movements;
-- DROP TRIGGER IF EXISTS covase_fines_audit ON covase_fines;
-- DROP TRIGGER IF EXISTS covase_claims_audit ON covase_claims;
-- DROP FUNCTION IF EXISTS covase_audit_capture();
-- DROP TABLE IF EXISTS covase_audit;          -- discards the history
