-- phase-job-refs.sql
-- Human-friendly job references:
--   * covase_hires.job_ref      → CVB-0001, CVB-0002, ...
--   * covase_movements.job_ref  → CVM-0001, CVM-0002, ...
-- Assigned automatically on insert (Postgres default), backfilled for existing
-- rows in id order (ids embed creation epoch, so numbering is chronological).
-- Also: covase_supplier_replies.movement_id so the logistics reply agent can
-- link replies to movements (mirrors hire_id).
-- Safe to re-run: sequences/columns guarded, backfill only touches NULL refs.

-- ── Sequences ──
CREATE SEQUENCE IF NOT EXISTS covase_hire_ref_seq;
CREATE SEQUENCE IF NOT EXISTS covase_movement_ref_seq;

-- ── Columns ──
ALTER TABLE covase_hires     ADD COLUMN IF NOT EXISTS job_ref TEXT UNIQUE;
ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS job_ref TEXT UNIQUE;
ALTER TABLE covase_supplier_replies ADD COLUMN IF NOT EXISTS movement_id TEXT;

-- ── Backfill existing rows (chronological by id) ──
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM covase_hires WHERE job_ref IS NULL
)
UPDATE covase_hires h
SET job_ref = 'CVB-' || lpad((n.rn + COALESCE((
      SELECT max(substring(job_ref FROM '\d+$')::int) FROM covase_hires WHERE job_ref IS NOT NULL
    ), 0))::text, 4, '0')
FROM numbered n WHERE h.id = n.id;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM covase_movements WHERE job_ref IS NULL
)
UPDATE covase_movements m
SET job_ref = 'CVM-' || lpad((n.rn + COALESCE((
      SELECT max(substring(job_ref FROM '\d+$')::int) FROM covase_movements WHERE job_ref IS NOT NULL
    ), 0))::text, 4, '0')
FROM numbered n WHERE m.id = n.id;

-- ── Point the sequences past the backfill, then set insert defaults ──
SELECT setval('covase_hire_ref_seq',
  COALESCE((SELECT max(substring(job_ref FROM '\d+$')::int) FROM covase_hires), 0) + 1, false);
SELECT setval('covase_movement_ref_seq',
  COALESCE((SELECT max(substring(job_ref FROM '\d+$')::int) FROM covase_movements), 0) + 1, false);

ALTER TABLE covase_hires
  ALTER COLUMN job_ref SET DEFAULT 'CVB-' || lpad(nextval('covase_hire_ref_seq')::text, 4, '0');
ALTER TABLE covase_movements
  ALTER COLUMN job_ref SET DEFAULT 'CVM-' || lpad(nextval('covase_movement_ref_seq')::text, 4, '0');

-- Sanity check (run separately if you like):
-- SELECT job_ref, id FROM covase_hires ORDER BY job_ref DESC LIMIT 5;
-- SELECT job_ref, id FROM covase_movements ORDER BY job_ref DESC LIMIT 5;

-- Rollback (manual):
-- ALTER TABLE covase_supplier_replies DROP COLUMN IF EXISTS movement_id;
-- ALTER TABLE covase_hires     ALTER COLUMN job_ref DROP DEFAULT;
-- ALTER TABLE covase_movements ALTER COLUMN job_ref DROP DEFAULT;
-- ALTER TABLE covase_hires     DROP COLUMN IF EXISTS job_ref;
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS job_ref;
-- DROP SEQUENCE IF EXISTS covase_hire_ref_seq;
-- DROP SEQUENCE IF EXISTS covase_movement_ref_seq;
