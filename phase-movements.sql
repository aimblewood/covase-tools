-- phase-movements.sql
-- Creates covase_movements for the vehicle-movement quoting + job-management
-- module. Each row is one movement: a one-off job to drive a vehicle from
-- pickup_postcode to dropoff_postcode for a customer, outsourced to a driver,
-- with Covase taking a flat markup on top.
--
-- Pricing model (recorded fields, not enforced in DB):
--   base_charge       = £80 first 100 miles + £0.80/mile thereafter
--   markup_flat       = internal margin on top of base (never shown to customer)
--   supplementaries   = array of ad-hoc cost lines (ferry, hotel, etc.) using
--                       the same {type,cost_amount,upsell_amount,vat_status,notes}
--                       shape as covase_hires.supplementaries, for consistency
--   vat_total         = 20% applied to (base + markup + supps' upsell-or-cost)
--   quote_total       = the customer-facing inc-VAT total at quote time
--
-- Fuel reconciliation (post-movement):
--   actual_fuel_cost     = what the driver/supplier billed us for fuel
--   fuel_markup_pct      = percentage applied on top of actual_fuel_cost
--                          (defaults set at app level, editable per row)
--   fuel_markup_amount   = actual_fuel_cost * fuel_markup_pct, recorded so the
--                          calc is reproducible even if the percentage convention
--                          changes later
--   invoice_total        = quote_total + actual_fuel_cost +
--                          fuel_markup_amount + VAT-on-the-fuel-bits
--
-- Status flow:
--   quoted → booked → in_progress → completed_pending_fuel →
--   invoiced → paid    (cancelled is terminal at any point)
--
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS covase_movements (
  id TEXT PRIMARY KEY,

  -- Customer
  client_account_id TEXT REFERENCES covase_accounts(id) ON DELETE SET NULL,
  customer TEXT,                  -- denormalised display name; snapshot from account at create time
  customer_reference TEXT,        -- customer's own PO / job reference

  -- Journey
  pickup_postcode TEXT,
  pickup_address_line1 TEXT,
  pickup_town TEXT,
  pickup_county TEXT,
  dropoff_postcode TEXT,
  dropoff_address_line1 TEXT,
  dropoff_town TEXT,
  dropoff_county TEXT,

  -- Mileage
  mileage NUMERIC(8,2),
  mileage_source TEXT CHECK (mileage_source IS NULL OR mileage_source IN ('manual','openrouteservice','google','other')),
  drive_time_minutes INTEGER,

  -- Vehicle being moved (optional — sometimes the reg isn't known at quote time)
  vehicle_reg TEXT,
  vehicle_makemodel TEXT,

  -- Assigned driver (matched from Dynamics contact where possible; free-text
  -- allowed when no lookup match). driver_dynamics_id links back to Dynamics.
  driver_name TEXT,
  driver_dynamics_id TEXT,

  -- Pricing — quote stage
  base_charge NUMERIC(10,2),
  markup_flat NUMERIC(10,2),
  supplementaries JSONB,          -- [{type,cost_amount,upsell_amount,vat_status,notes}]
  vat_total NUMERIC(10,2),
  quote_total NUMERIC(10,2),

  -- Pricing — reconciliation after the movement
  actual_fuel_cost NUMERIC(10,2),
  fuel_markup_pct NUMERIC(5,2),   -- e.g. 20.00 = 20%
  fuel_markup_amount NUMERIC(10,2),
  invoice_total NUMERIC(10,2),

  -- Lifecycle
  movement_status TEXT NOT NULL DEFAULT 'quoted'
    CHECK (movement_status IN ('quoted','booked','in_progress','completed_pending_fuel','invoiced','paid','cancelled')),
  quote_date DATE,
  movement_date DATE,

  -- Misc
  notes TEXT,
  internal_notes TEXT,            -- never shown to customer

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Idempotent column adds, for environments where the table was created before
-- pickup_county / dropoff_county existed. No-op on a fresh CREATE TABLE above.
ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS pickup_county TEXT;
ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS dropoff_county TEXT;
ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS driver_dynamics_id TEXT;

CREATE INDEX IF NOT EXISTS covase_movements_status_idx
  ON covase_movements(movement_status);

CREATE INDEX IF NOT EXISTS covase_movements_client_idx
  ON covase_movements(client_account_id)
  WHERE client_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS covase_movements_movement_date_idx
  ON covase_movements(movement_date DESC NULLS LAST);

-- RLS: enable + a permissive policy so the app's anon key can read/write,
-- mirroring covase_config / covase_supplier_replies. This is the important one:
-- a table with RLS *enabled but no policy* returns ZERO rows to the anon key,
-- which makes existing movements invisible in the app even though the rows are
-- still in the table. Idempotent — safe to re-run; changes no data.
ALTER TABLE covase_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS covase_movements_app_all ON covase_movements;
CREATE POLICY covase_movements_app_all ON covase_movements
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE covase_movements IS
  'Vehicle-movement quotes and jobs: ad-hoc point-to-point moves outsourced to a third-party driver, with Covase taking a flat markup on top of a mileage-based base. Reconciled with actual fuel cost after the movement.';

COMMENT ON COLUMN covase_movements.markup_flat IS
  'Internal margin only — never display on customer-facing quotes or invoices.';

COMMENT ON COLUMN covase_movements.internal_notes IS
  'Internal notes only — never display to customer.';

COMMIT;

-- Rollback (manual):
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS driver_dynamics_id;
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS driver_name;
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS dropoff_county;
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS pickup_county;
-- DROP INDEX IF EXISTS covase_movements_movement_date_idx;
-- DROP INDEX IF EXISTS covase_movements_client_idx;
-- DROP INDEX IF EXISTS covase_movements_status_idx;
-- DROP TABLE IF EXISTS covase_movements;
