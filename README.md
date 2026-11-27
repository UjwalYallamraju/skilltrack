# SkillTrack – CodeTantra trainer upskilling tracker

Live site: https://skilltrack-ruby.vercel.app

## What's in here
| Path | What it is |
|---|---|
| `app/` | The website (React + Vite + Tailwind). Talks to Supabase directly. |
| `app/src/lib/supabase.js` | Supabase URL + publishable key, Clerk publishable key, allowed email domain |
| `supabase/schema.sql` | Database tables, security rules, sign-up domain check, views. Safe to re-run. |
| `supabase/functions/leetcode-sync/index.ts` | Edge Function that pulls public LeetCode stats + recent solved problems |
| `supabase/schedule.sql` | Runs the sync every 2 hours (pg_cron) |
| `supabase/make-admin.sql` | Promote a user to admin |
| `supabase/migrations/002_groups.sql` | Groups: tables, group leads, and "see only your groups" rules |
| `supabase/migrations/003_clerk.sql` | Switch sign-in to Clerk: text user ids, `ensure_profile()`, rules on Clerk tokens |

## Groups
- The admin creates groups on the **Groups** page and adds trainers (a trainer can be in several groups).
- Trainers see only the people who share a group with them. The admin sees everyone.
- Group leads see their groups and can set daily LeetCode targets for their members on **Team Members**.

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

## Sign-in (Clerk)
- Clerk app **SkillTrack** (development instance: up to 100 users, 100 emails/month).
- Sign-up: email + password, email verified by code, first and last name required.
- Access mode → Allowlist: `*@codetantra.in` (the database also refuses other domains).
- Sessions → Customize session token: `{"role": "authenticated", "email": "{{user.primary_email_address}}", "name": "{{user.full_name}}"}`
- Supabase → Authentication → Third-Party Auth → Clerk: `https://cuddly-glowworm-2300.clerk.accounts.dev`
- On first sign-in the app calls `ensure_profile()`, which creates the profile (or re-links a pre-Clerk profile with the same email).

## Supabase settings used
- Edge Functions → leetcode-sync → "Verify JWT with legacy secret": OFF
