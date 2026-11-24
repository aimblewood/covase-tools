-- phase-dynamics-changes.sql  (Simon, 24 Nov 2026)
-- Guarded Dynamics edits requested by Claude (e.g. Claude in Outlook acting on
-- an email) through the n8n workflows "Covase — Dynamics Find" and
-- "Covase — Dynamics Change".
--   covase_dynamics_changes  every preview + apply: who/what/why, old → new
--   covase_config 'dynamics_edit_rules'  which record types + fields may change
-- n8n writes with the service key. Browser access: signed-in members read the
-- log (no anon access, no browser writes). ADDITIVE ONLY. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS covase_dynamics_changes (
  id            BIGSERIAL PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'proposed'
                CHECK (status IN ('proposed','applied','expired','failed','superseded')),
  entity        TEXT NOT NULL,            -- contact | account | vehicle
  record_id     TEXT NOT NULL,            -- Dynamics GUID
  record_label  TEXT,                     -- e.g. "Jane Smith (Woodland Trust)"
  changes       JSONB NOT NULL,           -- [{field,label,old,new}]
  reason        TEXT,                     -- why, in plain words
  source        TEXT,                     -- e.g. email subject + sender
  requested_by  TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS covase_dynamics_changes_record_idx ON covase_dynamics_changes(entity, record_id);
COMMENT ON TABLE covase_dynamics_changes IS
  'Log of Dynamics edits made through the guarded n8n Change workflow: preview (proposed, token) then apply. Old values re-checked at apply time.';

ALTER TABLE covase_dynamics_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON covase_dynamics_changes FROM anon;
GRANT SELECT ON covase_dynamics_changes TO authenticated;
DROP POLICY IF EXISTS covase_dynamics_changes_read ON covase_dynamics_changes;
CREATE POLICY covase_dynamics_changes_read ON covase_dynamics_changes FOR SELECT TO authenticated
  USING (covase_is_member());

-- Allowed record types and fields (text / number / date fields only for now;
-- the one lookup is the vehicle's driver, set from a contact found first).
INSERT INTO covase_config (key, value, updated_at) VALUES ('dynamics_edit_rules', '{
  "contact": {"set": "contacts", "id": "contactid", "label": "fullname",
    "fields": {
      "firstname": "First name", "lastname": "Surname", "middlename": "Middle name",
      "nickname": "Preferred name", "new_knownas": "Alternative formal first name", "salutation": "Salutation",
      "emailaddress1": "Email", "emailaddress2": "Email 2", "mobilephone": "Mobile",
      "telephone1": "Business phone", "telephone2": "Home phone", "jobtitle": "Job title",
      "xpg_employeecode": "Employee code", "xpg_licencenumber": "Licence number",
      "address1_line1": "Address line 1", "address1_line2": "Address line 2", "address1_line3": "Address line 3",
      "address1_city": "Town", "address1_stateorprovince": "County", "address1_postalcode": "Postcode", "address1_country": "Country"}},
  "account": {"set": "accounts", "id": "accountid", "label": "name",
    "fields": {
      "name": "Company name", "emailaddress1": "Email", "telephone1": "Main phone", "websiteurl": "Website",
      "address1_line1": "Address line 1", "address1_line2": "Address line 2", "address1_line3": "Address line 3",
      "address1_city": "Town", "address1_stateorprovince": "County", "address1_postalcode": "Postcode", "address1_country": "Country",
      "xpg_invoiceaddress1": "Invoice address 1", "xpg_invoiceaddress2": "Invoice address 2", "xpg_invoiceaddress3": "Invoice address 3",
      "xpg_invoiceaddresscity": "Invoice town", "xpg_invoiceaddresscounty": "Invoice county", "xpg_invoiceaddresspostcode": "Invoice postcode",
      "new_xpg_invoiceaddressdepartment": "Invoice department",
      "xpg_registeredaddress1": "Registered address 1", "xpg_registeredaddress2": "Registered address 2", "xpg_registeredaddress3": "Registered address 3",
      "xpg_registeredaddresscity": "Registered town", "xpg_registeredaddresscounty": "Registered county", "xpg_registeredaddresspostcode": "Registered postcode",
      "xpg_registerednumber": "Company number", "xpg_vatnumber": "VAT number"}},
  "vehicle": {"set": "xpg_covasevehicles", "id": "xpg_covasevehicleid", "label": "xpg_regno",
    "fields": {
      "xpg_regno": "Registration", "new_private_plate": "Private plate", "xpg_exteriorcolour": "Colour",
      "xpg_keynumber": "Key number", "xpg_motexpires": "MOT expiry", "xpg_deliverydate": "Delivery date",
      "xpg_dehiredate": "De-hire date", "xpg_annualmileage": "Annual mileage", "new_costcentre": "Cost centre",
      "new_customerponumber": "Customer PO number", "new_description": "Description / notes",
      "xpg_driver": "Driver (contact)"},
    "lookups": {"xpg_driver": {"bind": "xpg_Driver", "set": "contacts"}}}
}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- Rollback: DROP TABLE IF EXISTS covase_dynamics_changes; DELETE FROM covase_config WHERE key='dynamics_edit_rules';
