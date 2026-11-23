# Driver onboarding — design (draft for Simon, 23 Nov 2026)

Status: **approved 23 Nov 2026. Phase 1 built** (SQL applied; js/16-onboarding.js; three n8n workflows built, awaiting publish). Covase Tools only — nothing to do with ORBIS (the connected-car venture with Alan).

## 1. What it is

A case per driver who is starting to drive on company business for a client. One case = one driver joining a client's car scheme, whatever the reason:

| Case type | Example | Starters/leavers sheet wording |
|---|---|---|
| New starter | new employee with a car role | `Starter 9/3/26 Perm` |
| Role change / newly eligible | Bella Williams, Assistant Outreach Advisor SW, from 30/11 | `Opt in on 2/2/2026 Perm` |
| Returning starter | Sarah Massey | `Returning starter 1/12/25 Perm` |

Case fields: client, type, employment basis (**Perm / Fixed term**), job title, start date, driver (first, surname, preferred name, email, mobile — all required except preferred; address optional), vehicle route, vehicle type (**car / LCV**), notes, source email.

Vehicle route — one of:
- **Short hire** → links to a hire booking (`CVB-`).
- **Existing fleet vehicle** → a Dynamics vehicle by reg (swap from another driver).
- **New lease car** → later link to an order (`CVO-`); not in phase 1.
- **None yet** → decided later; blocks the vehicle step only.

## 2. Client onboarding policy

Per client, stored in `covase_config` key `onboarding_policies` (same pattern as `wlc_policies`). Woodland Trust first.

