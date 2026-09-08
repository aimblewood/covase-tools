# Orbis — Supplier Booking + Reply Agent — Handover / State

_Living handover so any new session can pick up the ongoing work. Last updated 2026-08-03._

## How we work on this project
- **Single-file app**: all platform work is in `covase-platform.html` (vanilla HTML/JS, Supabase via anon key, deployed on GitHub Pages repo `aimblewood/covase-tools`). **No staging file** — edit `covase-platform.html` directly, present it, Simon pushes to GitHub. Roll back via GitHub history or `covase-platform.old.html`.
- **SQL**: each change is a `phase-*.sql` file applied in the Supabase SQL editor. Supabase project id `nlvlyfdsvgrdlcqksafb`. Tables use the ANON key as the app key; new tables need RLS **enabled + a permissive `anon,authenticated` policy** (Simon dislikes the "no RLS" admin warning). Confirm before destructive SQL.
- **n8n**: build/edit via the **write-enabled** n8n MCP connector. **Always `publish_workflow` after `update_workflow`** — edits are drafts and don't go live until published. Instance `covase.app.n8n.cloud`, personal project. Claude model for API calls = **`claude-sonnet-5`** (`claude-sonnet-4-20250514` is retired → 404). n8n vars: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- **Dates**: DB stores ISO `YYYY-MM-DD`; UI/emails show **DD/MM/YYYY** (`fmtUK()` helper).

## n8n workflows (all active unless noted)
- **Covase — Supplier Booking Request** `ROL6XCxrSsYVCxST` — webhook `covase-supplier-booking-request`; Code builds email from the platform-rendered template → HTTP `POST graph.microsoft.com/v1.0/users/rentals@covase.co.uk/sendMail` → responds. Sends from the **Covase Rentals shared mailbox**.
- **Covase — Supplier Reply Processor** `8RJ2yETuLYpjQb7V` — triggers: Schedule `*/15 8-17 * * 1-5` (Europe/London) **and** a manual webhook `covase-supplier-reply-check`. Flow: Get Agent Instructions (covase_config) → Get Unread Replies (Graph, rentals@ inbox) → Extract (build Claude prompt from subject+body) → Claude → Parse (classify + match + status) → Save (covase_supplier_replies) → Mark Read → If acknowledgement → Send Acknowledgement (Graph reply) → Log Acknowledgement (outbound row).
- **Covase — Supplier Manual Reply** `ngK3lfZ15uXm2aBG` — webhook `covase-supplier-manual-reply`; sends a human-written reply threaded from rentals@ and logs an outbound row.
- Existing: Dynamics Contact Lookup `7vpaeLVDHJaXFis6`, Dynamics Client Lookup `0vq5VHfptSdqpitL`, Invoice Email Processor `jNIfWg0exNqR5UFd` (**still on the retired model — parked**, will fail until fixed).
- **Dynamics Vehicle Lookup `4z2dmyKXulMWeLL4`** (built 2026-08-17) — webhook `covase-vehicle-lookup` (matches the platform's default Settings URL). Queries `xpg_covasevehicles` (`contains(xpg_regno,q) or contains(xpg_name,q)`); returns `{reg,makeModel,name,model,derivative,vehicleId,accountId,driverId,p11d,co2,engineCc,dateOfRegistration,chassis}`. Dynamics entity facts: logical name `xpg_covasevehicle`, set `xpg_covasevehicles`, id `xpg_covasevehicleid`, reg `xpg_regno`, driver lookup `_xpg_driver_value`, account `_xpg_account_value`. **Dynamics OAuth credential = `UJJCexfFbCVEDskT` ("Unnamed credential") — the "365 credential" (`kyMHkwTl7hZdAB2v`) FAILS auth.** Claims import now has a Dynamics fallback pass: unmatched account/driver/vehicle → lookup webhooks → creates local rows (dedupe by dynamics_id, capped 15 unique lookups/type/import) → links claim (`*_matched_via='dynamics'`).
- **Outlook credential** id `b7m5qszXbptDsLfk` ("Microsoft Outlook account") = Simon's account; has Full Access + Send As on `rentals@covase.co.uk` (a **shared mailbox**, no own login — that's why sends use `/users/rentals.../sendMail`, not `/me`).

