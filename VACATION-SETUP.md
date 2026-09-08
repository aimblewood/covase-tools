# Vacation kit — emergency access from iPhone/iPad

Goal: fix the platform, the n8n workflows, or the database from mobile, no PC.
Three rails: **code → Claude Code on the web** · **workflows → Claude app + n8n connector (or n8n web UI)** · **database → Supabase SQL editor in Safari**.

---

## Step 1 — Consolidate into the deploy repo (~10 min, on the PC)

This folder is not a git clone; the deploy repo `aimblewood/covase-tools` is the thing
Claude Code on the web connects to. One-time consolidation (PowerShell):

```powershell
cd D:\simon\Documents\Claude\Projects
git clone https://github.com/aimblewood/covase-tools.git

# copy the working folder into the clone (works even if some files already exist there)
Copy-Item ".\Orbis Platform\*" ".\covase-tools\" -Recurse -Force

cd covase-tools
git add -A
git commit -m "Consolidate Orbis Platform working folder: CLAUDE.md brief, SQL phases, docs"
git push
```

Notes:
- This deploys nothing new functionally — `covase-platform.html` here should already match live (push pending changes first if not).
- After this, treat `D:\simon\Documents\Claude\Projects\covase-tools` as the canonical working folder
  (point Cowork/Claude Code at it when you're back). The old folder can stay as a snapshot.
- The repo is public (GitHub Pages): CLAUDE.md contains **no secrets** — keys live in browser
  localStorage and n8n variables, never in files. Keep it that way.

## Step 2 — Claude Code on the web + iPhone (~5 min)

1. On the PC (or iPad browser): go to **code.claude.com** (or claude.ai/code), sign in,
   connect GitHub, install the Claude GitHub app, grant it `aimblewood/covase-tools`.
2. On the iPhone Claude app: open the code / sessions area — the repo appears there.
3. **Dry-run before flying**: from the phone, run a trivial task —
   *"In covase-platform.html change the fines register empty-state text from 'No fines yet' to 'No fines yet.' and push"* —
   then check https://aimblewood.github.io/covase-tools/ updated (Pages takes ~1 min). Revert after if you like.

In an emergency: describe the bug in a session on that repo. Claude reads CLAUDE.md,
edits the file in a cloud sandbox, pushes → live. Rollback = ask it to revert the commit.

## Step 3 — n8n from the phone (~5 min)

Option A (conversational — recommended): 
1. n8n → Settings → **MCP server / Connect** page → copy the Server URL (choose the claude.ai client instructions; one-click add exists).
2. claude.ai → Settings → **Connectors** → **Add custom connector** → paste URL → authenticate.
3. iPhone Claude app → any chat → enable the n8n connector in the tools menu → test:
   *"List my Covase workflows and show the last execution of the Supplier Reply Processor."*

Option B (manual): covase.app.n8n.cloud works in Safari on the iPad — executions list,
editor, publish all function. Workflow map + quirks are in CLAUDE.md §3.

Remember the rules: edits are drafts until **published**; never speed up the cron schedules.

## Step 4 — Supabase + bookmarks (~2 min)

On the iPad, bookmark:
- Platform: https://aimblewood.github.io/covase-tools/covase-platform.html
- Supabase dashboard (project `nlvlyfdsvgrdlcqksafb`) — SQL editor works fine in Safari
- n8n: https://covase.app.n8n.cloud
- Repo: https://github.com/aimblewood/covase-tools

Also confirm you can sign in to each on the iPad **before** leaving (2FA prompts are
much easier at home than at a beach bar).

## Step 5 — Chat archive (optional, 2 min)

Export this Cowork conversation from the app (share/export as text) and save it as
`docs/chat-archive-2026-09.txt` in the repo, commit, push. It's the searchable
"what exactly did we decide" record; CLAUDE.md is the working memory.

## Emergency cheat-sheet

| Symptom | Rail | First move |
|---|---|---|
| Platform broken / JS error | Claude Code (phone) | "Users report X on screen Y — find and fix, push" |
| Bad deploy | Claude Code | "Revert the last commit and push" |
| Replies/fines not coming in | Claude chat + n8n connector | "Show recent executions of <workflow>, diagnose the failure" |
| Email content wrong | Platform Settings → Email templates (works on iPad browser) | edit + save |
| Data fix | Supabase SQL editor | small targeted UPDATE, WHERE clause double-checked |
| Anything confusing | Claude chat | paste CLAUDE.md §3/§4 and describe the symptom |