- **Steps** — ordered list, each `{key, label, kind, when}`:
  - `kind`: `auto` (Covase Tools / n8n does it on a click), `browser` (Claude browser skill on Simon's PC picks it up), `manual` (Simon ticks it), `driver` (waiting on the driver).
  - `when`: condition on the case — e.g. `route=short_hire`, `type=new_starter`, `client sheet=yes`.
- **Sender** mailbox for driver emails (default Simon's own; can be set per client).
- **Email templates** (subject + body, placeholders) — Driving for Business; short-hire confirmation.
- **Document packs** — rules picking files by vehicle type and route (see §4).
- **Required returns** — e.g. signed driver agreement, licence check passed (driver + each nominee).
- **Sheet** — whether the client has a starters/leavers sheet and its location.

Policy editor: same feel as the choice-list policy editor.

## 3. Woodland Trust steps (from Simon's order, 20–23 Nov)

1. **Dynamics contact** — search first (existing Contact Lookup webhook, name/email); pick a match or **create**. Create needs a new n8n write workflow (none exists today — all three Dynamics workflows only read). Essentials gate: first name, surname, email, mobile.
2. **Drivetech (fleetriskmanager.com)** — `browser`. No API; XLS reports dropped (no standard report covers nominees). Two browser skills, built in Simon's browser-skill chat, run on a schedule on his PC (Claude app open, logged in):
   - *Add driver* — works the queue of cases at this step; adds the driver (enrolment email + 16-digit key go from Drivetech to the driver); records done/failed against the case.
   - *Check status* — daily; looks up each open case's driver **and nominees**; records not started / submitted / passed / problem. Unclear match, logout or 2FA → stops and flags that case, never guesses.
   - Covase Tools side: a to-do list the skills read and a results table they write to (Supabase). Check Drivetech's terms on automated access before going unattended. A server-side robot with stored credentials is the fallback only.
3. **Driving for Business email** — real send with attachments (Graph, from the policy's sender). Text = Simon's WT wording (preferred name, else first name, in "Dear XXXX"). Rendered, editable, then sent; logged on the case.
4. **Calendar entry** — Simon's own "Woodland Trust" calendar (a secondary calendar in his mailbox; existing Outlook credential can write to it). Format to refine.
5. **Vehicle** —
   - *Short hire*: opens a pre-filled booking (driver, client, start date, address). Short-hire email (Simon's wording) sent **when the booking is confirmed**, delivery date/time/address filled from the booking; the "keep you in this vehicle…" sentence is a choice: until a spare fleet car is free / until their new car is delivered / own wording.
   - *Existing vehicle*: pick by reg (Dynamics Vehicle Lookup); new n8n write workflow changes the driver and **appends** a dated line to the description, keeping what's there (pattern from Simon's screenshot: "Going to Seb Austin mid July. Seb Austin as of 21/7/26"). Same handover also recorded in Covase Tools allocations.
6. **Starters/leavers sheet** (WT only) — `Fleet movements, starters, leavers.xlsx` in WT's SharePoint site `EXT_CovaseWTCompanyVehicles` (WT's tenant; Simon is a guest). Columns: **Who? · Action · When (notes) · Added to list/Covase instructed · Covase Actioned**. Covase Tools drafts the row / "Covase Actioned" text from the case. Writing it: try Graph first (likely blocked — guest of another tenant, our credentials are Covase-tenant); otherwise a browser skill.

**Waiting on the driver:** signed driver agreement (uploaded to the case when it comes back), licence check passed for the driver (from the status skill); nominees shown for oversight only. Case is complete when every applicable step is done and every return is in.

## 4. Woodland Trust document pack

| File | Sent when |
|---|---|
| WT Company Vehicle **Car** Driver Agreement plus Nominee (Aug 2025) | vehicle type = car |
| WT Company Vehicle **LCV** Driver Agreement plus Nominee (Aug 2025) | vehicle type = LCV |
| WT **Car** Insurance Certificate 2026 | car |
| WT **LCV** Insurance Certificate 2026 | LCV |
| How-to guide for nominee driving licence checks | always |
| Essential contacts — Lex contract | route = existing/new Lex vehicle (not short hire) |

Files are uploaded through the policy screen into the private `documents` bucket. **Not committed to the repo** (public Pages repo; insurance certificate). Replace-a-file keeps the old one for history.

## 5. Screens

- **Onboarding board** — lanes: New · In progress · Waiting on driver · Ready · Done. Card: name, client, type, start date (days to go; red when ≤7 days and checks not cleared), step progress dots.
- **Case window** — details, checklist with a button per step, emails sent, documents in/out, notes, history.
- **Intake** — paste an email (phase 1) → Claude reads name, role, start date, urgency, who's cc'd → pre-filled case with gaps flagged. Later: n8n watches a mailbox folder and opens draft cases automatically (same pattern as the reply processors, 15-min budget rules apply).

## 6. Data (SQL to be written and run first)

- `covase_onboarding_cases` (id `onb-…`, ref `CVN-0001` from a sequence, client account, type, basis, job title, start date, driver fields, contact id / dynamics id, vehicle route, vehicle type, hire id, vehicle reg/dynamics id, status, sheet text, notes, timestamps).
- `covase_onboarding_steps` (case id, step key, status, done at/by, result text, error) — also the browser skills' to-do list and result store.
- `covase_onboarding_nominees` (case id, name, licence check status, checked at) — written only by the Drivetech status skill.
- Emails reuse the correspondence pattern; documents reuse `covase_documents` / `covase_document_links` with record type `onboarding`.

## 7. n8n work (never activated by Claude)

- Dynamics **Contact Create/Update** (webhook).
- Dynamics **Vehicle driver swap** (webhook; set driver, append description line).
- **Driver email send** with attachments from Storage (webhook; sender from policy, allowlisted).
- **Calendar event** in Simon's WT calendar (webhook).
- Later: intake mailbox watcher.

## 8. Phases

1. Cases, board, case window, WT policy + document upload, paste-email intake, Dynamics search/create, Driving for Business email with attachments, link to short-hire booking.
2. Short-hire email on booking confirmed; existing-vehicle swap in Dynamics; calendar entry.
3. Drivetech browser skills (built in Simon's browser chat) + the to-do/results plumbing.
4. Starters/leavers sheet; automatic intake.

## 9. Open questions / assumptions

- **Confirmed (Simon, 23 Nov):** a short-hire driver gets both emails — Driving for Business on case open, short-hire email once booked — with the wording tweaked so the two read as a pair (see §10).
- **Starters/leavers sheet:** a mix — sometimes WT add the row, sometimes Simon does. So the sheet is both an intake source (new WT rows → draft case) and an output (Covase rows / "Covase Actioned"). Phase 4.
- Calendar entry format (title, all-day vs timed, what goes in the body).
- **Nominees (Simon, 23 Nov):** the driver adds them on their own Drivetech account; Simon only needs occasional oversight. So the case never asks for them — the status skill reports whatever nominees it finds on the driver's account and their check status, shown read-only on the case. Nominee checks do not block a case from completing.
- Drivetech terms on automated access.

## 10. Email alignment (proposed 23 Nov, awaiting Simon's OK)

Base texts are Simon's (WT Driving for Business; short hire). Changes only:

**Driving for Business** — after the opening paragraph, one paragraph chosen by vehicle route:
- Short hire: "In the meantime I'm arranging a temporary hire car for you from {start date}. I'll email you separately with the delivery details once it's booked."
- Existing fleet vehicle: "You'll be taking over {make model} ({reg}). I'll be in touch to arrange the handover."
- None yet: paragraph left out.
Lex essential contacts attached only on the existing/new Lex vehicle route. Typo: "processed with 48 hours" → "within 48 hours".

**Short hire** — opening becomes "Further to my earlier email about the Woodland Trust car scheme, I can confirm I have booked a short hire for delivery on {day date} from {time} to {address}." The "week or two" sentence is a choice (spare fleet car / new car delivered / own words). New closing reminder before the sign-off: "A reminder that before you drive on company business we need your signed Driver Agreement and your DriveTech licence check (see my earlier email). If you haven't done these yet, please do so as soon as possible." Fix point 6: "with the same fuel level it was delivered with" and close the bracket.
