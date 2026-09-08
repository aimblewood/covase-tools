# Covase ↔ Fourways Integration — Brief

> **From.** Simon Homer, Covase Ltd
>
> **To.** Jill Williamson, Fourways
>
> **Date.** 2026-05-18
>
> **Status.** Draft v0.1 — for Fourways review.

## 0. Preamble

Thanks for the questionnaire, for the call, and for sharing the example enquiry from another client — useful context. This document is our half of the spec, structured around your seven sections so it sits alongside the questionnaire. Everything in here is a preferred starting position rather than a fixed requirement: alternatives welcome on any of the technical choices, and the items only Fourways can fill in are listed in Section 10. If a full API integration has a longer lead time on your side than we'd hoped, Section 1.3 outlines a structured-file fallback that could serve as an interim.

### About the Covase platform

Covase has built an internal operations platform — call it ORBIS — that handles short-hire booking, billing, recharging, fleet and CRM. The stack is:

- **Application:** single-file vanilla HTML/JS apps hosted on GitHub Pages.
- **Data:** Supabase (PostgreSQL with PostgREST). Hires live in a `covase_hires` table.
- **Automation / integration layer:** n8n (Cloud) — this is where webhook endpoints, scheduled jobs, and outbound API calls live. Existing integrations include an invoice email processor.
- **No traditional development team.** Simon Homer is the technical lead and primary contact.

