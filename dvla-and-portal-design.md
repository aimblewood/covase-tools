# DVLA licence checks via Orbis + client portal — design (draft, 25 Nov 2026)

Status: **draft for Simon**. Replaces Drivetech for licence checks and the WT Teams starters/leavers sheet. Source: `Orbis DVLA Licence Check: Partner API Specification v0.3` (Alan, 25 Nov 2026). ORBIS here = the connected-car platform (Alan), *not* Covase Tools.

## A. DVLA checks through the Orbis partner API

**API facts (spec v0.3):** base `https://app.orbisio.co.uk`; `POST /api/partner/dvla/licence-checks`, `GET …/{request_uid}`; HMAC-SHA256 signed (`X-Orbis-Partner`, `X-Orbis-Timestamp` unix seconds, `X-Orbis-Signature: sha256=<hex of ts + "." + exact body>`), ±300 s; body ≤64 KB; 30 checks/min. Partner ID `orbis-son`; signing secret server-side only; one Orbis `organisation_id` per client (allow-listed). Result returned in the same call (30 s timeout); retries reuse `request_uid` + identical body (idempotent, charged once). £0.60 per check where DVLA returns a licence; refusals/not-found/errors free. No sandbox — every consented, well-formed request is a real enquiry; A.4 lists free tests. Orbis also files the result on the driver's record in the client's Orbis organisation.

**Where it runs:** a **Supabase Edge Function** `dvla-check` (as the spec recommends). Secrets `ORBIS_PARTNER_ID`, `ORBIS_SIGNING_SECRET`, `ORBIS_BASE_URL` set in Supabase (Simon/Alan enter the secret in the Supabase dashboard — never in chat, repo or browser). The function: verifies the caller (signed-in member, or a valid driver consent token — see C), creates the `covase_licence_checks` row with a fresh `request_uid` **before** calling, signs + POSTs, retries per A.3 (5 s / 30 s / 2 min on 502/503/timeout, 409 in_progress), stores the outcome, ticks the case. A reconcile job (n8n or function cron) GETs any row left without an outcome.

**Table `covase_licence_checks`:** id, request_uid (uuid, unique), case_id, person (driver/nominee), nominee_name, organisation_id, licence_number (**stored masked except last 3**? — decide; needed for annual re-checks, so store full but never log), dob, consent_given, consent_at, consent_method (web_form/in_person/phone/paper), consent_wording_version, consent_reference, http_status, orbis_status / error, check_id, checked_at, unit_price_pence, summary jsonb (licence type/status, can_drive_cars, can_tow, points total, endorsements), name_dob_match (bool + note), decision (pass / refer / fail, from client policy), recharge (pence, for billing), created_at. Members read; writes only via the function (service role). No full `dvla_data` stored unless Simon wants it.

**Decision rules (per client policy, `onboarding_policies`):** licence status must be Valid and Full; category B full (C1 etc. later for heavier vans); points ≥ X → refer, ≥ Y → fail (Simon to set); name + DOB from DVLA must match what the driver gave (spec §6: Orbis doesn't decide this) — mismatch → refer. Result lands on the case's `licence` step: pass → done; refer/fail → flagged for Simon.

**Re-checks:** spec §10 — each check is one request with its own consent. Annual (or per policy) re-check = email the driver a fresh consent link; n8n finds drivers due.

**Billing:** each charged check recorded with cost 60p and recharge (Simon re-bills; was £10 via Drivetech) for invoicing.

## B. Client portal (WT agreed 24 Nov)

- **Client logins:** `covase_profiles.role` gains `client` + `account_id`. `covase_is_member()` changes to admin/user only, so clients get **nothing** from the internal tables. Clients reach data only through SECURITY DEFINER functions scoped to their account: `client_cases()` (safe columns + client-friendly step summary), `client_submit_request(...)`.
- **Page:** `client-portal.html` on the same site, same sign-in code. Two tabs: **Request a driver** (form) and **Your drivers** (status list). Users screen gets "client user" + company picker.
- **Form fields:** type (new starter / opting in / returning / leaver later), driver first/last/preferred name, work email, mobile, home address (PAF lookup), job title, start date, perm/fixed term, car or van, needs a temporary car?, notes. Required: names, email, mobile, start date, type.
- **On submit:** case created in Covase Tools (source `client_form`, lane New, steps built when Simon opens it); confirmation email to the submitter (copy of what they sent) + alert to Simon — via n8n from a DB insert webhook (shared-secret header), Graph send from Simon's mailbox or admin@.
- **Status list shows:** request received → driver details confirmed → licence check (consent pending / passed / needs attention) → driver agreement returned → vehicle arranged (delivery date) → complete. No notes, costs, Claude to-dos, DVLA details beyond pass/needs attention.

## C. Driver consent page (replaces Drivetech's driver registration)

- The Driving for Business email carries a **personal link** (random token on the case, expires e.g. 30 days).
- Page (no login): shows who's asking and why (COVASE LTD runs the check with DVLA, result held by Covase and Orbis — spec §9 wording), asks for licence number + date of birth, explicit consent tick + "I agree" (or "I don't agree", which is recorded and sent as `given:false`), wording version stamped. Optional: add a nominee (name + email) → nominee gets their own link and consents themselves.
- Submit → Edge Function `dvla-consent` validates token → stores consent evidence → runs the check → shows the driver a plain "thanks, done" (never the DVLA detail).

## D. Needed before build

1. Simon: go-ahead; pass/refer/fail points thresholds; who at WT gets portal logins.
2. Alan: signing secret (entered by Simon/Alan in Supabase secrets), WT's Orbis `organisation_id`, service switched on, approved consent wording + version id, first live test licence (e.g. Simon's own) and whether CPC/vans need more categories.
3. Free tests from spec A.4 run first; one agreed live check after.

## E. Build order

1. Tables + Edge Function + "Run DVLA check" on a case (Simon enters licence no./DOB with consent recorded as `in_person`/`phone`) — proves the API end to end.
2. Driver consent page + link in the DfB email (drops Drivetech for new starters).
3. Client portal: client role, status list, request form, confirmation email.
4. Re-check scheduler, billing export, nominee links.
