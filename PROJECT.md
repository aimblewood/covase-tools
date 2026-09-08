# ORBIS Platform — Project Reference

> **Purpose.** This file is the canonical reference for the Covase/ORBIS internal platform. Update it whenever anything material changes (schema, IDs, conventions, brand). It is intentionally short — no narrative, just facts you'd otherwise keep in your head.
>
> **Maintained by.** Simon Homer. Last meaningful change: 2026‑04‑14.

---

## 1. What this project is

> **Ongoing work:** the supplier booking + AI reply-agent build is documented in **`HANDOVER-supplier-agent.md`** (n8n workflow IDs, reply-matching logic, Supabase columns, platform features, outstanding to-dos). Read it first when continuing that work.

**Covase Ltd** is a UK fleet management company. **ORBIS** is the internal SaaS-style platform being built to replace the old spreadsheet-driven short-hire workflow and eventually power Orbis Fleet Intelligence Ltd's customer-facing product.

This repo contains the internal hub — billing, short hires, CRM, fleet — built as **single-file vanilla HTML/JS apps on GitHub Pages**, backed by Supabase for data and n8n for automation.

Two live apps:

| App | File | Purpose |
|---|---|---|
| Hub / platform | `covase-platform.html` | Day-to-day operations: received invoices, short hires (Pipeline Kanban + list views), CRM, fleet. **In use by colleagues — be careful.** |
| Invoice generator | `covase-invoice-generator.html` | Produces client-facing recharge invoices; supports design-tool overrides and Supabase sync |

**Single-file workflow.** New work is written directly to `covase-platform.html` (no separate staging file — the dual-file/red-banner workflow was retired 2026-06-16). Validate the change, then push to the GitHub Pages repo (`aimblewood/covase-tools`) to deploy. If a deploy breaks something, roll back to a previous stable commit in GitHub history. `covase-platform.old.html` is also kept locally as an extra rollback snapshot.

**Shared-backend caveat.** There is a single Supabase project behind the app, so any data writes (new hires, edits, deletes) are immediately live for colleagues. UI/feature changes are safe to iterate on; data experiments are not. For destructive testing, set up a separate Supabase project (not yet done).

---

## 2. Infrastructure & IDs

| Thing | Value |
|---|---|
| GitHub repo (tools) | `aimblewood/covase-tools` |
| GitHub Pages URL | `https://aimblewood.github.io/covase-tools/` |
| GitHub repo (forecast) | `aimblewood/covase-forecast` |
| Supabase project | `nlvlyfdsvgrdlcqksafb` |
| n8n instance | `covase.app.n8n.cloud` |
| n8n invoice processor workflow ID | `jNIfWg0exNqR5UFd` (`Covase — Invoice Email Processor`) |
| M365 tenant | Covase tenant (Orbis shares via shared mailboxes) |
| Outlook folder ID ("Invoices to process") | `AAMkAGYxYmM2MWNmLTUwMjgtNDA1NC04MWFhLTIwMDBhOGU0YjA2ZgAuAAAAAAAkfT7Vg_CfSqG15181IskMAQALmTFt0zIzTZpaxLUPQVWbAAfcCvH9AAA=` |

Environment variables set in n8n:

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

---

## 3. Core data model (Supabase)

### `covase_hires`

