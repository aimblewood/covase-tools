# Runbook: Migrate n8n from Cloud to Sliplane

**Owner:** Simon Homer
**Frequency:** Once (one-off migration)
**Estimated time:** 60–90 minutes
**Last updated:** 2026-04-18

---

## Purpose

Move the Covase n8n instance off n8n Cloud (which has hit its execution quota) onto self-hosted Sliplane. Keeps all existing workflows, credentials, and integrations working, removes the execution cap, and reduces monthly cost.

**Outcome:** n8n running at `n8n.covase.co.uk` (or similar) on Sliplane, with the invoice processor, Dynamics client lookup, and Dynamics contact lookup workflows all firing. Platform + invoice generator pointed at the new webhook URLs.

---

## Prerequisites

- [ ] Sliplane account (sign up at sliplane.io — GitHub login works)
- [ ] A domain or subdomain you control (e.g. `n8n.covase.co.uk`). DNS access via your registrar.
- [ ] Admin access to current n8n Cloud instance `covase.app.n8n.cloud`
- [ ] Anthropic API key (the value, not just the reference)
- [ ] Supabase URL + anon key
- [ ] Microsoft Azure AD app registration details for the Dynamics OAuth2 connection (Client ID, Client Secret, Tenant ID) — check your existing n8n credential or Azure portal
- [ ] Credit card for Sliplane (~£10/mo)
- [ ] A quiet 90-minute window — ideally when no invoices are mid-flight

---

## Procedure

### Step 1: Export all workflows from n8n Cloud

Log into `covase.app.n8n.cloud`. For each workflow you want to keep:

1. Open the workflow
2. Menu (⋯ top right) → **Download**
3. Save the JSON file to a local folder called `n8n-export/`

Workflows to export at minimum:
- `jNIfWg0exNqR5UFd` — Covase — Invoice Email Processor
- `0vq5VHfptSdqpitL` — Covase — Dynamics Client Lookup
- `7vpaeLVDHJaXFis6` — Covase — Dynamics Contact Lookup

**Expected result:** Three `.json` files on disk.

**If it fails:** If Download is greyed out, use the API: `GET /rest/workflows/{id}` with your session cookie.

---

### Step 2: Note down credentials (names only, not secrets)

Credentials don't export with workflow JSON — that's deliberate for security. In n8n Cloud go to **Credentials** and note:

- Name of each credential
- Which service (Dynamics OAuth2, Anthropic, Supabase, Microsoft Outlook OAuth2, etc.)
- Which workflows use it

You'll recreate these from scratch in Step 7.

**Expected result:** A list like:
```
- Dynamics OAuth2 — used by client + contact lookup
- Anthropic API — used by invoice processor
- Supabase Anon — used by invoice processor + lookups
- Microsoft Outlook OAuth2 — used by invoice processor
```

---

### Step 3: Deploy n8n on Sliplane

1. Go to **sliplane.io** → sign in with GitHub
2. **Create Service** → search template for "n8n" → select the official n8n template
3. Server size: **Start** tier is fine to begin with (~£9/mo, 1 vCPU, 1GB RAM). Upgrade later if needed.
4. Give the service a name: `covase-n8n`
5. Set environment variables on the service:
   ```
   N8N_HOST=n8n.covase.co.uk
   N8N_PROTOCOL=https
   WEBHOOK_URL=https://n8n.covase.co.uk/
   GENERIC_TIMEZONE=Europe/London
   N8N_EDITOR_BASE_URL=https://n8n.covase.co.uk
   ```
6. **Deploy**

**Expected result:** Service shows "Running" after 2–3 minutes. Sliplane gives you a temp URL like `covase-n8n-xyz.sliplane.app`. You can open it but don't set a password yet — wait until DNS is on your own domain.

**If it fails:** Check Sliplane logs from the service page. Usual cause is env var typos.

---

### Step 4: Point your domain at Sliplane

1. In Sliplane service settings → **Custom Domain** → add `n8n.covase.co.uk`
2. Sliplane shows you a CNAME target (looks like `custom.sliplane.app`)
3. In your DNS provider (wherever `covase.co.uk` is registered — likely Cloudflare or Namecheap):
   - Add a CNAME record: `n8n` → `custom.sliplane.app` (use the exact value Sliplane gave you)
   - TTL: 300
4. Wait 2–10 minutes for propagation. Check with `dig n8n.covase.co.uk` or just hit the URL in a browser.
5. Sliplane auto-provisions Let's Encrypt TLS once DNS resolves.

**Expected result:** `https://n8n.covase.co.uk` loads the n8n setup screen with a valid SSL cert (padlock in browser).

