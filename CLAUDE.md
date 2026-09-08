# ORBIS-SON — Covase internal platform — Claude project brief

> **Read this first.** This is the current-truth brief for any Claude session (Claude Code, claude.ai, Cowork).
> Where it contradicts `PROJECT.md` (Apr 2026) or `HANDOVER-supplier-agent.md` (Aug 2026), **this file wins** — those are kept for history and deeper detail.
> Last full refresh: **2026-09-08** (pre-vacation handover).

## 1. What this is

**ORBIS-SON** is Covase Ltd's internal fleet-management platform: short-hire bookings, CRM, vehicle movements (logistics), accident claims (FMG), fines & penalties, invoicing. Goal: fully detach from Dynamics 365 within months. Built and maintained conversationally with Claude; Simon Homer is the owner/operator and the only person who pushes deploys.

**Stack:** single-file vanilla HTML/JS app (`covase-platform.html`, ~600KB) + Supabase (Postgres/PostgREST/Realtime/Storage via anon key) + n8n cloud for automation + Microsoft Graph for email + Claude API for extraction/classification. Deployed on **GitHub Pages**: repo `aimblewood/covase-tools` → https://aimblewood.github.io/covase-tools/. **Push = deploy.** Rollback = revert commit (or `covase-platform.old.html` snapshot).

**Live system.** Colleagues use it daily and the Supabase project is shared/production. UI iteration is safe; data experiments are not. Never run destructive SQL without Simon's explicit confirmation.

## 2. Infrastructure