## Reply matching logic (Parse node)
1. If subject contains `[CVB:<hireId>]` (baked into our outgoing subject) → use it. Reliable path for replies to our own emails.
2. Else (fresh supplier email, e.g. Fourways starting a new thread): Claude extracts `reservationNumber` (FVSL…), `driverName`, `isBookingRelated`, etc. Parse fetches open hires (`this.helpers.httpRequest` to Supabase) and matches:
   - by **full** reservation number contained in the hire's **Booking reference** (`reference`), must be **unique**; else
   - by **exact** normalised driver-name equality, must be unique.
   - No confident match → status `unmatched`; non-booking mail → `dismissed`.
   Matching is intentionally strict (prefer Unmatched over a wrong match — a wrong match caused an Andreas Stihl/FVSL050339 mismatch earlier from loose prefix matching, since fixed).

## Supabase schema added
- `covase_movements` (phase-movements.sql): + `pickup_county`,`dropoff_county`,`driver_name`,`driver_dynamics_id`.
- `covase_hires`: + `tariff` (phase-hire-tariff.sql), + `supplier_email_sent_at` (phase-supplier-booking-email.sql).
- `covase_accounts`: + `booking_email` (phase-supplier-booking-email.sql; supplier accounts only).
- `covase_config` (phase-config.sql): key/value JSONB. Keys: `supplier_booking_template` = `{subject, bodyHtml}`, `supplier_agent_instructions` = string.
- `covase_supplier_replies` (phase-supplier-replies.sql): inbound + outbound correspondence + parsed fields; columns incl `hire_id, message_id (unique), direction, outcome, reservation_number, vehicle_reg, vehicle_makemodel, p11d_value, fuel_type, co2_emissions, engine_cc, date_of_registration, agreed_start/end_date, price, questions, acknowledgement_reply, summary, confidence, raw_body, status`. Status values: needs_review | applied | dismissed | resourced | auto_acknowledged | sent | unmatched.

## Platform features built (covase-platform.html)
- **Movements** module (quotes: £80 first 100mi + 80p/mi, VAT, fuel reconciliation, supplementaries; OpenRouteService mileage via postcodes; Dynamics **vehicle** lookup — the `covase-vehicle-lookup` n8n webhook does **not exist yet**, so reg lookup is manual until built; driver + reg Dynamics typeahead).
- **Send to supplier** (hire modal): renders booking template, POSTs to booking webhook with subject carrying `[CVB:<hireId>]`, sets hire → `requested`, logs outbound row.
- **Booking email template editor** (Settings → ✉) — WYSIWYG, merge fields, stored in covase_config, shared.
- **Reply-agent instructions editor** (Settings → 🤖) — stored in covase_config; injected into the classifier prompt and used for the acknowledgement tone.
- **Supplier replies review queue** (sidebar): shows `needs_review` + `unmatched`. Actions: Apply (confirmation → writes vehicle pack + reservation number into **Booking reference** + sets Booked), Keep-Requested/re-source (decline), Reply, View thread, Open hire, Dismiss, Link/Re-link (dropdown of all non-cancelled hires), **⚡ Check replies now**.
- **Correspondence thread** modal (collapsible; trimmed quoted history).
- **Manual reply** modal (sends from rentals@, threaded, logged).
- **Auto-advance hire statuses** on load: booked→active (start date), active→offhired (day AFTER end date); timezone-safe date-string compare; blank end_date = ongoing.
- Dynamics **driver match now saves to `covase_contacts`** (order-proof: creates on hire/movement save if no account at match time).
- Sidebar "Active hires" renamed to **"Bookings"**.
- Settings webhooks (defaults set): client/contact/vehicle lookup, supplier booking, manual reply, reply check-now.

