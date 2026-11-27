# SkillTrack – CodeTantra trainer upskilling tracker

Live site: https://skilltrack-ruby.vercel.app

## What's in here
| Path | What it is |
|---|---|
| `app/` | The website (React + Vite + Tailwind). Talks to Supabase directly. |
| `app/src/lib/supabase.js` | Supabase project URL + publishable key + allowed email domain |
| `supabase/schema.sql` | Database tables, security rules, sign-up domain check, views. Safe to re-run. |
| `supabase/functions/leetcode-sync/index.ts` | Edge Function that pulls public LeetCode stats + recent solved problems |
| `supabase/schedule.sql` | Runs the sync every 2 hours (pg_cron) |
| `supabase/make-admin.sql` | Promote a user to admin |

## Change the website
```bash
cd app
npm install
npm run dev      # local preview at http://localhost:5173
npm run build    # output in app/dist
```

## Deploy
Vercel builds this repo automatically on every push to `main`
(Root Directory `app`, Framework Vite, build `npm run build`, output `dist`).

## Supabase settings used
- Authentication → Sign In / Providers: Email on, Confirm email on
- Authentication → URL Configuration → Site URL: https://skilltrack-ruby.vercel.app
- Edge Functions → leetcode-sync → "Verify JWT with legacy secret": OFF
