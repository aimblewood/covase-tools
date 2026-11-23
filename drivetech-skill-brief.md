# Brief: Drivetech browser skills for Covase Tools

Paste this into the browser-skill chat, then walk Claude through adding one real driver (Bella Williams, CVN-0001) in Fleet Risk Manager so it can learn the Drivetech screens.

## Background

Covase manages company cars for clients such as the Woodland Trust. When a driver joins a client's car scheme, Covase Tools opens an onboarding case (reference `CVN-nnnn`). Two jobs on each case happen in **Drivetech's Fleet Risk Manager** (https://www.fleetriskmanager.com). Drivetech has no API, so these are browser jobs. You do them in Simon's own browser, where he is already logged in to both systems.

Your instructions always come from **Claude's to-do list** in Covase Tools:

**https://aimblewood.github.io/covase-tools/covase-platform.html#claude-todo**

The list opens at the top of the Driver onboarding screen. If it's folded shut, click "🤖 Claude's to-do list". It has two columns. Each job is a box headed with the job and the driver's name, then labelled details (Case, Client, First name, Surname, Preferred name, Email, Mobile, Job title, Start date, Vehicle), a **Note** box and buttons.

## Skill 1: Add drivers to Drivetech

For each box in the **"Add to Drivetech"** column, one at a time:

1. Click **Started**.
2. In Fleet Risk Manager, first **search for the driver** by email, then by name. If they're already there, don't add them again. Type "Already on Drivetech" in the Note box and click **Done – driver added**.
3. Otherwise add them under the right client, using exactly the details in the box. *(The steps get filled in here when Simon shows you the screens.)* This sends Drivetech's enrolment email and registration key to the driver.
4. Back in Covase Tools, type a short note in the Note box (e.g. "Added, enrolment email sent") and click **Done – driver added**.

## Skill 2: Check licence status (daily)

For each box in the **"Licence checks to look up"** column:

1. Find the driver in Fleet Risk Manager and look at their licence check status.
2. Type what Drivetech shows in the Note box, then click:
   - **Licence check passed** if the check is complete and clear;
   - **Not complete yet** if they haven't registered or submitted yet;
   - **Problem** for anything else (points or endorsements flagged, check failed, licence issue).
3. **Nominees:** if the driver has added any nominees on their account, type each nominee's name and their check status into the two nominee boxes and click **Save nominee**, once per nominee. This is for Simon's oversight only; it never blocks anything.

## Rules (always)

- **Never guess.** If a search finds more than one possible match, or the details don't agree (e.g. a different email), do nothing in Drivetech. Write what you found in the Note box and click **Problem**.
- **Stop and click Problem** if Drivetech logs you out, asks for a security code, shows an error, or looks different from what you were shown. Say what happened in the note.
- Only use the details in the job box. Don't change anything else in Drivetech or Covase Tools.
- One job at a time. Wait until a button press has saved (a green "Recorded" message) before moving on.
- When both columns say "Nothing waiting", you're finished.