The platform handles bookings end-to-end today (we're the system of record). The reason for this integration is to make the booking flow into Fourways automatic instead of email-driven, and to keep Covase's hire records in sync with Fourways' authoritative status data.

## 1. Scope of Phase 1

### 1.1 What's in and out

To confirm what we agreed verbally:

**In Phase 1, the integration covers reservations only — both directions.**

That means:

- Covase creates a new reservation → it's pushed to Fourways via API.
- Fourways confirms / allocates a vehicle / delivers / extends / off-hires / cancels → an event is pushed to Covase.
- Both sides keep their own records in sync as the lifecycle progresses.

**Explicitly out of scope for Phase 1, to follow in later phases:**

- Extensions and amendments to existing bookings (Phase 2, weeks after Phase 1 stable).
- Off-hire automation as a separate negotiated flow (Phase 2).
- Supplier invoices and credits (Phase 3).
- Damage and penalty charges (Phase 3 or 4).

Phasing this way means we can ship value early and not block on the more complex pieces.

### 1.2 Minimum viable Phase 1

For Phase 1 to be worth deploying, the integration needs to deliver at least the following. Anything beyond these is preferred but not blocking.

**Fourways → Covase (mandatory):**

- Fourways reservation ID and human reference, once assigned.
- Current reservation status (one of: confirmed, vehicle-allocated, delivered, off-hired, cancelled).
- Start date and end date (or null for ongoing) as Fourways has them.
- **Vehicle data, as soon as a specific vehicle is allocated:** registration, make / model, fuel type, CO2 (g/km), P11D value (£), engine cc, date of first registration. Covase needs all of these on every booking — they drive downstream billing and reporting and we don't have a separate enrichment source.

**Covase → Fourways (mandatory we'll send):**

- Customer name + Covase account identifier.
- Driver name + mobile.
- Delivery address (line 1, town, postcode minimum).
- Vehicle category (e.g. CAR3) when specific reg isn't known at booking.
- Start date.

**Preferred but not blocking on Phase 1:**

- Cost per day and supplementary charges. Useful for reconciliation but can come through the Phase 3 invoice flow instead.
- `delivered_at` and `offhired_at` as timestamps rather than dates. Date-granularity is fine for Phase 1.

If any of the mandatory items are problematic on Fourways' side, please flag now — we'd rather know than discover it in testing.

### 1.3 Fallback: structured-file exchange (v0.5)

If a full API integration isn't on Fourways' near-term roadmap, or has a procurement / development lead time longer than roughly six weeks, we'd accept a structured-file exchange as a v0.5 interim:

- A daily file (JSON or CSV — Fourways' choice) containing all reservations active in the last 24 hours plus any state changes since the previous file.
- Delivered to a Covase-controlled endpoint of Fourways' preference: n8n webhook with a file upload, SFTP drop, or cloud-storage bucket.
- Field shape per Section 3, or a subset Fourways finds easier — anything covering Section 1.2's mandatory list is enough.
- One-way only (Fourways → Covase). New bookings would continue to flow via the Fourways portal in the interim.

This gets us most of the operational value — no more manual data entry, no more email-driven booking confirmations — while we work toward the full API in parallel. Phase 1 then becomes a migration from v0.5 to the API, which is a transport swap rather than a data-model change because the field shapes match.

### 1.4 Vehicle replacements within a booking

A single Fourways booking can have one or more vehicle allocations over its lifetime. The common case is one allocation; the multi-allocation case happens when a vehicle is swapped for another mid-booking (mechanical issue, customer request, scheduled rotation). When that happens:

**Stays the same across allocations on a booking:**

- Booking-level identity (Fourways reservation ID, reference).
- Customer + Covase account identifier.
- Driver (name and mobile).
- Delivery and collection address.

**Changes per allocation:**

- Vehicle (registration, make / model, fuel, CO2, P11D, engine cc, date of first registration).
- Allocation dates (start, end, `delivered_at`, `offhired_at`).
- Rate (`cost_per_day`) — a replacement vehicle may be priced differently.
- Status (the new allocation begins at `confirmed` or `vehicle_allocated`).

**Phase 1 behaviour.** When Fourways emits `reservation.vehicle_replaced` (see Section 3.4), Covase will:

1. Set the previous allocation's status to `offhired` with `offhired_at` set to the event timestamp.
2. Create a new allocation linked back to the previous one (Covase-side `replaces_covase_hire_id` field).
3. Continue all subsequent lifecycle events on the new allocation.

This preserves the historical vehicle data, dates and rates of each allocation cleanly — important for downstream invoice reconciliation and customer recharge.

---

## 2. API Endpoint & Protocol

**Protocol.** REST over HTTPS, JSON request and response bodies (`Content-Type: application/json; charset=utf-8`).

**Methods.** `POST` for creating and `POST` for status events (we treat events as immutable creates rather than PUT/PATCH on a resource — see Section 4 for why).

### 2.1 Inbound — Fourways → Covase

Endpoints we expose for Fourways to call:

| Purpose | Method | URL |
|---|---|---|
| Reservation event (any status change) | `POST` | `https://covase.app.n8n.cloud/webhook/fourways/v1/reservation-event` (production) |
| Reservation event — staging | `POST` | `https://covase.app.n8n.cloud/webhook-test/fourways/v1/reservation-event` (UAT) |

A single endpoint receives all reservation lifecycle events (confirmed, vehicle-allocated, delivered, extended, off-hired, cancelled). The payload always contains the full current state of the reservation plus an `event_type` indicating what changed. See Section 3.4 for the schema.

### 2.2 Outbound — Covase → Fourways

We'd like to call **one Fourways endpoint** in Phase 1: create a new reservation. URL and method to be provided by Fourways. We're flexible on the URL pattern; what we care about is:

- A clear success response that includes Fourways' canonical reservation ID and reference.
- Synchronous response (we get the ID back in the same call), not a callback-only model.

If Fourways prefers a different model (e.g. we POST a "request" and then receive a webhook with the confirmation), that's fine — please flag.

## 3. Data Format & Structure

### 3.1 Field-level conventions

- **Dates:** ISO 8601, date-only fields as `YYYY-MM-DD`, timestamps as `YYYY-MM-DDTHH:mm:ssZ` (UTC).
- **Currency:** GBP everywhere in Phase 1. Numeric values, two decimal places.
- **Strings:** UTF-8. Empty fields sent as `null`, never `""`.
- **Identifiers:** All identifiers are strings.
- **Vehicle registrations:** Uppercased, whitespace removed (e.g. `AB12CDE`, not `AB12 CDE`).
- **UK postcodes:** Sent as-entered; not normalised.

### 3.2 Identifiers

The integration uses three identifiers that should travel together where applicable:

| Identifier | Owner | When set | Purpose |
|---|---|---|---|
| `covase_hire_id` | Covase | Booking creation | Stable Covase-side primary key, format `hire-<timestamp>` |
| `fourways_reservation_id` | Fourways | Booking confirmation | Stable Fourways-side primary key (please confirm format) |
| `reservation_reference` | Fourways | Booking confirmation | Human-readable reference, e.g. `FVSL049269` |

Both sides should round-trip both their own and the other side's identifier on every event.

### 3.3 Sample reservation payload (inbound and outbound)

We propose the same envelope shape in both directions. Outbound from Covase to create a booking, the `fourways_reservation_id` and `reservation_reference` are `null`. Inbound from Fourways on confirmation, they're populated.

```json
{
  "event_type": "reservation.created",
  "event_id": "evt-2026-05-18T08:42:01Z-3f9c2a",
  "occurred_at": "2026-05-18T08:42:01Z",

  "booking": {
    "fourways_reservation_id": null,
    "reservation_reference": null,

    "customer": {
      "covase_account_id": "acct-001",
      "name": "The Woodland Trust"
    },

    "driver": {
      "name": "Bodh Cullis",
      "mobile": "07422929225"
    },

    "delivery": {
      "address_line1": "108A St James' Street",
      "address_line2": null,
      "town": "Brighton",
      "postcode": "BN2 1TH",
      "preferred_start_time": null
    }
  },

  "allocation": {
    "covase_hire_id": "hire-1747576921000",
    "replaces_covase_hire_id": null,
    "fourways_allocation_id": null,
    "status": "requested",

    "vehicle": {
      "registration": null,
      "make_model": null,
      "category": "CAR3",
      "fuel_type": null,
      "co2_emissions_g_km": null,
      "p11d_value_gbp": null,
      "engine_cc": null,
      "date_of_first_registration": null
    },

    "dates": {
      "start_date": "2026-05-18",
      "end_date": null,
      "delivered_at": null,
      "offhired_at": null
    },

    "rates": {
      "cost_per_day": 18.80,
      "currency": "GBP"
    },

    "notes": null
  }
}
```

The envelope splits the payload into two parts so the lifecycle of a booking-with-replacements is unambiguous: everything under `booking` is stable across the booking's lifetime, everything under `allocation` belongs to the *currently active* vehicle allocation and resets when a replacement event fires. `fourways_allocation_id` is `null` here pending Section 9 — we don't know yet whether Fourways carries a separate allocation identifier or re-uses the reservation ID.

### 3.4 `event_type` values (Phase 1)

| `event_type` | Direction | Trigger |
|---|---|---|
| `reservation.created` | Covase → Fourways | New booking raised in ORBIS |
| `reservation.confirmed` | Fourways → Covase | Booking accepted, IDs assigned |
| `reservation.vehicle_allocated` | Fourways → Covase | Specific vehicle (registration) assigned |
| `reservation.delivered` | Fourways → Covase | Vehicle delivered to driver |
| `reservation.offhired` | Fourways → Covase | Vehicle off-hired (final or pending replacement) |
| `reservation.vehicle_replaced` | Fourways → Covase | New vehicle allocated under the same booking; previous allocation is implicitly off-hired. See Section 1.4. |
| `reservation.cancelled` | Either direction | Booking cancelled before delivery |

Each event carries the **full current state** of the reservation. We don't expect deltas; the `event_type` tells you what changed, the payload tells you the current truth. This simplifies both sides — receivers always upsert, never reason about partial updates.

### 3.5 Mandatory fields for `reservation.created` (outbound from Covase)

The minimum we'd send for a new booking is:

- `customer.name` (we'll also send `covase_account_id` for future linkage)
- `driver.name`, `driver.mobile`
- `vehicle.category` (we'll send the registration if we already have it; usually we won't)
- `delivery.*` (full address)
- `dates.start_date` (mandatory), `dates.end_date` (optional — null means open-ended)
- `notes` (free text, optional)

Please flag anything Fourways needs that's missing.

### 3.6 Batching

**Phase 1: one reservation per request.** Volumes are low enough that the overhead of batching isn't worth the complexity. If batching becomes useful later we can add it in a v2 endpoint without breaking v1.

## 4. Response & Error Handling

### 4.1 Success responses

| Endpoint | Status | Body |
|---|---|---|
| Covase inbound event | `200 OK` | `{ "received": true, "event_id": "evt-...", "covase_hire_id": "hire-..." }` |
| Covase outbound to Fourways (create) | `200 OK` or `201 Created` | Echo of the request plus populated `fourways_reservation_id` and `reservation_reference` |

We don't return 204; receivers should always see a JSON body so they can log it.

### 4.2 Error responses

We use standard HTTP status codes. The body always contains a JSON object:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "delivery.postcode is required for reservation.created",
    "request_id": "req-2026-05-18T08:42:02Z-9b4d1c"
  }
}
```

Codes we'd use on our endpoint:

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `validation_failed` | Payload missing/malformed |
| 401 | `unauthorized` | Auth key missing or invalid |
| 404 | `reservation_not_found` | Event refers to a reservation we don't recognise |
| 409 | `conflict` | Idempotency key reuse with different payload |
| 422 | `unprocessable` | Payload valid but business rule failed |
| 429 | `rate_limited` | See Section 6, includes `Retry-After` |
| 500 | `internal_error` | Our side broke — please retry |

We'd appreciate the same shape on Fourways' side so logging on both ends speaks the same language. Happy to match yours if you prefer different field names.

### 4.3 Idempotency

Every event carries an `event_id` and should also be sent in the `Idempotency-Key` HTTP header. If we receive the same `event_id` twice with the same payload, we return `200` and don't reprocess. If we receive the same `event_id` with a different payload, we return `409`. We ask Fourways to do the same on the outbound side.

### 4.4 Retries

For transient failures (network errors, 5xx, 429), retry with exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 5 retries (~30s total). After that, mark the event as failed and surface it for manual review on the sending side.

We don't expect retries on 4xx (other than 429) — those need human attention.

## 5. Rate Limits & Performance

Phase 1 volumes are very low (tens of reservation events per day across both sides combined). We propose:

- **Inbound limit (Fourways → Covase):** soft cap at 50 requests/second per direction. Hard cap 100 r/s with `429`.
- **Outbound limit (Covase → Fourways):** we'll self-throttle to your preferred rate. Please advise.
- **SLA target:** near real-time. Events should be delivered within 30 seconds of the underlying state change, and acknowledged by the receiver within 5 seconds.
- **Latency:** typical webhook acknowledgement on our side is sub-1s. If it's not, that's our problem to fix.

## 6. Versioning & Change Management

- **Versioning scheme:** URL prefix (`/v1/...`). Phase 1 is on `v1`. Breaking changes require a new version.
- **Backwards-compatible changes:** adding optional fields, adding `event_type` values — no version bump needed, but flagged in the changelog.
- **Deprecation notice:** 90 days minimum before a deprecated version is switched off, longer if either side asks.
- **Changelog:** kept in this document and shared whenever changed.

## 7. Testing & Support

### 7.1 Environments

- **Staging endpoints** are available on both sides for UAT. We'll use distinct API keys and distinct URLs (Covase's staging webhook URL is in Section 2.1).
- **Production endpoints** are gated behind a sign-off from both sides after staging soak.

### 7.2 Test data

Once we have endpoints working, we'd like to round-trip these scenarios in staging:

1. New reservation created at Covase → confirmed at Fourways → vehicle allocated → delivered → off-hired.
2. New reservation created at Covase → cancelled before confirmation.
3. New reservation created at Fourways (in your portal, by anyone) → first inbound event we receive is `reservation.confirmed`.
4. End date moved out (extension) — happy to defer until Phase 2 if simpler.

### 7.3 Coordinating testing

Proposed cadence: weekly 30-minute call during the build phase (you and me) to walk through what's working and what isn't. Ad-hoc by email otherwise.

### 7.4 Contacts

| Role | Covase | Fourways |
|---|---|---|
| Technical lead | Simon Homer — edgers-dives8r@icloud.com | (please provide) |
| Account contact | (please provide if different) | Jill Williamson |
| Escalation | (please provide if different) | (please provide) |

## 8. Authentication & Security

### 8.1 Phase 1 proposal: API key

For Phase 1 we propose API key auth, with one key per direction per environment (so four keys total: staging-inbound, staging-outbound, production-inbound, production-outbound).

- **Header:** `Authorization: Bearer <key>` (preferred) or `X-API-Key: <key>` — happy with either.
- **Key generation:** each side generates the keys for traffic *coming into* them, so Covase generates the keys Fourways uses to call us, and vice versa.
- **Key delivery:** out-of-band, e.g. encrypted email or 1Password share. Never in chat, never in this document.
- **Rotation:** annual at minimum, on request, or immediately if compromised.

### 8.2 Optional — HMAC signing

We can add HMAC-SHA256 signing of request bodies if Fourways prefers stronger authentication. The header would be `X-Signature: sha256=<hex>` computed over the raw body using a shared secret. Either side can request this for v1.1 if API-key-only isn't acceptable.

### 8.3 Network

- **HTTPS only.** TLS 1.2 minimum.
- **IP allowlisting:** n8n Cloud egress IPs are publishable on request. We'll allowlist Fourways' outbound IPs against our webhook if needed. Please let us know if you have a fixed IP range or if it's dynamic (most cloud-hosted systems are dynamic, in which case the API key is the access control).

### 8.4 Payload encryption beyond TLS

Not needed in Phase 1 (no special-category personal data). Drivers' names, mobiles and addresses are exchanged in plaintext over TLS. If Fourways' security team needs additional encryption at the application layer, please flag.

## 9. What we need from Fourways

Items only Fourways can fill in. Roughly in priority order:

1. **Your outbound endpoint URL(s)** that Covase should `POST` reservations to (production + staging).
2. **Your preferred auth scheme** for the outbound direction — API key, OAuth, or HMAC. We'll match.
3. **The exact shape of your reservation-created response** so we can model the `fourways_reservation_id` field correctly. (Is it numeric? UUID? Format of `reservation_reference`?)
4. **Allocation identification when a vehicle is replaced under a booking.** Does Fourways emit a separate allocation ID for each vehicle allocation on a booking, or do you re-use the reservation ID and rely on event timestamps to distinguish them? See Section 1.4 for the model we're proposing.
5. **Your `event_type` set.** We've proposed six in Section 3.4. Are there others we should support? Anything in our list you don't currently emit?
6. **Mandatory fields on your side** for a reservation that we might not be sending. (Section 3.5 lists what we send; please cross-reference your requirements.)
7. **Sandbox / UAT** availability and how we get keys.
8. **Technical contact** for the build phase (name + email).
9. **Sample payload** of one of your existing client integrations' reservation events if shareable — would let us pattern-match rather than negotiate every detail from scratch.
10. **Confirmation of phase 1 scope** as defined in Section 1, or any pushback.

## 10. Open items on Covase's side

Things we'll firm up once your responses arrive:

- Exact schema migration on our Supabase (adds `fourways_reservation_id`, `event_id` log table).
- n8n workflow setup for the webhook and outbound calls.
- The UI surfacing on the live platform — sync state, "out of sync" alerts, manual retry buttons (already scaffolded in our internal plan, not visible yet).
- Documentation for our internal team explaining the new flow once it's live.

We'd hope to have Phase 1 in your staging within 3–4 weeks of receiving your responses to Section 9, parallel-run for 2 weeks, then promote to production.

---

*End of brief. Please reply with annotations on this document, or use the section numbers as a reference. Happy to jump on a call to walk through anything.*