**If it fails:** DNS not propagated → wait longer. Cert failing → Sliplane has a "Retry TLS" button.

---

### Step 5: Initial n8n setup — create owner account

1. At `https://n8n.covase.co.uk` you'll see "Setup owner account"
2. Use a strong password, store in 1Password / your password manager
3. Email: your admin email
4. Skip the marketing questions

**Expected result:** You land on an empty n8n dashboard.

---

### Step 6: Import workflows

For each `.json` file from Step 1:

1. Dashboard → **Workflows** → **Add workflow** → **Import from File**
2. Select the JSON
3. Save (Cmd+S). Don't activate yet — credentials are missing.

**Expected result:** All three workflows listed, all inactive, all showing red "missing credential" indicators on their nodes.

---

### Step 7: Recreate credentials

**7a. Supabase (easiest — just a key)**
- Credentials → New → **HTTP Header Auth** (if that's what your existing one uses) OR **Supabase API** if the native credential exists
- Header: `apikey` | Value: your Supabase anon key
- Name it `Covase Supabase Anon`
- Open each workflow, click the Supabase nodes, select this credential

**7b. Anthropic**
- Credentials → New → **Anthropic API**
- Paste your `ANTHROPIC_API_KEY`
- Name: `Covase Anthropic`
- Wire into the invoice processor's Claude nodes

**7c. Microsoft Dynamics OAuth2**
- Credentials → New → **OAuth2 API**
- Grant Type: Authorization Code
- Authorization URL: `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize`
- Access Token URL: `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token`
- Client ID + Client Secret from Azure app registration
- Scope: `https://covase.crm11.dynamics.com/.default offline_access`
- **Important:** the redirect URL n8n shows you (`https://n8n.covase.co.uk/rest/oauth2-credential/callback`) must be added to your Azure app registration's redirect URIs before you authorise
- Click **Connect** → Microsoft sign-in → approve
- Name: `Covase Dynamics OAuth2`
- Wire into both Dynamics lookup workflows

**7d. Microsoft Outlook OAuth2** (for invoice processor)
- Same pattern as Dynamics but with Outlook scopes: `Mail.Read Mail.ReadWrite offline_access`
- Add the n8n callback URL to the Azure app reg if not already there
- Authorise with the mailbox that owns the `Invoices to process` folder

**Expected result:** All four credentials created, all workflow nodes showing green (credential attached).

**If it fails:** OAuth errors almost always = redirect URI mismatch. Copy the exact URL n8n shows and paste it into Azure.

---

### Step 8: Re-point the "Invoices to process" folder ID

The invoice processor hardcodes the Outlook folder ID:
`AAMkAGYxYmM2MWNmLTUwMjgtNDA1NC04MWFhLTIwMDBhOGU0YjA2ZgAuAAAAAAAkfT7Vg_CfSqG15181IskMAQALmTFt0zIzTZpaxLUPQVWbAAfcCvH9AAA=`

This should carry across with the JSON import unchanged. But if the Outlook credential is now a different mailbox, the ID won't resolve. Open the invoice processor, find the Outlook trigger node, confirm the folder dropdown loads and "Invoices to process" is selected.

**Expected result:** Folder dropdown populates, correct folder selected.

---

### Step 9: Test each workflow (still inactive)

**9a. Client lookup** — in the workflow editor, click **Test workflow**. Use a test webhook call from your terminal:
```bash
curl -X POST https://n8n.covase.co.uk/webhook-test/covase-client-lookup \
  -H "Content-Type: application/json" \
  -d '{"q":"novum"}'
```
**Expected result:** JSON array of matching Dynamics accounts, including `accountId`.

**9b. Contact lookup** — same pattern:
```bash
curl -X POST https://n8n.covase.co.uk/webhook-test/covase-contact-lookup \
  -H "Content-Type: application/json" \
  -d '{"q":"smith"}'
```
**Expected result:** JSON array of contacts with `fullName`, `accountName`, `contactId`.

**9c. Invoice processor** — drop a test invoice email into the "Invoices to process" folder. Run the workflow manually in n8n. Verify:
- Claude extracts the line items
- Row appears in `covase_invoices` in Supabase with `is_short_hire=true` and `extracted_hires[]` populated

**If any fail:** Check the execution log in n8n (the red node). Usual causes: credential wiring, webhook path mismatch (should be `/webhook/` not `/webhook-test/` once activated), Supabase table permissions.

---

### Step 10: Activate workflows

Once all three tests pass, toggle each workflow **Active** (top right of editor).

**Expected result:** Active toggle stays on, no red error at the top.

---

### Step 11: Point platform + invoice generator at new URLs

The frontend stores webhook URLs in `localStorage`. You have two choices:

**Option A — change the defaults in HTML (recommended, covers any future browser wipe):**

In `covase-platform.html`, find:
```js
const DEFAULT_N8N_CLIENT='https://covase.app.n8n.cloud/webhook/covase-client-lookup';
const DEFAULT_N8N_CONTACT='https://covase.app.n8n.cloud/webhook/covase-contact-lookup';
```
Change the host to `https://n8n.covase.co.uk`. Do the same in `covase-invoice-generator.html` for its client webhook default.

Commit + push to GitHub Pages.

**Option B — update localStorage in-browser (quick but ephemeral):**

In your browser devtools on the platform:
```js
localStorage.setItem('covase_n8n_webhook','https://n8n.covase.co.uk/webhook/covase-client-lookup');
localStorage.setItem('covase_n8n_contact_webhook','https://n8n.covase.co.uk/webhook/covase-contact-lookup');
```

Refresh the platform, open New Hire, type in the customer search — should hit new n8n.

**Expected result:** Dynamics lookups work from the platform.

---

### Step 12: Set up Postgres backups

Sliplane's n8n template uses SQLite by default (fine for small usage) or lets you attach Postgres. If you chose Postgres:

1. Sliplane → your n8n service → **Backups** tab → enable daily snapshots (usually £2/mo extra)
2. OR script your own: Sliplane lets you SSH; run `pg_dump` to a Backblaze B2 bucket nightly via a cron container

If SQLite, Sliplane backs up the whole container volume automatically — good enough.

**Expected result:** Backup policy ticked, one test restore done within the first week.

---

### Step 13: Cancel n8n Cloud

Once new instance has been running clean for **7 days** and you've seen at least one full invoice processor cycle and several Dynamics lookups:

1. n8n Cloud dashboard → Billing → Cancel subscription
2. Confirm end-of-billing-period cancellation (don't let it auto-delete data — export anything else you want first)
3. Archive your `n8n-export/` folder somewhere safe

**Don't cancel same-day.** Keep Cloud live as a fallback.

---

## Verification

- [ ] `https://n8n.covase.co.uk` loads with valid TLS
- [ ] Three workflows imported and active
- [ ] Invoice processor has successfully processed at least one real supplier invoice end-to-end (visible in `covase_invoices` with `is_short_hire=true`)
- [ ] Customer Dynamics search works in New Hire modal
- [ ] Driver Dynamics search works in New Hire modal
- [ ] Invoice generator client lookup still works
- [ ] At least one Postgres/SQLite backup exists
- [ ] No failed executions in n8n's executions log for 48 hours

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Frontend shows "⚠ Lookup failed — check webhook" | Webhook URL still pointing at n8n Cloud (or wrong path) | Check localStorage + HTML defaults. Remember activated workflows use `/webhook/` not `/webhook-test/` |
| OAuth "redirect_uri_mismatch" | Azure app reg doesn't have new callback URL | Add `https://n8n.covase.co.uk/rest/oauth2-credential/callback` to the app registration |
| Dynamics returns 401 | OAuth token not refreshing | Re-authorise the credential. Check `offline_access` is in the scope |
| Invoice processor not picking up emails | Outlook folder ID invalid on new mailbox | Re-select the folder in the trigger node dropdown |
| TLS cert fails on Sliplane | DNS not yet propagated | Wait. Check with `dig` before retrying |
| n8n editor slow or crashing | Start tier too small | Upgrade to the next Sliplane tier (2GB RAM) |
| Sliplane bill creeping up | Verbose executions eating storage | n8n → Settings → execution data pruning: keep 7 days |

---

## Rollback

If within the first 7 days something's broken and you need to revert:

1. Revert the HTML webhook URL defaults (or clear the localStorage overrides)
2. Commit + push. Platform + generator now hit n8n Cloud again.
3. n8n Cloud workflows should still be active (you haven't cancelled yet) — double-check.
4. Diagnose Sliplane issue in slow time. Don't cancel Cloud until resolved.

---

## Escalation

| Situation | Action |
|---|---|
| Sliplane service down | Check status.sliplane.app. Contact Sliplane support via their in-app chat. |
| Dynamics OAuth won't authorise | Azure AD admin (likely Simon) needs to confirm app registration is still valid |
| Invoice processor missing invoices | Check Outlook folder permissions on the shared mailbox; fall back to manual processing |

---

## History

| Date | Run by | Notes |
|---|---|---|
| | | |