Short-hire records. ID format `hire-<timestamp>`.

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `customer` | TEXT | Denormalised client name |
| `client_account_id` | TEXT FK → `covase_accounts.id` | Source of truth for client |
| `driver` | TEXT | |
| `reference` | TEXT | Supplier booking ref (Fourways reservation / Ogilvie agreement) |
| `agreement_ref` | TEXT | |
| `hire_status` | TEXT NOT NULL | `requested` \| `booked` \| `active` \| `offhired` \| `cancelled` |
| `billing_status` | TEXT NOT NULL | `pending` \| `invoiced-in` \| `recharged` \| `paid` |
| `vehicle_reg`, `make_model`, `category`, `fuel_type` | TEXT | `vehicle_reg` is whitespace-stripped + uppercased on save |
| `p11d_value` | NUMERIC | Manufacturer P11d (£) |
| `co2_emissions` | INTEGER | g/km |
| `engine_cc` | INTEGER | 0/NULL for full-electric |
| `date_of_registration` | DATE | DVLA first registration date |
| `driver_mobile` | TEXT | Snapshot of driver mobile at booking time, sourced from Dynamics contact. Stored as-entered |
| `delivery_address_line1` | TEXT | Snapshotted from driver Dynamics contact at booking |
| `delivery_address_line2` | TEXT | (optional) |
| `delivery_town` | TEXT | |
| `delivery_postcode` | TEXT | UK postcode, stored as-entered |
| `supplier` | TEXT | `Fourways` \| `Ogilvie` \| `Arval` \| `Lex` \| `Ford rental` \| `FMG` \| `Enterprise` \| `Other` |
| `supplier_ref` | TEXT | Usually invoice number |
| `start_date`, `end_date` | DATE | |
| `preferred_start_time` | TIME | Hour-granular delivery slot 08:00–18:00. NULL = "any time" |
| `cost_per_day` | NUMERIC | Supplier's daily rate |
| `upsell_per_day` | NUMERIC | Covase markup. Client rate = `cost_per_day + upsell_per_day + COALESCE(rft_per_day, 0)` |
| `rft_per_day` | NUMERIC | Daily RFT, **passthrough** (added to both supplier cost and client sell, profit-neutral). NULL when hire doesn't attract it |
| `vat_status` | TEXT | **Deprecated for hires** (always `'full'`); supplementaries still use `full`/`outside_of_scope` |
| `agreement_ref` | TEXT | **Hidden in UI**, kept in schema for future use |
| `supplementaries` | JSONB | `[{type, cost_amount, upsell_amount, vat_status, notes}]` |
| `incoming_invoice_id` | TEXT FK | The supplier bill that covered this hire |
| `outgoing_invoice_id` | TEXT FK | The client recharge invoice |
| `notes` | TEXT | |
| `created_at`, `updated_at` | TIMESTAMP | |

**Supplementary types**: `Fuel` · `Fine` · `Admin fee for fine/penalty` · `Admin fee for damage` · `One way charge` · `Comp for Damage` · `Delivery` · `Collection` · `Delivery/Collection` · `Other`.

### `covase_invoices`

Both incoming (supplier) and outgoing (client) invoices in one table, disambiguated by `category`/`status` flow.

Short-hire-specific fields: `is_short_hire` BOOLEAN, `extracted_hires` JSONB (staged extraction before match/commit), `customer_po` TEXT, `sub_category` TEXT.

### `covase_accounts`, `covase_contacts`, `covase_vehicles`, `covase_assignments`

CRM + long-term lease fleet. IDs all TEXT with prefixes `acc-`, `ct-` (contacts), `veh-`. Seeded data uses `acc-s###` / `ct-s###` / `hire-s###`.

### Views

- `v_client_fleet` — combined leases + short hires for client-facing views. `rate` = cost + upsell for hires. Excludes cancelled.
- `v_active_fleet` — lease-only active vehicles.
- `v_current_assignments` — current driver-to-vehicle mappings.

All views use `security_invoker = on`.

---

## 4. Short-hire workflow end-to-end

1. **Booking**. Hire entered into platform with `cost_per_day` (from supplier) and `upsell_per_day` (your markup). Lands as `booked` / `pending`.
2. **Vehicle out**. User clicks `→ On hire` on the Pipeline card. → `active` / `pending`.
3. **Supplier invoice arrives**. Dropped into "Invoices to process" Outlook folder. n8n's Microsoft Outlook trigger fires when a new unread mail with attachments lands in that folder, extracts via Claude API, lands rows in `covase_invoices` with `is_short_hire=true` and `extracted_hires[]`.
4. **Match / reconcile**. In the Received Invoices view, each extracted hire tries to auto-match against an existing booking by `reference`. Three paths:
   - **Matched**: side-by-side Booked vs Invoiced compare. Approve → overwrites booking dates/cost/supps with invoice values, preserves upsell_per_day, sets `billing_status='invoiced-in'`, links `incoming_invoice_id`.
   - **Pick existing**: dropdown of unlinked hires for manual match.
   - **Create new**: ad-hoc hire creation with auto-populated customer account (from PO or prior booking) and upsell input. Lands as `offhired` / `invoiced-in`.
5. **Off-hire**. User clicks `→ Off-hire` when vehicle returns. Auto-sets `end_date` to today if missing.
6. **Recharge**. `↑ Recharge` builds rich line items (one per hire in Woodland Trust format + one per supplementary) and opens the generator. Flips `billing_status='recharged'` on clicked hires.
7. **Paid**. Outgoing invoice marked paid in Outgoing view → cascades `billing_status='paid'` to all linked hires via `outgoing_invoice_id`.

