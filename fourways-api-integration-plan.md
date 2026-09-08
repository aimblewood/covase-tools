# Fourways API Integration — Plan

> **Status.** Discovery. API access confirmed verbally; docs not yet seen. This plan is shaped for that starting point: it front-loads the discovery questions and the prep we can do in parallel, then sketches the build phases for once docs are in hand.
>
> **Owner.** Simon Homer. Drafted 2026-05-18.
>
> **Context.** Fourways is Covase's largest short-hire supplier (`reference` field in `covase_hires` carries their reservation refs, e.g. `FVSL049269`). Today the workflow is: bookings made in the Fourways portal, invoices arrive by email, n8n extracts hire details from the PDF, Covase staff reconcile against manually-entered `covase_hires` rows, then bill clients. Goal of this integration: make the booking system the system of record so we stop doing parallel data entry and reconciliation.

---

## 1. Outcomes (signed off)

All four goals are in scope:

1. **Eliminate manual hire entry** — Fourways bookings flow into `covase_hires` automatically.
2. **Real-time status sync** — supplier-side transitions (delivered, extended, off-hired) drive `hire_status` instead of our date-based auto-advance.
3. **Two-way booking creation** — eventually, raise new hires from `covase-platform.html` and push them to Fourways.
4. **Auto-reconcile supplier invoices** — replace PDF extraction with authoritative invoice data via API.

Phasing in Section 5 sequences these so we can ship value before tackling the hardest one (two-way).

---

## 2. Questions to ask Fourways (discovery)

> **Status (2026-05-18).** Most of this section is now historic. Fourways confirmed they adapt to client systems rather than publishing a fixed API, so the questions to *them* are narrower than originally drafted — see Section 9 of `covase-integration-brief.md`, which is the actual artefact in play. The list below is preserved for reference and in case the same exercise is repeated for a different supplier (Ogilvie, Arval, etc.) that *does* publish a fixed API.

Group the questions so the first meeting is efficient. The starred items are the ones that gate scoping — if any of those are "no", that phase of the plan has to be redesigned.

### 2.1 Authentication & access

- ★ What is the **auth model**? API key, OAuth 2.0 client-credentials, signed JWT, basic auth, mTLS?
- Is API access **scoped per account** (i.e. we only see Covase bookings) or per user?
- Is there a **sandbox / staging environment**? Can we create and delete test bookings there without billing impact?
- ★ **Rate limits** — requests per second / per minute / per day; per endpoint or global; what happens on breach (429, hard cap, throttle)?
- **IP allowlisting** required? If yes, what address do we register for n8n and Supabase?
- **Credential rotation** — recommended cadence and process?

### 2.2 Reading bookings (Phase 1)

- ★ What endpoints / objects are exposed: reservations, vehicles, drivers, accounts, invoices, charges?
- Can we **list all our active reservations** in one call, or only fetch by ID / reservation reference?
- Filtering options: date range, status, driver name, account, vehicle reg?
- Pagination model and stable ordering?
- ★ Full **field list** on a reservation — we need to map against `covase_hires`. Specifically: do you return P11D, CO2, date-of-registration, engine cc, fuel type, full make/model, registration mark, delivery address line/town/postcode, driver mobile, daily rate, supplementary charges?
- Is **registration mark** populated at booking time or only after vehicle allocation? When does it appear?
- Do you expose a **delivery date** distinct from the booking start date? An off-hire date distinct from the contracted end date?
- Cancelled / no-show records — do they remain visible via the API, or disappear?

### 2.3 Webhooks / push (Phase 2)

- ★ Do you offer **webhooks** for status changes? If yes:
  - Which events: created, modified, vehicle-allocated, delivered, extended, off-hired, cancelled, invoiced?
  - Per-event subscription, or all-or-nothing?
  - Delivery guarantees: at-least-once? Retries? Backoff?
  - Payload **signing** (HMAC, JWT) so we can verify origin?
  - Configurable per environment so staging gets its own URL?
- If no webhooks: what's the recommended **polling cadence** and is there a "modified-since" filter to make polling efficient?

### 2.4 Creating bookings (Phase 4)

- ★ Can we **create reservations via API**? If no, that phase is parked.
- If yes:
  - What are the **required fields** to create a reservation?
  - Pricing model: do we send a rate, or do you return a quoted rate?
  - How is **vehicle category vs specific reg** handled? Can we book a CAR3 and have the reg allocated later, mirroring portal behaviour?
  - **Modifications**: can we extend an end date, off-hire, cancel via API?
  - What's the side-effect on your internal workflow? Does an API-created booking land in the same queue your team works, or a separate one?
  - Idempotency keys supported on POST?