| Thing | Value |
|---|---|
| GitHub deploy repo | `aimblewood/covase-tools` (Pages) |
| Supabase project | `nlvlyfdsvgrdlcqksafb` |
| n8n instance | `covase.app.n8n.cloud` (has an MCP server; workflows opt in via `availableInMCP`) |
| Dynamics 365 | `covase.crm11.dynamics.com`, WebAPI v9.2 |
| Mailboxes | `rentals@covase.co.uk` (shared — hires), `logistics@covase.co.uk` (shared — movements), `admin@covase.co.uk` (**alias** into Simon's own mailbox — fines intake + alert notifications land there) |
| n8n env vars | `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Claude model for all n8n calls | **`claude-sonnet-5`** (`claude-sonnet-4-20250514` retired 2026-06-15 → 404; last stragglers migrated 2026-08/09) |

**n8n credentials:** Outlook OAuth `b7m5qszXbptDsLfk` ("Microsoft Outlook account" = Simon's account; Full Access + Send As on rentals@ and logistics@ — shared mailboxes have no login, hence `/users/<mailbox>/...` Graph paths, never `/me` for sends). Dynamics OAuth `UJJCexfFbCVEDskT` ("Unnamed credential") **works**; `kyMHkwTl7hZdAB2v` ("365 credential") **fails auth — never use**. Excel/SharePoint credential `NOhaxGlt7URuTtcI` exists (unused; earmarked for WT sheet write).

Browser-side keys (localStorage, per machine, set in Settings ⚙): Supabase URL+anon key, OpenRouteService key (mileage), Ideal Postcodes key (PAF address lookup, `ak_…`).

## 3. n8n workflows (all active)

| Workflow | ID | Trigger | Purpose / quirks |
|---|---|---|---|
| Supplier Booking Request | `ROL6XCxrSsYVCxST` | webhook `covase-supplier-booking-request` | Sends booking/movement/offhire/chase emails via Graph. Payload `{to,from,subject,bodyHtml,customer}`; `from` allowlisted to rentals@/logistics@ (default rentals@); `to` accepts comma-separated list. |
| Supplier Reply Processor | `8RJ2yETuLYpjQb7V` | cron `*/15 8-17 * * 1-5` + webhook `covase-supplier-reply-check` | Reads rentals@ unread → Claude classify → match → `covase_supplier_replies` → mark read → auto-ack path → **admin alert email** (one per run if any needs_review/unmatched). Outcomes incl. `offhire_confirmed`. Matches `[CVB:hire-…]` legacy + `CVB-1234` job refs, subject then body scan, then FVSL-ref/driver-name unique-match-or-refuse. Instructions from covase_config `supplier_agent_instructions`. |
| Movement Reply Processor | `BPJ4A92M3U21cBqd` | cron `*/15 8-17 * * 1-5` + webhook `covase-movement-reply-check` | Same pattern for logistics@; outcomes confirmed/declined/needs_info/acknowledgement (no auto-ack sending); matches `CVM-` refs then reg/supplier-domain; instructions key `movement_agent_instructions`; admin alert from logistics@. |
| Supplier Manual Reply | `ngK3lfZ15uXm2aBG` | webhook `covase-supplier-manual-reply` | Graph in-thread reply. Payload `{messageId,hireId,movementId,from,to,replyText}` — `from` allowlisted, `to` (comma list) overrides recipients. Logs outbound row. |
| Fines Intake (Lex) | `1ps9NEpoymWE33XP` | cron `0 9-17 * * 1-5` + webhook `covase-fines-check` | Polls "Lex Fines" folder (Simon's mailbox, filled by Outlook rule on admin@ mail) → Claude reads notice PDF → dedupe id `fp-m-<msgId>` → Dynamics enrich → insert `covase_fines` + upload PDF to Storage `fine-notices`. Extracts **PIN only on speeding/NoIP**. Speeding amounts always null (driver pays direct). Issuer never Lex. |
| Invoice Email Processor | `jNIfWg0exNqR5UFd` | Outlook trigger (folder "Invoices to process") | Claude reads supplier invoice PDFs → `covase_invoices` (+ short-hire extraction). On sonnet-5, max_tokens 8000, retry-enabled. |
| Dynamics Vehicle Lookup | `4z2dmyKXulMWeLL4` | webhook `covase-vehicle-lookup` | `xpg_covasevehicles` query; bulk comma-list regs incl. spaced variants; $expand driver/account. Entity facts: logical `xpg_covasevehicle`, set `xpg_covasevehicles`, id `xpg_covasevehicleid`, reg `xpg_regno`. |
| Dynamics Contact Lookup | `7vpaeLVDHJaXFis6` | webhook `covase-contact-lookup` | Contacts by name/email; returns address1/2(+3), town, **county** (`address1_stateorprovince`), postcode. |
| Dynamics Client Lookup | `0vq5VHfptSdqpitL` | webhook `covase-client-lookup` | Accounts typeahead. |

**n8n editing rules (hard-won):**
- `update_workflow` **merges** parameters — nested objects (e.g. `queryParameters`) must be fully replaced, and removing a field means explicitly setting its parent off (`sendQuery:false`).
- **Always `publish_workflow` after edits** — updates are drafts.
- Code-node sandbox: no `fetch`; use `this.helpers.httpRequest` + `$vars`. **`helpers.httpRequest` JSON-serialises Buffer bodies** — binary uploads must go through an HTTP Request node with `contentType:'binaryData'`. Code nodes have a **60s task cap** — batch long loops.
- Graph: subfolders need `/mailFolders/inbox/childFolders`; no `$select=contentBytes` on base attachment type; 429s → node batching + retryOnFail. Lex PDFs arrive as `application/octet-stream` — detect by filename too.
- **Execution budget rules in PROJECT.md §11 are law** — no polling faster than 15 min without doing the maths for Simon; never activate a new workflow yourself.

## 4. Supabase schema (summary)

Tables (TEXT ids, prefixed): `covase_hires` (hire-…), `covase_invoices` (inv-…), `covase_accounts` (acc-…), `covase_contacts` (ct-/con-…), `covase_vehicles` (veh-…), `covase_movements` (mov-…), `covase_claims`, `covase_fines` (fp-m-…), `covase_supplier_replies` (sr-…), `covase_config` (key/value JSONB). All RLS **enabled with permissive `anon,authenticated` policies** (Simon's preferred pattern). Realtime publication covers the lot (`phase-realtime.sql`); app subscribes via supabase-js and debounce-reloads.

Key columns added since PROJECT.md: hires — `tariff`, `supplier_email_sent_at`, `job_ref` (**CVB-0001**, DB default from sequence), offhire set (`collection_address_line1/2`, `collection_town/county/postcode`, `collection_date`, `collection_time`, `offhire_notes`, `offhire_requested_at`); movements — endpoints incl. `*_address_line2`, contacts/phones, `supplier`, `supplier_account_id`, `price_override` (**replaces BASE only, pre-markup**), `supplier_email_sent_at`, `job_ref` (**CVM-0001**); supplier_replies — `movement_id`; fines — `pdf_url`, `pin` (speeding/NoIP nomination code; `'NONE'` = checked, nothing printed).

Statuses: hires `pending→requested→booked→active→offhired` (+cancelled) × billing `pending→invoiced-in→recharged→paid`; movements `quoted→booked→(in_progress retired, kept)→completed_pending_fuel("Awaiting invoice")→invoiced→paid` (+cancelled); fines `new→driver_notified→address_requested→nominated→on_coin→to_be_charged→charged` (+query/appeal_upheld/refunded/cancelled).

Auto-advance (client-side on load): booked→active at start date; active→offhired day after end date; **offhire-tagged bookings → offhired when collection date/time reached** (end_date=collection date). `daysOn()` = elapsed only (0 before start).

`covase_config` keys: `supplier_booking_template`, `movement_booking_template`, `offhire_booking_template`, `supplier_agent_instructions`, `movement_agent_instructions`, `fines_templates`, `fines_dashboard`, `fines_reports`, `movement_card_layout`, `hire_card_layout`, `fine_card_layout`, `sidebar_layout`, `app_theme`, `font_overrides`.

**SQL migrations** = `phase-*.sql` files in this folder, run manually in the Supabase SQL editor, all idempotent with rollback comments. Everything through `phase-fine-pin.sql` (Sep 2026) has been applied. Pattern for new work: ship SQL first, wait for Simon to run it, then platform code.

## 5. Platform feature map (covase-platform.html)

- **Bookings (short hires):** pipeline kanban (Pending/Requested/Booked/Active/Off-hired lanes, drag + advance), designed cards (🎨 designer), send-to-supplier with editable email, **📦 Offhire** flow (collect-from-delivery confirm, Dynamics/PAF/manual address, auto-advance at collection time, card badge), replace-vehicle chain, recharge flow.
- **Logistics (movements):** list/kanban/calendar; card + calendar-chip designer with 🏷 labels and per-chip formatting; pricing £80 first 100mi + 80p/mi + markup, `price_override` = base only; **mileage is postcode-centroid → ORS routing, deliberately** (address fields are for emails/records, NOT routing); PAF postcode→address (Ideal Postcodes), Dynamics contact fill (incl. county), ORS autocomplete; supplier request email from logistics@; **🧭 Journey view** (Leaflet map, animated route, 5s, 🚗, stats).
- **Action Inbox → Review queue:** hire + movement replies together (🚚-prefixed), Apply/Reply/thread/re-link/dismiss; unmatched cards link to hire OR movement; ⚡ checks both webhooks. Reply modal: editable **To** (comma list ok), sends from correct mailbox; **New message / chase** works with zero inbound (Re: original subject + job ref).
- **Correspondence threads** for hires AND movements (movement modal ✉ button; queue View thread).
- **Accident management (FMG claims):** import DataSummary xlsx, type-aware kanban, full-field modal, dashboard, alerts, Dynamics fallback matching + match report. FMG is system of record.
- **Fines & penalties:** default **kanban** (7 workflow lanes + parked strip, drag stamps milestone dates); register with sort dropdown (received/offence/amount/driver/status); card designer (28 fields incl. PIN); COIN import; WT sheet export; driver emails via **mailto:** (opens Simon's own Outlook — plain text, PDF link appended, no attachments possible); PDF side-by-side viewer; sidebar badge counts **status=new only**.
- **Chrome:** sidebar organiser (drag/rename/hide, shared layout), Edit Mode click-to-style, Fonts editor, realtime indicator, badges from caches.
- **Email templates** (Settings): hire booking (WYSIWYG), offhire, movement, fines driver emails, both agent instruction editors. All send modals show rendered subject+body, freely editable, ↻ rebuild, job ref auto-appended to subject.

**Job refs:** every hire `CVB-nnnn`, movement `CVM-nnnn` — shown in modals/cards, carried in email subjects, and the reply agents' primary match key. Never strip them from subjects.

## 6. Conventions & guardrails (unchanged, still law)

- `str_replace`-style incremental edits, never wholesale rewrites. `node --check` the extracted script block after edits.
- SQL first → Simon runs it → then app code. Confirm before anything destructive; flag irreversible actions.
- Dates: DB ISO, UI `fmtUK()` DD/MM/YYYY. Regs uppercased, whitespace-stripped.
- Simon pushes all deploys. Claude never activates new n8n workflows.
- Matching philosophy everywhere: **unique-match-or-refuse** — an unmatched queue item beats a wrong match.
- Don't touch: RLS/security silently, M365 settings, live client data (see PROJECT.md §10).
- When uncertain about a fact, say so — don't pattern-match.

## 7. Known snags to remember

- ORS free geocoding is weak on residential addresses — that's why routing is centroid-based and PAF exists for addresses.
- Supabase Storage public URLs cache at the CDN — after overwriting an object, verify with a cache-buster.
- mailto: cannot attach files and is plain-text (fines driver emails). True attachments = future Graph send.
- The reply modal z-index is raised (260) so it stacks over other modals.
- Card designer machinery is shared (`cdCtx` contexts mv/hire/fine) — new card types plug into `CD_CONTEXTS`.
- `covase_supplier_replies.message_id` is unique — dedupe backbone for all agents.

## 8. Open threads (Sep 2026)

- WT Teams sheet direct Graph write (needs SharePoint file location from Simon).
- Agent auto-chase of missing vehicle details (wording to confirm first).
- Fines: system-send driver emails from a fixed mailbox with real PDF attachment (replaces mailto) — offered, not commissioned.
- Edit Mode phase 2: drag-drop screen elements.
- Sage push, GoCardless, bank rec (PROJECT.md roadmap).
- Andreas Stihl/FVSL050339 reply re-link (may already be done — check queue).

## 9. Session bootstrap

Claude Code (local or web) reads this file automatically. For claude.ai chats, paste it or attach it. The deeper archives: `PROJECT.md` (core schema + hard rules), `HANDOVER-supplier-agent.md` (agent-build history), `docs/` (chat exports). n8n is reachable from any Claude surface via its MCP server (claude.ai → Settings → Connectors → custom connector → n8n instance MCP URL).