---

## 5. Brand & UI conventions

**Covase brand** (the hub): teal `#03D3C6` primary on indigo/dark sidebar.

**Orbis brand** (new products, docs, Orbis IO Ltd): indigo `#242254`, teal `#03D3C6`.

**Fonts**:

- **Outfit** — headings, structural, brand (600/700)
- **DM Sans** — UI, data, body (400/500/600); also the standard ORBIS document font
- **DM Mono** — config/field values only (API keys, IDs, code)

**ID prefixes**:

- Hires: `hire-<timestamp>`
- Invoices: `inv-<timestamp>`
- Accounts: `acc-<timestamp>`
- Contacts: `con-<timestamp>`
- Vehicles: `veh-<timestamp>` (or legacy formats)

---

## 6. SQL migrations applied (in order)

All committed to outputs, run manually in Supabase SQL Editor.

1. `phase1-shorthire-schema.sql` — added `vat_status` + `supplementaries` JSONB
2. `phase-extract-hires-schema.sql` — added `is_short_hire` + `extracted_hires` to invoices
3. `phase-hire-status-split.sql` — split single `status` into `lifecycle_status` + `billing_status`
4. `phase-sell-to-upsell.sql` — dropped `sell_per_day`, added `upsell_per_day`; supps now `cost_amount` + `upsell_amount`
5. `phase-rename-to-hire-status.sql` — renamed `lifecycle_status` → `hire_status`
6. `seed-pipeline-test-data.sql` — 16 test hires for Kanban (`DELETE FROM covase_hires WHERE id LIKE 'test-%';`)
7. `phase-dynamics-linking.sql` — added `dynamics_id` on `covase_contacts`; added `driver_contact_id` FK on `covase_hires` → `covase_contacts`; indexes on `dynamics_id` for accounts + contacts
8. `phase-vehicle-details.sql` — added `p11d_value`, `co2_emissions`, `engine_cc`, `date_of_registration` to `covase_hires`. Bundled (idempotent) into `wipe-and-reseed.sql`.
9. `wipe-and-reseed.sql` — wiped accounts/contacts/hires + reseeded from `_COVASE DAILY RENTALS29426.xlsx` (2025+ only, 88 hires, 73 contacts, 6 accounts). All regs whitespace-stripped, `vat_status='full'` baked in.
10. `phase-delivery-address.sql` — added `delivery_address_line1`, `delivery_address_line2`, `delivery_town`, `delivery_postcode` to `covase_hires`. Pulled from Dynamics driver contact at booking time.
11. `phase-driver-mobile.sql` — added `driver_mobile` to `covase_hires`. Snapshotted from Dynamics contact at booking time.
12. `phase-start-time-rft.sql` — added `preferred_start_time` (TIME, 08:00–18:00 UI) and `rft_per_day` (NUMERIC, passthrough surcharge — profit-neutral) to `covase_hires`.

---

## 7. Working preferences (for Claude)

- **Tone**: direct, warm-direct, opinionated push-back when facts warrant. Casual British register.
- **Preamble**: minimal. No corporate fluff. No "I'd be happy to...".
- **File edits**: `str_replace` incremental over rewrites. HTML validity check after big edits.
- **Ship files** via `present_files` to `/mnt/user-data/outputs/` so Simon can download directly.
- **SQL + code**: when making schema changes, ship the SQL first and pause for it to be run before updating the platform code. Never assume a migration was successful — Simon will confirm.
- **Legacy data**: dropping columns is fine when agreed. Don't over-preserve.
- **Questions**: use the `ask_user_input_v0` tool when there are real forks. Don't batch more than 3 questions at once.
- **Tool usage**: MCP-connected n8n and Supabase tools are available — prefer these over asking Simon to paste things.
- **Never**: auto-accept destructive actions (`DROP`, `DELETE FROM table` without WHERE, permission changes) without explicit confirmation.

---

## 8. Email style (Simon's voice — for drafts)

```
Hello [Name] – hope you're well.

[Body. Very short paragraphs. Rarely more than 2 sentences each.]

[Direct question or ask. No hedging.]

Thanks

Simon
```