### 2.5 Invoices (Phase 3)

- ★ Are invoices retrievable via API, and are they linked back to a **specific reservation ID**?
- Are invoices **one-per-booking** or **batched across many bookings**? (Today, your PDF invoices typically contain multiple hires.)
- Are credits / amendments separate documents with their own IDs, or in-place updates?
- Available formats: JSON line-items? PDF only? Both?
- VAT breakdown and any pass-through charges (RFT, fuel, congestion etc.) — separate line items or rolled in?

### 2.6 Identifiers & data linkage

- ★ Is the human reservation reference (e.g. `FVSL049269`) the **canonical booking ID** in your API, or is there a separate stable internal ID? We need the stable one for `supplier_booking_id`.
- Driver and account IDs — do you have stable identifiers we can store alongside our Dynamics IDs?
- Do you map our Covase-side accounts uniquely on your side, or do you key off company name?

### 2.7 Commercial & operational

- Cost: one-off integration fee, monthly platform fee, or per-call?
- SLA / uptime expectations? Maintenance windows?
- API versioning and deprecation policy?
- Named **technical contact** at Fourways for integration support — escalation path when things break in production?
- Any **data processing agreement** or contract appendix needed before we connect?
- Existing customers using this API — references we could speak to?

---

## 3. Prep work we can do now (parallel with discovery)

These items don't need answers from Fourways and will accelerate Phase 1 once docs land.

### 3.1 Data audit & gap analysis

- Pull a 12-month sample of `covase_hires` where `supplier = 'Fourways'`. For each field, classify:
  - Field they're likely to provide authoritatively → trust their value
  - Field we enrich (e.g. `delivery_address_*` from driver Dynamics record) → keep our enrichment layer
  - Field neither side has → flag for product decision
- Particular attention to vehicle technical data (P11D, CO2, engine cc, fuel type, date-of-registration). Today some of this is hand-entered from DVLA — confirm whether Fourways carries it.

### 3.2 Schema preparation (staging Supabase first)

Land these as new SQL phase files (e.g. `phase-fourways-sync.sql`), apply to staging Supabase only:

- `covase_hires.supplier_booking_id` TEXT — stable Fourways ID (separate from `reference` which is the human ref)
- `covase_hires.supplier_sync_status` TEXT — `'manual' | 'imported' | 'synced' | 'conflict'`, default `'manual'` so existing rows are untouched
- `covase_hires.supplier_synced_at` TIMESTAMPTZ — last successful sync timestamp
- `covase_hires.supplier_payload` JSONB — raw Fourways response for audit and field-mapping iteration
- `covase_hires.delivered_at` DATE — actual delivery date (currently conflated with `start_date`)
- `covase_hires.offhired_at` DATE — actual off-hire date (currently conflated with `end_date`)
- `covase_hires.replaces_hire_id` TEXT FK → `covase_hires.id` — links an allocation to the previous one it replaces under the same Fourways booking. NULL on the first allocation of a booking. Enables per-allocation history when a vehicle is swapped mid-booking. See Section 1.4 of `covase-integration-brief.md`.
- New table `covase_supplier_events` for webhook log: `id`, `supplier`, `event_type`, `payload JSONB`, `received_at`, `processed_at`, `idempotency_key UNIQUE`. Crucial for replay and dedup.

Index `supplier_booking_id` and `idempotency_key`. Add a row-level constraint that `supplier_sync_status='synced'` requires `supplier_booking_id NOT NULL`.

### 3.3 Identifier strategy

Today `reference` (text, e.g. `FVSL049269`) is the only Fourways linkage and it's a free-text field — typos exist in historical data. Plan:

1. After Phase 1, build a one-time backfill script that fuzzy-matches existing `covase_hires.reference` to Fourways bookings, populates `supplier_booking_id`.
2. Audit unmatched rows — these are either typos, supplier mistakes, or non-Fourways hires miscategorised. Triaging this is a one-time data-quality win.
3. After backfill, `reference` becomes a display field; `supplier_booking_id` is the join key.

### 3.4 Architecture decision (provisional)

Default home for the integration: **n8n**. Rationale:

