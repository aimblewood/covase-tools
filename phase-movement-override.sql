-- phase-movement-override.sql
-- Adds a spec-price override to movements: when set, it replaces the
-- calculated base + markup (ex VAT). Supplementaries and VAT still apply.
-- base_charge/markup_flat keep storing the CALCULATED values for reference.
-- Safe to re-run; no data touched.

ALTER TABLE covase_movements ADD COLUMN IF NOT EXISTS price_override NUMERIC(10,2);

COMMENT ON COLUMN covase_movements.price_override IS
  'Manual BASE price ex VAT. When present it replaces base_charge (the mileage calculation) only; markup_flat, supplementaries and VAT still apply on top. NULL = standard calculation.';

-- Rollback (manual):
-- ALTER TABLE covase_movements DROP COLUMN IF EXISTS price_override;