Register: warm-direct, opinionated when facts warrant. Casual British: _faff_, _just a mo_, _ping over_, _keep you posted_. Dropped apostrophes OK (_Its due_). `!` used freely, `!!!` for emphasis, `😊` with close contacts only. En-dash after name in opener. Sign-off on own line, blank line, then name. No corporate fluff.

Full guide in `simon-email-style.md` (Claude memory).

---

## 9. Current roadmap / open threads

**Short hires — immediate**

- [ ] Bed in Pipeline Kanban with real hires. Feedback → refinement.
- [ ] Once blessed, delete legacy Active / All / Pending recharge views.
- [ ] Outgoing invoice "Mark Paid" button currently writes status `approved` (legacy). Clean up to proper `paid` status.
- [ ] Multi-select consolidation in Pending Recharge — bill several hires on one outgoing invoice.
- [ ] Woodland Trust `.xlsx` supplementary sheet export per their template.

**Other rebill flows**

- [ ] Licence check rebill
- [ ] Logistics movement rebill

**Integrations / infra**

- [ ] Sage push (accounting integration)
- [ ] GoCardless (direct debit collection)
- [ ] Bank reconciliation against outgoing invoices
- [ ] Monzo / Nationwide Business feed

**Longer term**

- [ ] Customer-facing ORBIS product (OEM API live data via High Mobility)
- [ ] eVED lessor data service (commercial opportunity at £1–1.50/vehicle/month)
- [ ] OVO Energy salary sacrifice partnership exploration

---

## 10. What NOT to touch without explicit instruction

- Active n8n production workflows (`jNIfWg0exNqR5UFd` and others in `covase.app.n8n.cloud`). Edits fine but test before activating.
- Live GitHub Pages HTML — always work on a copy, present the file, let Simon push.
- Supabase RLS policies or security settings — can discuss, don't change silently.
- M365 DNS, Exchange Online settings, shared mailbox permissions.
- Covase client data (accounts, contacts, real vehicle records) — test data only unless Simon explicitly asks.

---

## 11. n8n execution budget rules (HARD RULES)

**Context.** n8n Cloud has a monthly execution cap. The whole instance was throttled in early April 2026 because the Invoice Email Processor was scheduled every minute (~43,200 executions/month, no early exit). All Dynamics lookups went down with it. Never again.

**Hard rules for any new or edited workflow:**

1. **Default to event-driven triggers, never schedule-based polling.** Use `microsoftOutlookTrigger`, `supabaseTrigger`, `webhook`, `formTrigger`, etc. — these only count an execution when something actually happened. Schedule triggers fire whether or not there's work to do, and burn the budget for nothing.

2. **If a Schedule trigger is genuinely the only option**, the execution count for the chosen interval MUST be calculated and shown to Simon **before** activating, with the maths visible:

   | Interval | Executions/month |
   |---|---|
   | every 1 min | ~43,200 |
   | every 5 min | ~8,640 |
   | every 15 min | ~2,880 |
   | hourly | ~720 |
   | daily | ~30 |

   Default to daily unless there's a strong, documented reason to go faster.

3. **Webhook triggers from Supabase or Dynamics**: count too, and can blow up if the source table churns. For any Supabase webhook, name the trigger event (INSERT only? UPDATE on which columns?) and estimate the firing rate. INSERT-only on `covase_hires` is safe (low volume); UPDATE on every column is not.

4. **Never silently activate a workflow.** Activating is on Simon, not Claude. Claude builds, validates, leaves inactive. Simon reviews + activates. (Editing an already-active workflow is fine if it doesn't change the trigger schema.)

5. **Audit the trigger when touching any workflow.** If editing an existing workflow that has a Schedule trigger, flag it and propose the event-driven equivalent before doing the edit.

6. **No "for now we'll poll every minute and fix later" shortcuts.** That's exactly how the original incident happened. If we genuinely need fast reaction time and there's no event trigger, design a hybrid (e.g. webhook for the live path + daily reconcile job).

If a workflow is proposed that doesn't satisfy these, it doesn't ship. Period.

---

## 12. Starting a new Claude session

Drop this file in (as project knowledge in a Claude Project, or attached/pasted at the start of a chat), plus:

1. Current live `covase-platform.html` from GitHub Pages
2. Current live `covase-invoice-generator.html` from GitHub Pages
3. A one-liner on what you want to work on

That's it.