- Already used for the invoice email processor — same operational mental model.
- Outbound API calls and webhook receivers are first-class in n8n.
- Env-var secret storage already in place (`ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` pattern — add `FOURWAYS_*`).
- Avoids CORS gymnastics that would arise from direct browser calls.

Browser-side stays read-only for Fourways data — it consumes the Supabase view, doesn't talk to Fourways directly. This matches the existing pattern in `covase-platform.html`.

### 3.5 Staging UI scaffolding

In `covase-platform-staging.html` (per the dual-file workflow in PROJECT.md), add — but keep dark / disabled by default until Phase 1 ships:

- Small "Fourways sync" status pill on each kanban card (`synced 2m ago` / `manual` / `out of sync`). Reads `supplier_sync_status` + `supplier_synced_at`.
- A settings panel with "last full sync" timestamp and a manual "Sync now" button (calls an n8n webhook).
- A "Show only out-of-sync" filter on the all-hires list — for the data-quality triage step in Section 3.3.

Reserving the UI now means Phase 1 is a wiring exercise, not a design exercise.

### 3.6 Test data & access prep

- Identify 8–10 representative recent Fourways bookings spanning: single-day hire, multi-week, extended mid-hire, off-hired early, cancelled, multi-vehicle account. Note their `reference` values so you can request them as the API test set when sandbox arrives.
- Decide which Covase email gets the API credentials and which n8n environment receives them. Avoid using anyone's personal mailbox.
- Make sure the staging Supabase project is sized for the additional `covase_supplier_events` write volume (estimate: low — maybe a few hundred events/day at most).

### 3.7 Internal preflight

- Tell colleagues using the live platform that a Fourways integration is coming and that staging will have a sync indicator before live does. Set expectations on rollout window.
- Decide whether Phase 1 (read-only sync) requires Fourways to know about it commercially — usually it doesn't, but worth checking against any contract terms.

---

## 4. Risks & open questions

| Risk | Mitigation |
|---|---|
| Fourways bookings still happen in their portal (drivers, account managers ring up). API integration must handle non-Covase-originated bookings without complaint. | Default sync direction is Fourways → us. We never reject a booking we didn't originate. |
| Webhook endpoint must be internet-reachable and authenticated. | n8n cloud already provides this. Verify HMAC signing is available so we don't accept unsigned traffic. |
| Two-way sync introduces conflict risk: a hire edited both sides. | Phase 4 design: Fourways always wins for booking-state fields (`start_date`, `end_date`, `hire_status`, rates); Covase wins for billing/recharge fields (`billing_status`, `upsell_per_day`, `outgoing_invoice_id`). Make this rule explicit in code and surface conflicts in the UI rather than silently overwriting. |
| Rate limits could throttle historical backfill. | Build backfill with rate-aware batching from day one; resumable from `supplier_synced_at`. |
| What if Fourways API drops a webhook? | At-least-once handling + periodic reconciliation poll (e.g. nightly) to catch missed events. |
| BST/UTC date issues (the auto-advance bug we just patched) become moot when status comes from authoritative supplier events. | Phase 2 reduces our reliance on local date math — but the local fallback should stay until we're confident in webhook coverage. |

Open questions to revisit after first conversation:
- Does Fourways differentiate between "vehicle allocated" and "delivered"? We currently conflate them as `start_date` being reached.
- Are credits / refunds modelled as separate invoice documents or negative line items on the original? Affects billing reconciliation logic.
- What happens to bookings that span an API version migration? Versioning policy answer determines our exposure.

---

## 5. Implementation phases

> Each phase ships independently and is fully usable before the next starts. Builds in **staging file first** per the dual-file workflow. Schema migrations apply to staging Supabase first, then promoted only when Phase X is signed off for live.

### Phase 0 — Brief & negotiate spec  *(2–3 weeks)*

**Direction-of-travel update (2026-05-18).** Fourways does not publish a fixed API for clients to consume; they adapt to each client's system. The questionnaire they sent us was their request that *we* describe our integration surface. Phase 0 is therefore writing the brief, not reading their docs.

- Write the integration brief (`covase-integration-brief.md`) covering protocol, auth, data shape, events, error handling, scope.
- Send brief to Jill Williamson at Fourways.
- Iterate on the brief based on their response — items in Section 9 of the brief are the gating questions.
- Agree the v1 protocol in writing (essentially: this brief, marked-up and signed off).
- Stand up the staging webhook endpoint in n8n based on the agreed protocol.
- Round-trip one test reservation through the staging endpoint end-to-end.

