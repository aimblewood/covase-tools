-- phase-accident-claims.sql
-- Accident-management module: claims tracked from FMG's nightly DataSummary
-- export. FMG is the system of record — we import (upsert) and monitor; the
-- platform never edits FMG-owned fields.
--
-- Design notes (Dynamics detachment):
--   * FMG payload fields are typed columns (not a JSON blob) so reporting and
--     alerts work with plain SQL. A raw JSONB copy is retained per row so any
--     column FMG adds later is preserved before we map it.
--   * Linkage to OUR entities is by local FK columns only:
--       client_account_id  -> covase_accounts(id)
--       driver_contact_id  -> covase_contacts(id)
--       vehicle_id         -> covase_vehicles(id)   (fleet vehicles)
--       hire_id            -> covase_hires(id)      (rental regs not in Dynamics)
--     Dynamics is reached THROUGH those tables (their dynamics_id columns);
--     nothing here references Dynamics directly, so detachment is a no-op
--     for this module.
--   * One row per FMG claim reference. id = 'clm-' + claim_reference.
--
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS covase_claims (
  id TEXT PRIMARY KEY,                      -- 'clm-' + claim_reference
  claim_reference TEXT UNIQUE NOT NULL,     -- FMG claim ref (CVL...)

  -- Incident
  incident_date TIMESTAMPTZ,
  reported_date TIMESTAMPTZ,
  days_to_report INTEGER,
  incident_type TEXT,                       -- Vehicle Damage | Glass Only | Reference Claim
  incident_category TEXT,
  incident_location TEXT,
  incident_circumstances TEXT,
  purpose_of_use TEXT,
  speed INTEGER,
  weather_conditions TEXT,
  damage_notes TEXT,
  injuries_sustained TEXT,
  third_party_involved TEXT,
  fault_type TEXT,                          -- Driver | Third Party | Insufficient Information
  driveable TEXT,

  -- Vehicle (as reported by FMG)
  vehicle_reg TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_mileage INTEGER,
  vehicle_type TEXT,

  -- Driver (as reported by FMG)
  driver_name TEXT,
  driver_type TEXT,

  -- Insurer / repair pipeline
  insurer_reference TEXT,
  replacement_type TEXT,
  booking_in_date TIMESTAMPTZ,
  estimated_completion_date TIMESTAMPTZ,
  actual_completion_date TIMESTAMPTZ,
  vehicle_off_road_days INTEGER,            -- FMG "Vehicle Off Road Time"
  repair_status TEXT,                       -- Not Booked In | Booked In | Off Road | Closed - Repaired | NULL (glass/reference)
  repairs_supplier TEXT,

  -- ULR (uninsured loss recovery)
  ulr_quantified NUMERIC(12,2),
  ulr_total NUMERIC(12,2),
  ulr_status TEXT,

  -- Costs
  original_estimate NUMERIC(12,2),
  agreed_estimate NUMERIC(12,2),
  body_repairs_total NUMERIC(12,2),
  salvage_total NUMERIC(12,2),
  hire_total NUMERIC(12,2),
  glass_total NUMERIC(12,2),
  recovery_total NUMERIC(12,2),
  other_total NUMERIC(12,2),
  total_net_costs NUMERIC(12,2),
  client_net_total NUMERIC(12,2),
  insurer_net_total NUMERIC(12,2),
  client_vat_total NUMERIC(12,2),
  ad_paid NUMERIC(12,2),
  ad_outstanding NUMERIC(12,2),
  ad_total NUMERIC(12,2),
  tp_paid NUMERIC(12,2),
  tp_outstanding NUMERIC(12,2),
  tp_total NUMERIC(12,2),
  total_insurer_cost NUMERIC(12,2),

  -- Organisation (FMG hierarchy)
  client_group TEXT,                        -- FMG "Group"
  company TEXT,
  branch TEXT,
  cost_centre TEXT,
  spare_1 TEXT, spare_2 TEXT, spare_3 TEXT, spare_4 TEXT, spare_5 TEXT,

  -- Linkage to our entities (matched on import; NULL = unmatched)
  client_account_id TEXT REFERENCES covase_accounts(id) ON DELETE SET NULL,
  driver_contact_id TEXT REFERENCES covase_contacts(id) ON DELETE SET NULL,
  vehicle_id TEXT REFERENCES covase_vehicles(id) ON DELETE SET NULL,
  hire_id TEXT REFERENCES covase_hires(id) ON DELETE SET NULL,
  account_matched_via TEXT,                 -- 'company' | 'group' | NULL
  vehicle_matched_via TEXT,                 -- 'fleet' | 'hire' | 'both' | NULL

  -- Sync bookkeeping
  raw JSONB,                                -- full source row from the last import
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS covase_claims_repair_status_idx ON covase_claims(repair_status);
CREATE INDEX IF NOT EXISTS covase_claims_incident_type_idx ON covase_claims(incident_type);
CREATE INDEX IF NOT EXISTS covase_claims_account_idx ON covase_claims(client_account_id) WHERE client_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS covase_claims_incident_date_idx ON covase_claims(incident_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS covase_claims_reg_idx ON covase_claims(vehicle_reg);

-- RLS on + permissive app policy (matches covase_config / covase_supplier_replies)
ALTER TABLE covase_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS covase_claims_app_all ON covase_claims;
CREATE POLICY covase_claims_app_all ON covase_claims
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE covase_claims IS
  'Accident-management claims imported (upserted) from FMG DataSummary exports. FMG is the system of record; the platform monitors, matches to local accounts/contacts/vehicles/hires, and raises alerts. No platform-side editing of FMG fields.';

COMMIT;

-- Rollback (manual):
-- DROP TABLE IF EXISTS covase_claims;
