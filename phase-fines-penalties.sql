-- phase-fines-penalties.sql
-- Fines & Penalties module: one row per fine/penalty notice, from first Lex
-- notification through driver comms, nomination (speeding/NoIP), the COIN
-- (Lex consolidated monthly invoice), the WT Teams sheet export, payroll
-- charging and appeals/refunds.
--
-- Design notes:
--   * Linkage to our entities via local FKs only (Dynamics-detachment safe):
--       client_account_id -> covase_accounts, driver_contact_id -> covase_contacts,
--       vehicle_id -> covase_vehicles, hire_id -> covase_hires
--   * notice_class = legal category (per WT SO6): pcn_private | pcn_authority | noip
--     offence_type = practical category shown on the WT sheet (parking, speeding,
--     toll, congestion, bus_lane, route, other)
--   * status workflow:
--       new -> driver_notified -> (speeding: address_requested -> nominated)
--       -> on_coin -> to_be_charged -> charged  |  query  |  appeal_upheld -> refunded
--       (cancelled is terminal at any point)
--   * raw JSONB keeps the source COIN row / extracted PDF fields.
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS covase_fines (
  id TEXT PRIMARY KEY,                       -- 'fp-' + timestamp

  -- Source & classification
  source TEXT NOT NULL DEFAULT 'lex',        -- lex | covase_hire | enterprise | other
  notice_class TEXT,                         -- pcn_private | pcn_authority | noip
  offence_type TEXT,                         -- parking | speeding | toll | congestion | bus_lane | route | other
  issuer TEXT,                               -- e.g. Parking Eye Ltd, Horizon Parking Ltd
  issuer_ref TEXT,                           -- notice/ref number from the issuer
  issuer_portal TEXT,                        -- URL for nominations/appeals (from the notice)
  location TEXT,
  offence_datetime TIMESTAMPTZ,

  -- Vehicle & driver (denormalised + local links)
  vehicle_reg TEXT,
  vehicle_desc TEXT,
  driver_name TEXT,
  driver_contact_id TEXT REFERENCES covase_contacts(id) ON DELETE SET NULL,
  vehicle_id TEXT REFERENCES covase_vehicles(id) ON DELETE SET NULL,
  hire_id TEXT REFERENCES covase_hires(id) ON DELETE SET NULL,
  client_account_id TEXT REFERENCES covase_accounts(id) ON DELETE SET NULL,

  -- Money
  fine_amount NUMERIC(10,2),                 -- amount paid/payable (reduced rate where applicable)
  fine_vat NUMERIC(10,2),
  full_amount NUMERIC(10,2),                 -- pre-discount amount if known
  admin_fee NUMERIC(10,2),                   -- Lex/Covase admin fee (typically 15.00)
  admin_fee_vat NUMERIC(10,2),

  -- COIN (Lex consolidated monthly invoice)
  coin_invoice_no TEXT,
  coin_invoice_date DATE,

  -- Workflow
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','driver_notified','address_requested','nominated',
                      'on_coin','to_be_charged','charged','query','appeal_upheld','refunded','cancelled')),
  charge_month TEXT,                         -- e.g. 'Jul 26' -> WT sheet "To be charged Jul 26"
  driver_notified_at TIMESTAMPTZ,
  address_requested_at TIMESTAMPTZ,
  address_confirmed_at TIMESTAMPTZ,
  nominated_at TIMESTAMPTZ,
  exported_at TIMESTAMPTZ,                   -- last included in a WT-sheet export

  -- Appeals & refunds
  appeal_status TEXT,                        -- advised | upheld | rejected
  refund_received_at TIMESTAMPTZ,
  refund_amount NUMERIC(10,2),

  notes TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS covase_fines_status_idx ON covase_fines(status);
CREATE INDEX IF NOT EXISTS covase_fines_coin_idx ON covase_fines(coin_invoice_no);
CREATE INDEX IF NOT EXISTS covase_fines_reg_idx ON covase_fines(vehicle_reg);
CREATE INDEX IF NOT EXISTS covase_fines_offence_date_idx ON covase_fines(offence_datetime DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS covase_fines_driver_idx ON covase_fines(driver_contact_id) WHERE driver_contact_id IS NOT NULL;

ALTER TABLE covase_fines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS covase_fines_app_all ON covase_fines;
CREATE POLICY covase_fines_app_all ON covase_fines
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE covase_fines IS
  'Fines & penalties register: Lex/hire-co motoring fines from first notification through driver comms, nomination, COIN reconciliation, WT-sheet export, charging and appeals. Templates and dashboard config live in covase_config (fines_templates, fines_dashboard).';

COMMIT;

-- Rollback (manual):
-- DROP TABLE IF EXISTS covase_fines;
