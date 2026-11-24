# Logins + database lock — plan (Simon, 23 Nov 2026)

Why: every browser needs the Supabase URL/anon key (and ORS / Ideal Postcodes / tile keys) typed in by hand, and the anon key is the only thing protecting the data — RLS is permissive for `anon`. The repo is **public**, so the key can't be baked into the code until the lock is on. Logins and lock therefore go live together.

Decisions: email + password (Supabase Auth). Lock included as the final step (Simon re-confirms immediately before). Users for now: simon.homer@covase.co.uk, andy.jackson@covase.co.uk. **Needs a user admin tool: add users and choose which modules each can use.**

## Steps
1. **n8n onto a private key.** Simon adds n8n variable `SUPABASE_SERVICE_KEY` (Supabase → Project Settings → API keys → service_role/secret). Claude swaps `$vars.SUPABASE_ANON_KEY` → `$vars.SUPABASE_SERVICE_KEY` in the 6 workflows below, publishes, checks executions.
2. **Login screen + central settings.** Supabase Auth email/password; `sbReq`, Storage (`docHeaders`), realtime use the session token. Keys move to a settings row readable only when signed in. **User admin**: profiles table (user id, name, role admin/user, allowed modules = SB_ITEMS keys); sidebar + views hidden for modules not allowed (UI-level; per-module data rules can come later). Creating users needs the service key → a small n8n webhook that checks the caller is an admin (verifies their JWT) before calling the Auth admin API.
   **Step 2 built 24 Nov 2026** (00-auth.js, 17-users.js, phase-logins.sql applied, User Admin workflow built, unpublished). Optional sign-in until step 4.
3. **Accounts** for Simon and Andy (temporary passwords). Claude's browser skill signs in as Simon.
4. **Go live + lock together:** RLS policies `anon` → `authenticated` on every covase_* table (audit stays SELECT-only), Storage policies likewise; bake URL + anon key into the code. One-step rollback SQL prepared.

**Step 1 done 24 Nov 2026:** Simon added `SUPABASE_SERVICE_KEY`; all six workflows below switched (every `SUPABASE_ANON_KEY` reference → `SUPABASE_SERVICE_KEY`, verified by version diff) and published ~10:30.

## Step 1 audit (23 Nov) — workflows using `$vars.SUPABASE_URL` + `$vars.SUPABASE_ANON_KEY`
| Workflow | ID | Touches |
|---|---|---|
| Supplier Reply Processor | 8RJ2yETuLYpjQb7V | config, hires, supplier_replies; Storage `reply-attachments` (writes public URLs) |
| Movement Reply Processor | BPJ4A92M3U21cBqd | config, movements, accounts, supplier_replies |
| Supplier Manual Reply | ngK3lfZ15uXm2aBG | supplier_replies |
| Fines Intake (Lex) | 1ps9NEpoymWE33XP | fines, vehicles, accounts, contacts (inserts), hires; Storage `fine-notices` (public URLs) |
| Invoice Email Processor | jNIfWg0exNqR5UFd | invoices; Storage `invoice-pdfs` (public URLs) |
| WLC Price Feed | 874y4IR8kGGxtVtM | config `wlc_settings` |

Not affected: onboarding/Dynamics/booking workflows (no Supabase); Driver Email Send (uses signed links from the browser). WhatsApp + 3 "Dashboard API" workflows use a direct Postgres credential ("Supabase Whatsapp") — bypasses API keys and RLS, so the lock doesn't touch them (check which DB role it uses). WoW workflows are a different Supabase project.

**Open point for step 4:** buckets `fine-notices`, `reply-attachments`, `invoice-pdfs` are public — anyone with a link can open a fine notice or invoice. Making them private means switching the platform to signed links and handling the public URLs already stored in rows.
