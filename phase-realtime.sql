-- phase-realtime.sql
-- Adds the platform's tables to Supabase's realtime publication so the app
-- receives live change events over websockets (no polling, no refresh button).
-- Each block is duplicate-safe: re-running is a no-op. No data touched.

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_hires;             EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_movements;         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_claims;            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_fines;             EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_supplier_replies;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_invoices;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_accounts;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_contacts;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_vehicles;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE covase_config;            EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Rollback (manual): ALTER PUBLICATION supabase_realtime DROP TABLE <name>;
