-- phase-supplier-replies.sql
-- Stores supplier replies to booking requests, parsed by the n8n reply agent
-- ("Covase — Supplier Reply Processor"). Each row is one inbound reply matched
-- to a hire via the [CVB:<hire id>] code carried in the email subject.
-- The platform shows 'needs_review' rows in a review queue; applying one updates
-- the hire. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS covase_supplier_replies (
  id                  TEXT PRIMARY KEY,
  hire_id             TEXT,
  message_id          TEXT UNIQUE,          -- Graph message id, for dedupe
  received_at         TIMESTAMPTZ,
  from_email          TEXT,
  subject             TEXT,
  outcome             TEXT,                 -- confirmed | declined | needs_info | alternative | unclear
  reservation_number  TEXT,
  vehicle_reg         TEXT,
  vehicle_makemodel   TEXT,
  p11d_value          NUMERIC(10,2),
  fuel_type           TEXT,
  co2_emissions       INTEGER,
  engine_cc           INTEGER,
  date_of_registration DATE,
  agreed_start_date   DATE,
  agreed_end_date     DATE,
  price               NUMERIC(10,2),
  questions           TEXT,
  summary             TEXT,
  acknowledgement_reply TEXT,               -- agent-drafted thank-you (acknowledgements only)
  confidence          NUMERIC(4,3),         -- 0.000–1.000
  raw_body            TEXT,
  status              TEXT NOT NULL DEFAULT 'needs_review',  -- needs_review | applied | dismissed | resourced | auto_acknowledged | sent
  direction           TEXT NOT NULL DEFAULT 'inbound',        -- inbound (supplier) | outbound (us: booking request / acknowledgement)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS covase_supplier_replies_status_idx ON covase_supplier_replies(status);
CREATE INDEX IF NOT EXISTS covase_supplier_replies_hire_idx   ON covase_supplier_replies(hire_id);

-- RLS on (clears the admin warning) + permissive policy so the app's anon key
-- can read/write, matching covase_config.
-- Idempotent adds for tables created before these columns existed.
ALTER TABLE covase_supplier_replies ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'inbound';
ALTER TABLE covase_supplier_replies ADD COLUMN IF NOT EXISTS acknowledgement_reply TEXT;

ALTER TABLE covase_supplier_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS covase_supplier_replies_app_all ON covase_supplier_replies;
CREATE POLICY covase_supplier_replies_app_all ON covase_supplier_replies
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMIT;

-- Rollback (manual):
-- DROP TABLE IF EXISTS covase_supplier_replies;
