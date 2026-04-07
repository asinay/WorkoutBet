# Workout Bet App — Setup Guide

## Prerequisites
- [Supabase](https://supabase.com) account (free tier works)
- A static host: Netlify, Vercel, GitHub Pages, or just a local dev server

---

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a name (e.g. `workout-bet`) and strong database password
3. Wait ~2 minutes for provisioning

---

## 2. Run SQL Migrations

1. In Supabase Dashboard → **SQL Editor**
2. Paste the full contents of `sql_migrations.sql`
3. Click **Run**
4. Verify tables appear under **Table Editor**: `profiles`, `groups`, `group_members`, `workout_logs`

---

## 3. Configure Auth

1. Go to **Authentication → Providers → Email**
2. Ensure **Enable Email Provider** is ON
3. Enable **Magic Link** (disable password sign-in if desired)
4. Go to **Authentication → URL Configuration**
   - Add your site URL to **Site URL** (e.g. `http://localhost:8080` for local dev)
   - Add it to **Redirect URLs** as well

---

## 4. Get Your API Keys

1. Go to **Settings → API**
2. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon / public key** → `SUPABASE_ANON`

---

## 5. Configure app.js

Open `app.js` and replace the placeholders at the top:

```js
const SUPABASE_URL  = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_KEY';
```

---

## 6. Local Development

```bash
# Option A: Python (built-in)
python3 -m http.server 8080

# Option B: Node (npx)
npx serve .

# Option C: VS Code Live Server extension
# Right-click index.html → Open with Live Server
```

Then open `http://localhost:8080` in your browser.

> ⚠️ Magic link emails will redirect to whatever URL you set in Supabase → Auth → Redirect URLs.  
> For local dev, add `http://localhost:8080` as a redirect URL.

---

## 7. Deploy to Static Hosting

### Netlify (recommended)
1. Drag-and-drop your project folder at [app.netlify.com/drop](https://app.netlify.com/drop)
2. Copy the assigned URL (e.g. `https://your-app.netlify.app`)
3. Add that URL to Supabase → Auth → Site URL + Redirect URLs
4. Done!

### GitHub Pages
1. Push files to a GitHub repo
2. Settings → Pages → Deploy from branch `main` / `root`
3. Add the Pages URL to Supabase auth config

### Vercel
```bash
npm i -g vercel
vercel
```

---

## 8. Using the App

### Create a Group
1. Sign in via magic link
2. Tap **Create Group** → enter name and start date
3. Share the 6-character **join code** with friends

### Join a Group
1. Tap **Join Group** → enter the code

### Log a Workout
1. Open a group → **➕ Log** tab
2. Optional: tap **Upload Screenshot / Photo** to OCR-prefill from a fitness app screenshot
3. Verify/fill date, type, duration → **Save Workout**
4. After a successful save, the app returns to **🏆 Board** and shows a visible confirmation message

### Leaderboard
- **🏆 Board** tab shows all members ranked by workout days logged
- ✅ appears when a member hits 35 days
- Inline success/error messages appear as bordered status panels so they are easier to notice

### Log History
- **📋 History** tab shows the group's recent workout logs
- History is sorted by workout date, newest first
- Members can edit/remove their own logs
- Admins can edit/remove any log

### Admin Settings
- Only the group creator (admin) sees **⚙️ Admin**
- Change group name, start date, remove members
- Join code is displayed for sharing

---

## 9. OCR Tips

The OCR feature (powered by Tesseract.js) works best with:
- **Fitness app screenshots**: Apple Fitness, Strava, Garmin, Peloton summaries
- **Gym receipts** with date and duration
- **Clear, high-contrast images**

It attempts to parse:
- **Duration**: looks for `45 min`, `1:23:00`, `60 minutes` etc.
- **Workout type**: scans for keywords like `running`, `cycling`, `yoga`, `hiit`
- **Date**: looks for `MM/DD/YYYY` or similar formats

Always review prefilled values before saving.

Optional OCR.Space setup:
- This repo now includes an Edge Function at [supabase/functions/ocr-space/index.ts](/c:/AI_Apps/ClaudeWorkoutBet/supabase/functions/ocr-space/index.ts).
- In the Supabase Dashboard, open `Edge Functions` and add a secret named `OCR_SPACE_API_KEY`.
- In the Supabase Dashboard, create or edit a function named `ocr-space` and paste in the code from [supabase/functions/ocr-space/index.ts](/c:/AI_Apps/ClaudeWorkoutBet/supabase/functions/ocr-space/index.ts).
- Deploy the function from the Dashboard UI.
- The app will call the Edge Function first and fall back to Tesseract.js if the function is unavailable.
- This keeps the OCR.Space key out of the browser.

---

## GitHub Pages Deploy

This app can be hosted on GitHub Pages as a static site while Supabase continues handling auth, database access, and OCR via the `ocr-space` Edge Function.

Before publishing:
- Make sure the Supabase Edge Function `ocr-space` is deployed.
- Make sure the `OCR_SPACE_API_KEY` secret is set in Supabase.
- Keep using the publishable/anon key in [app.js](/c:/AI_Apps/ClaudeWorkoutBet/app.js). Do not expose a `service_role` key in frontend code.

Using GitHub Desktop:
1. Open GitHub Desktop.
2. Choose **File -> Add local repository**.
3. If this project is not already a repository, choose **Create a repository** and select this folder.
4. Publish the repository to GitHub.
5. In GitHub, open **Settings -> Pages** for the repository.
6. Under **Build and deployment**, choose **Deploy from a branch**.
7. Select your main branch and the root folder (`/`), then save.
8. Wait for the Pages deploy to finish and open the generated `github.io` site URL.

Notes:
- This repo includes a `.nojekyll` file so GitHub Pages serves it as a plain static site.
- Frontend file changes require a commit and push to trigger a new Pages deploy.
- Supabase Edge Function changes still need to be redeployed in Supabase separately.

---

## File Structure

```
/
├── index.html              # Single-page app shell
├── styles.css              # Dark mobile-first styles
├── app.js                  # All client logic
├── sql_migrations.sql      # Database schema + RLS
└── setup_docs.md           # This file
```

---

## Security Notes

- All data access is enforced server-side via **Row Level Security (RLS)**
- Users can only read/write data for groups they belong to
- Only admins can update group settings or remove members
- Users can edit/remove their own workout logs; admins can edit/remove any workout log in their group
- The anon key is safe to expose client-side — Supabase RLS is the security layer
- Never commit a service role key to client-side code
