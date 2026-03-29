# Covase Tools

Internal invoicing tools for Covase Ltd. Hosted on GitHub Pages, backed by Supabase.

## Files

| File | Purpose |
|------|---------|
| `covase-invoice-generator-v20.html` | Invoice generator — create/edit outgoing invoices with live preview and PDF export |
| `covase-invoice-hub-v2.html` | Invoice Hub — dashboard for managing incoming + outgoing invoices |

## Setup

1. Enable **GitHub Pages** on this repo (Settings → Pages → Source: main branch, root)
2. On first load, each tool will prompt for your **Supabase project URL** and **anon key**
3. Both tools share config via `localStorage` — set it in one and it carries across

## Supabase schema

The `covase_invoices` table needs these columns (run once):

```sql
ALTER TABLE covase_invoices
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_address text,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS prepared_by text,
  ADD COLUMN IF NOT EXISTS line_items jsonb;
```

## Roadmap

- [x] Invoice Generator (layout, Dynamics lookup, VAT per-line)
- [x] Invoice Hub (incoming invoices, approval workflow)
- [x] Hub ↔ Generator linking (edit round-trip via Supabase)
- [ ] Sage integration
- [ ] Bank reconciliation
- [ ] GoCardless direct debit collection