**Exit criteria:** Brief signed off by both sides, staging endpoint exists, one test reservation successfully created + status-updated round-trip.

### Phase 1 — One-way read sync  *(3–4 weeks)*

- Apply schema migrations to staging Supabase.
- n8n workflow: scheduled poll OR webhook receiver — upserts into `covase_hires` keyed on `supplier_booking_id`.
- Backfill historical reference → `supplier_booking_id` (one-shot script, run against staging Supabase first; review the unmatched-rows report manually).
- Wire the staging UI sync pills and filter (already scaffolded in Section 3.5).
- Run in parallel with manual entry for 2 weeks: don't disable manual entry yet, but cross-check. Track divergence.

**Exit criteria:** 95%+ of new Fourways hires appear in `covase_hires` within the agreed sync window with no manual entry; unmatched-rows report under an agreed threshold.

**Promote to live:** Once stable in staging, copy `covase-platform-staging.html` → `covase-platform.html` and apply schema migrations to live Supabase.

### Phase 2 — Real-time status & date authority  *(2–3 weeks)*

- Replace the local-date `autoAdvanceBookedToActive` / `autoAdvanceActiveToOffhired` chain with status writes driven by Fourways events. Keep the local fallback as a safety net.
- Populate `delivered_at` and `offhired_at` from supplier — `start_date` / `end_date` become "planned", the new fields become "actual".
- Update the kanban card to show actual vs planned where they diverge.
- Add a "stale sync" alert (e.g. status hasn't updated in 48 hrs on an active hire).

**Exit criteria:** Off-hire date manually entered approximately zero times per week.

### Phase 3 — Invoice auto-reconciliation  *(3–4 weeks)*

- Pull invoice data from Fourways API on receipt of an invoice event.
- Match invoice line items to `covase_hires` by `supplier_booking_id` (replaces the fuzzy-match in the current PDF flow).
- Auto-create `covase_invoices` rows; auto-set `billing_status='invoiced-in'` on matched hires.
- Keep the PDF extraction workflow running for 4 weeks as an audit trail — n8n compares API-derived vs PDF-derived and alerts on divergence.

**Exit criteria:** Divergence rate below threshold for 4 consecutive weeks. Then decommission PDF extraction (or keep as cold backup).

### Phase 4 — Two-way: book via the platform  *(3–4 weeks, dependent on Section 2.4 answers)*

- "New Hire" form gets a "Send to Fourways" path. Sends to Fourways API → captures returned booking ID → writes to `covase_hires` with `supplier_sync_status='synced'`.
- Error handling: Fourways API failure surfaces in the UI with a retry button; falls back to creating a `requested` hire that someone can manually push to Fourways later.
- Modifications (extend, off-hire, cancel) route through API too.
- Conflict surfacing per Section 4 rules.

**Exit criteria:** New Covase-originated hires created via API for two consecutive weeks without manual portal entry.

### Phase 5 — Cleanup & docs  *(1–2 weeks)*

- Update PROJECT.md with the new workflow, mark old PDF extraction as deprecated/backup.
- Decommission unused n8n workflows or keep dormant.
- Retrospective on the integration; document what would be different for Ogilvie if/when they offer an API.

---

## 6. Recommended sequence of next actions

1. **This week.** Use Section 2 to draft the email/meeting agenda for Fourways. Confirm technical contact. Request docs + sandbox.
2. **Parallel, this week.** Start Section 3.1 data audit and Section 3.2 schema-prep SQL drafting (apply to staging Supabase only — do not run anything against live until Phase 1 exit criteria are met).
3. **In 2 weeks.** First Fourways technical call. Bring the Section 2 list to it.
4. **Within 1 month.** Phase 0 exit: field map signed off, sandbox working.
5. **Months 2–3.** Phase 1 in staging, parallel-run with manual entry.
6. **Month 4+.** Promote Phase 1 to live, start Phase 2.

---

## Appendix A — Things to *not* do prematurely

- Don't add `supplier_booking_id` to live Supabase before Phase 1 exit criteria are met. Schema clutter in live causes anxiety even when nothing is using it.
- Don't decommission the PDF invoice processor before Section 5 Phase 3 audit comparison shows clean parity.
- Don't pursue API access from any second supplier (Ogilvie, etc.) until Fourways Phase 2 is live. The pattern will be cleaner to replicate once it's proven once.
- Don't put credentials anywhere outside n8n's secret store. Specifically not in the GitHub repo, not in `covase-platform.html`, not in Supabase row data.