## Accident management module (FMG claims) — added 2026-08-17
- **Purpose**: monitor FMG (accident-management partner) claims with full visibility; FMG is system of record, platform never edits FMG fields. Import = upsert of FMG "DataSummary" xlsx export (62 cols) by `claim_reference`.
- **SQL**: `phase-accident-claims.sql` → `covase_claims` (typed cols + `raw` JSONB + FK links `client_account_id/driver_contact_id/vehicle_id/hire_id` — Dynamics reached only through those tables, so detachment-safe). RLS + permissive policy.
- **UI**: sidebar "Accident management → Claims"; kanban with **claim-type dropdown** (Vehicle damage: Reported→Booked in→Off road→Completed→Closed; Glass only: Reported→Booked→Completed; Reference: ULR open→Closed — stages derived, since glass/reference rows have no Repair Status); click card → full-field detail modal (all FMG fields, grouped, + match chips); Dashboard view (escalations, category/client/monthly bars, fault split, avg days-to-report/VOR, late reporters). Import button parses xlsx client-side (SheetJS lazy-loaded from cdnjs).
- **Matching on import**: account by Company then Group vs covase_accounts.company_name; driver by exact full-name (ambiguous → no match); vehicle by normalised reg vs covase_vehicles.reg, else most recent non-cancelled covase_hires.vehicle_reg (`vehicle_matched_via`: fleet/hire/both).
- **Alerts** (`CLAIM_ALERT_CFG` in JS: notBookedIn 7d, VOR 14d, ULR 45d, late report 3d): slow-progress, overdue completion, stale ULR, late reporting (info-only). Escalations = all but late-report; shown as card chips + dashboard panel.
- **Nightly automation**: NOT yet automated. Simon asking FMG for a scheduled email of the export → then build n8n ingestion (reuse import mapping). Destination mailbox TBD — NOT rentals@ (that's rentals only); will be Simon's own inbox, admin@, or a new dedicated inbox (e.g. claims@). n8n needs the Outlook credential to have access to whichever mailbox is chosen (shared-mailbox pattern same as rentals@). Claude cannot log into the FMG portal (credential handling prohibited + needs live browser).

## Fines & Penalties module — added 2026-08-19
- **Purpose**: full register per `F&P Module spec.docx` + WT SO6 procedure (in uploads). Flow: Lex F&P email → driver notification (auto-pay template) or address-request (speeding) → nomination (manual portal submission by Simon, module makes the pack) → COIN reconciliation → WT Teams sheet export → charged/appeals.
- **SQL**: `phase-fines-penalties.sql` → `covase_fines` (status workflow new→driver_notified→address_requested→nominated→on_coin→to_be_charged→charged | query | appeal_upheld→refunded; local FKs; RLS).
- **UI**: sidebar "Fines & penalties" (item key `fines`); Register / configurable Dashboard (widgets in covase_config `fines_dashboard`) / Reports (XLSX + printable PDF). Fine detail modal w/ driver-email preview (templates in covase_config `fines_templates`, defaults = spec wording, CC Jon Oliver + Mark Bevington), mailto send + Mark-as-sent, nomination pack.
- **COIN import**: parses Lex xlsx client-side; filters `DOC_TYPE_DESC~Motoring Offences`; `fineParseText()` extracts issuer/location/datetime/driver/ref/charge/fee from INVOICE_TEXT; pairs fine+fee lines by reg+ref; merges into register (fills, never overwrites; manual links survive). Prompts for invoice date + charge month.
- **WT sheet export**: exact WT column format (Status='To be charged <Mon YY>'/'Parked - SH to query', grouped by COIN with blank rows), marks exported_at.
- **NOT automated (hard limits)**: Lex portal download (credentials) and issuer-portal nomination — Simon does those; module produces the nomination pack.
- **Intake workflow BUILT, NOT PUBLISHED**: `Covase — Fines Intake (Lex)` id `1ps9NEpoymWE33XP`. admin@covase.co.uk is an ALIAS landing in Simon's mailbox — Simon sets an Outlook rule filing Lex F&P emails into a folder named **exactly "Lex Fines"** in HIS mailbox; workflow polls hourly (Mon-Fri 8-18) for unread there → Claude (claude-sonnet-5) reads the PDF attachment (document block) → dedupe via deterministic id `fp-m-<messageId>` + Prefer ignore-duplicates → enrich (vehicle-lookup webhook → driver/client via dynamics_id; hires fallback by reg) → insert covase_fines status 'new' → marks mail read. PUBLISH ONLY after Simon confirms the folder+rule exist (else hourly no-ops are harmless but pointless). Folder-not-found = clean no-op (Pick Folder returns []).
- **Next steps agreed/pending**: direct Graph write to the WT Teams sheet (Excel credential `NOhaxGlt7URuTtcI` exists — need SharePoint file location from Simon); appeal-refund tracker nudge; Enterprise daily-rental fines out of remit for now.

## Outstanding / to-do
- **Apply remaining SQL** to Supabase and **push `covase-platform.html` to GitHub** (Simon does pushes).
- Add real **booking emails** to supplier accounts (CRM → Accounts).
- **Build `covase-vehicle-lookup`** n8n workflow (needs the Dynamics **vehicle entity + field logical names**; unknown — ask Simon or read a sample record).
- **Fix Invoice Email Processor** model (parked by Simon).
- Optional: agent **auto-chases missing vehicle details** on a confirmation (the saved agent instructions ask for this; not built — new autonomous email path, confirm wording first).
- Re-link the **Andreas Stihl/FVSL050339** reply record to Amber Moyce's (active) hire via the queue Re-link button.

## Key contacts / facts
- Covase Rentals mailbox: `rentals@covase.co.uk` (shared). Suppliers: Fourways (refs start `FVSL`), Ogilvie, Arval, Lex, Ford rental, FMG, Enterprise.
- Vehicle technical data is supplier-provided per booking (no Covase-side DVLA enrichment).
