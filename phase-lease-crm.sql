-- phase-lease-crm.sql
-- The lease journey: orders (Dynamics "Opportunity") with quotes under them,
-- dealer purchase orders, a per-vehicle stage, allocation extras and the
-- mileage log. Builds on phase-crm-foundations.sql.
--
-- ADDITIVE ONLY: new tables, new columns, sequences, policies, realtime and
-- (if the audit phase is installed) audit triggers. No existing row changes;
-- the 55 existing vehicles keep lease_stage NULL and the app derives a stage
-- from their dates until someone sets one.
-- Safe to re-run. Rollback at the bottom.
--
-- Numbering: ORBIS quotes start at QT 2000 and POs at PO 14000, clear of the
-- Dynamics ranges (QT 1953 / PO 13991 on 21 Oct 2026) while both systems run.
-- Change with: SELECT setval('covase_quote_no_seq', <last used>);

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Numbering
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS covase_order_ref_seq START 1;
CREATE SEQUENCE IF NOT EXISTS covase_quote_no_seq  START 2000;
CREATE SEQUENCE IF NOT EXISTS covase_po_number_seq START 14000;
GRANT USAGE, SELECT ON SEQUENCE covase_order_ref_seq, covase_quote_no_seq, covase_po_number_seq TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Orders (one per client request, enquiry → won/lost)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS covase_orders (
  id                     TEXT PRIMARY KEY DEFAULT ('ord-' || gen_random_uuid()::text),
  order_ref              TEXT NOT NULL UNIQUE DEFAULT ('CVO-' || lpad(nextval('covase_order_ref_seq')::text, 4, '0')),
  title                  TEXT,
  account_id             TEXT REFERENCES covase_accounts(id) ON DELETE SET NULL,
  driver_contact_id      TEXT REFERENCES covase_contacts(id) ON DELETE SET NULL,
  contact_id             TEXT REFERENCES covase_contacts(id) ON DELETE SET NULL,
  source                 TEXT,
  territory              TEXT DEFAULT 'UK',
  owner                  TEXT,
  stage                  TEXT NOT NULL DEFAULT 'enquiry'
                         CHECK (stage IN ('enquiry','quoting','proposal_sent','won','lost')),
  lost_reason            TEXT,
  expected_delivery_date DATE,
  decision_timeframe     TEXT,
  funder_account_id      TEXT REFERENCES covase_accounts(id) ON DELETE SET NULL,
  dealer_account_id      TEXT REFERENCES covase_accounts(id) ON DELETE SET NULL,
  chosen_quote_id        TEXT,
  vehicle_id             TEXT REFERENCES covase_vehicles(id) ON DELETE SET NULL,
  notes                  TEXT,
  won_at                 TIMESTAMPTZ,
  lost_at                TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS covase_orders_account_idx ON covase_orders(account_id);
CREATE INDEX IF NOT EXISTS covase_orders_stage_idx   ON covase_orders(stage);
COMMENT ON TABLE covase_orders IS
  'A client vehicle request, enquiry → quoting → proposal_sent → won/lost (Dynamics "Opportunity"). Money comes from the chosen quote, never typed here. Winning creates the covase_vehicles record (vehicle_id).';

-- ---------------------------------------------------------------------------
-- 3. Quotes (several per order; one is chosen)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS covase_quotes (
  id                 TEXT PRIMARY KEY DEFAULT ('qt-' || gen_random_uuid()::text),
  quote_no           TEXT NOT NULL UNIQUE DEFAULT ('QT ' || nextval('covase_quote_no_seq')::text),
  order_id           TEXT NOT NULL REFERENCES covase_orders(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','sent','accepted','declined','superseded')),
  quote_date         DATE DEFAULT CURRENT_DATE,
  -- vehicle
  vehicle_type       TEXT DEFAULT 'Car' CHECK (vehicle_type IS NULL OR vehicle_type IN ('Car','LCV')),
  manufacturer       TEXT,
  model              TEXT,
  derivative         TEXT,
  engine_size        TEXT,
  engine_cc          INTEGER,
  fuel_type          TEXT,
  transmission       TEXT,
  body_style         TEXT,
  num_doors          INTEGER,
  exterior_colour    TEXT,
  interior_trim      TEXT,
  co2_emissions      INTEGER,
  p11d_value         NUMERIC,
  otr                NUMERIC,
  ev_range           NUMERIC,
  fuel_consumption   NUMERIC,
  standard_items     TEXT,
  optional_extras    TEXT,
  -- contract
  funder_account_id  TEXT REFERENCES covase_accounts(id) ON DELETE SET NULL,
  funders_quote_no   TEXT,
  funding_method     TEXT DEFAULT 'Contract Hire',
  contract_type      TEXT,
  term_months        INTEGER,
  annual_mileage     INTEGER,
  payment_profile    TEXT,
  excess_mileage_ppm NUMERIC,
  vat_type           TEXT DEFAULT 'excluding VAT',
  -- money (totals are worked out by the app, never stored)
  finance_rental     NUMERIC,
  service_rental     NUMERIC,
  commissions        NUMERIC,
  setup_fee          NUMERIC,
  management_fee     NUMERIC,
  other_revenue      NUMERIC,
  costs              NUMERIC,
  -- where it came from
  source_document_id TEXT REFERENCES covase_documents(id) ON DELETE SET NULL,
  reader_notes       TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS covase_quotes_order_idx ON covase_quotes(order_id);
COMMENT ON TABLE covase_quotes IS
  'A priced vehicle option under an order, usually read from the funder worksheet. Column names match covase_vehicles so accepting a quote copies across 1:1. Total/effective rental and profit are computed, not stored.';
COMMENT ON COLUMN covase_quotes.reader_notes IS
  'What the funder-worksheet reader could not map (labels no funder rule covers). Shown to the user, never guessed.';

DO $$ BEGIN
  ALTER TABLE covase_orders ADD CONSTRAINT covase_orders_chosen_quote_fkey
    FOREIGN KEY (chosen_quote_id) REFERENCES covase_quotes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 4. Vehicle: link back to the order, and one stage instead of three statuses
-- ---------------------------------------------------------------------------
ALTER TABLE covase_vehicles
  ADD COLUMN IF NOT EXISTS order_id         TEXT,
  ADD COLUMN IF NOT EXISTS quote_id         TEXT,
  ADD COLUMN IF NOT EXISTS lease_stage      TEXT,
  ADD COLUMN IF NOT EXISTS stage_checklist  JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE covase_vehicles ADD CONSTRAINT covase_vehicles_lease_stage_check
    CHECK (lease_stage IS NULL OR lease_stage IN ('order_to_dealer','order_confirmed','contracts_sent','contracts_signed',
      'delivery_booked','delivered','sent_for_payout','order_complete','on_fleet','off_hire'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE covase_vehicles ADD CONSTRAINT covase_vehicles_order_fkey
    FOREIGN KEY (order_id) REFERENCES covase_orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE covase_vehicles ADD CONSTRAINT covase_vehicles_quote_fkey
    FOREIGN KEY (quote_id) REFERENCES covase_quotes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN covase_vehicles.lease_stage IS
  'Order-to-off-hire stage. NULL on vehicles that predate it: the app derives a stage from the milestone dates until one is set.';
COMMENT ON COLUMN covase_vehicles.stage_checklist IS
  'Ticked checklist items per stage, e.g. {"order_to_dealer":{"po_sent":"2026-10-21"}}.';

-- ---------------------------------------------------------------------------
-- 5. Dealer purchase orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS covase_purchase_orders (
  id                     TEXT PRIMARY KEY DEFAULT ('po-' || gen_random_uuid()::text),
  po_number              TEXT NOT NULL UNIQUE DEFAULT ('PO ' || nextval('covase_po_number_seq')::text),
  vehicle_id             TEXT NOT NULL REFERENCES covase_vehicles(id) ON DELETE CASCADE,
  order_id               TEXT REFERENCES covase_orders(id) ON DELETE SET NULL,
  dealer_account_id      TEXT REFERENCES covase_accounts(id) ON DELETE SET NULL,
  funder_account_id      TEXT REFERENCES covase_accounts(id) ON DELETE SET NULL,
  status                 TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','sent','confirmed','cancelled')),
  po_date                DATE DEFAULT CURRENT_DATE,
  dealer_quote_ref       TEXT,
  dealer_quote_date      DATE,
  vehicle_description    TEXT,
  extras                 TEXT,
  otr                    NUMERIC,
  registration_address   TEXT,
  invoice_address        TEXT,
  delivery_contact       TEXT,
  delivery_phone         TEXT,
  delivery_address       TEXT,
  required_not_before    DATE,
  sent_at                TIMESTAMPTZ,
  confirmed_at           TIMESTAMPTZ,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS covase_purchase_orders_vehicle_idx ON covase_purchase_orders(vehicle_id);
COMMENT ON TABLE covase_purchase_orders IS
  'Covase purchase order to a dealer for a vehicle. Addresses are snapshotted as printed, so a later edit to the funder account never rewrites a sent PO.';

-- ---------------------------------------------------------------------------
-- 6. Allocations (covase_assignments already exists, empty): handover extras
-- ---------------------------------------------------------------------------
ALTER TABLE covase_assignments
  ADD COLUMN IF NOT EXISTS allocation_type TEXT NOT NULL DEFAULT 'permanent',
  ADD COLUMN IF NOT EXISTS start_mileage   INTEGER,
  ADD COLUMN IF NOT EXISTS end_mileage     INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$ BEGIN
  ALTER TABLE covase_assignments ADD CONSTRAINT covase_assignments_type_check
    CHECK (allocation_type IN ('permanent','temporary','pool'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS covase_assignments_vehicle_idx ON covase_assignments(vehicle_id, start_date DESC);
CREATE INDEX IF NOT EXISTS covase_assignments_contact_idx ON covase_assignments(contact_id);

-- ---------------------------------------------------------------------------
-- 7. Mileage log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS covase_mileage_readings (
  id            TEXT PRIMARY KEY DEFAULT ('mlg-' || gen_random_uuid()::text),
  vehicle_id    TEXT NOT NULL REFERENCES covase_vehicles(id) ON DELETE CASCADE,
  reading_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  odometer      INTEGER NOT NULL CHECK (odometer >= 0),
  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','driver','mot','service','invoice','movement','hire','handover','orbis')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS covase_mileage_vehicle_idx ON covase_mileage_readings(vehicle_id, reading_date DESC);
COMMENT ON TABLE covase_mileage_readings IS
  'Odometer readings per vehicle from any source (orbis = connected-car feed). The app projects end-of-contract mileage from these.';

-- ---------------------------------------------------------------------------
-- 8. RLS (permissive, as everywhere), realtime, audit
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['covase_orders','covase_quotes','covase_purchase_orders','covase_mileage_readings'] LOOP
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

-- Check (read-only): should return 4
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_name IN ('covase_orders','covase_quotes','covase_purchase_orders','covase_mileage_readings');

-- ---------------------------------------------------------------------------
-- Rollback (manual). Dropping the tables loses orders/quotes/POs/readings
-- entered since.
-- ---------------------------------------------------------------------------
-- ALTER TABLE covase_vehicles DROP CONSTRAINT IF EXISTS covase_vehicles_order_fkey,
--   DROP CONSTRAINT IF EXISTS covase_vehicles_quote_fkey, DROP CONSTRAINT IF EXISTS covase_vehicles_lease_stage_check;
-- ALTER TABLE covase_vehicles DROP COLUMN IF EXISTS order_id, DROP COLUMN IF EXISTS quote_id,
--   DROP COLUMN IF EXISTS lease_stage, DROP COLUMN IF EXISTS stage_checklist, DROP COLUMN IF EXISTS stage_changed_at;
-- ALTER TABLE covase_assignments DROP CONSTRAINT IF EXISTS covase_assignments_type_check;
-- ALTER TABLE covase_assignments DROP COLUMN IF EXISTS allocation_type, DROP COLUMN IF EXISTS start_mileage,
--   DROP COLUMN IF EXISTS end_mileage, DROP COLUMN IF EXISTS updated_at;
-- DROP TABLE IF EXISTS covase_mileage_readings;
-- DROP TABLE IF EXISTS covase_purchase_orders;
-- ALTER TABLE covase_orders DROP CONSTRAINT IF EXISTS covase_orders_chosen_quote_fkey;
-- DROP TABLE IF EXISTS covase_quotes;
-- DROP TABLE IF EXISTS covase_orders;
-- DROP SEQUENCE IF EXISTS covase_po_number_seq, covase_quote_no_seq, covase_order_ref_seq;
