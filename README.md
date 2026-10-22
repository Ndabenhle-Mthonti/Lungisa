# Lungisa

Lungisa is a property maintenance app for a landlord, the tenants in those flats, and the tradespeople who fix the problems. A tenant reports a leak or a dead plug with a photo. The landlord assigns the matching trade. The provider says they are on the way, then finishes the job with a proof photo. The tenant sees each step on their phone.

Maintenance requests usually get lost in calls and WhatsApp. Lungisa keeps one job, with a status, a photo of the problem, and a photo of the finished work.

Nobody signs themselves up. The landlord invites each tenant to a flat and each provider to a trade. After sign-in, a person lands on their own screen. Postgres Row Level Security is what keeps one tenant from reading another tenant's jobs. The screens only follow that rule.

The product spec is in [docs/PDR.md](docs/PDR.md).

## What each person can do

**Tenant.** Report a problem at their own flat. They choose Plumbing, Electrical, Lock, Appliance, or Other, describe it, and add a photo. Send stays off until the photo is there. Their home list then shows Pending, In Progress, a line such as **Plumber on the way**, or Done. On a finished job they can open the proof photo, or send it back with **Not fixed** and a short note.

**Landlord.** See how many jobs are new, in progress, and done this month. The jobs list shows the flat, the issue, the tenant's phone, the photo, and the status. A plumbing job offers **Assign to plumber**. An electrical job offers **Assign to electrician**. The same wording is used for a locksmith, appliance repair, and a general provider. Once the provider has started, the status reads **Plumber on the way** (or the matching trade). The landlord can change the provider until that person is on the way, and can open the full job with its timeline and both photos. On People they add flats, invite a tenant or a provider, and edit or remove a name, phone, and email. Removing a tenant frees that flat for the next person. Past jobs stay on the dashboard.

**Provider.** See only the jobs assigned to them and not yet done. Each card has the flat, the tenant's phone, a Call button, the issue, and the problem photo. **I am on my way** tells the tenant they have started. **Mark as done** needs a photo of the finished work. The job then leaves their list.

Photos are turned into a JPEG in the browser before upload, including pictures from an iPhone. Status changes show up on the other screens without a refresh. Pull down, or use **Refresh**, if the signal is poor.

## Try it

The live app is [https://lungisa-nine.vercel.app](https://lungisa-nine.vercel.app). It has no public sign-up, and the demo accounts below are not on that site. To click through landlord, tenant, and provider, run the app on your own computer against a free [Supabase](https://supabase.com) project and load the demo.

You need Node.js 20 or newer, npm, and a Supabase project. Use three browser windows, or one normal window and two private windows, so the three people can stay signed in at the same time.

1. Install and configure.

   ```bash
   npm install
   copy .env.example .env.local
   ```

   On macOS or Linux, use `cp .env.example .env.local`.

   In the Supabase dashboard, open **Project Settings → API**. Put the project URL in `VITE_SUPABASE_URL` and the anon public key in `VITE_SUPABASE_ANON_KEY`. Put the service role key in `SEED_SERVICE_ROLE_KEY`. That last key is only for the demo script. Do not commit `.env.local`, and do not put the service role key on Vercel.

2. In the Supabase **SQL Editor**, run every file in `supabase/migrations` once, in the order in [Migrations](#migrations). Paste one file, run it, then the next. Do not skip one.

3. Load the demo building, people, and jobs.

   ```bash
   node --env-file=.env.local scripts/seed.mjs
   ```

4. Start the app and open the address Vite prints, usually `http://localhost:5173`.

   ```bash
   npm run dev
   ```

5. Sign in with the password `LungisaDev123`.

   | Window | Role | Email | What opens |
   | --- | --- | --- | --- |
   | 1 | Tenant, Lerato, Flat 1A | `lerato@seed.lungisa.test` | Home |
   | 2 | Landlord, Thandi | `thandi@seed.lungisa.test` | Dashboard |
   | 3 | Provider, Sipho, plumber | `sipho@seed.lungisa.test` | My Jobs Today |

6. Walk through one job.

   - As Lerato, choose **+ Report New Problem**. Pick Plumbing, describe it, add any photo, and choose **Send to Landlord**.
   - As Thandi, find that row. The action says **Assign to plumber**. Choose Sipho and assign him.
   - As Sipho, open the new card and choose **I am on my way**. Lerato's list changes to **Plumber on the way**.
   - As Sipho, add a photo of the finished work and choose **Mark as done**. Lerato sees Done and the proof photo. Thandi's Done count goes up.

The seed also creates Nokuthula (`nokuthula@seed.lungisa.test`, Flat 4B), Andile (`andile@seed.lungisa.test`, Flat 7C), Themba the electrician (`themba@seed.lungisa.test`), and Jabu the locksmith (`jabu@seed.lungisa.test`). Same password.

Inviting a new person, and editing or removing someone, also needs the Edge Functions deployed on that Supabase project:

```bash
supabase functions deploy invite-user
supabase functions deploy manage-person
```

The report, assign, on-the-way, and done loop above works without those two functions.

Do not run `scripts/seed.mjs` or `scripts/seed-load.mjs` against the live site's database. `seed-load.mjs` inserts 100,000 fake jobs.

## Environment variables

Names only. Do not put the values in this file or in git.

| Name | Where it is set |
| --- | --- |
| `VITE_SUPABASE_URL` | `.env.local` for local development. Vercel project settings for a deploy. The production build reads this URL and no other. |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` and Vercel. Public anon key. Safe in the browser. |
| `SEED_SERVICE_ROLE_KEY` | `.env.local` only, for `scripts/seed.mjs`, `scripts/seed-load.mjs`, and `scripts/clearload.mjs`. Never set this on Vercel and never prefix it with `VITE_`. |

`invite-user` and `manage-person` read `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from their own secrets. Those stay on Supabase, not in the React app.

## Migrations

Run every file in `supabase/migrations` once, in this order, on a new project. The Supabase SQL editor is enough: open the file, paste it, and run it. Do not skip a file. `0005_disable_rls.sql` turns Row Level Security off so the following files can create policies, and `0007_rls.sql` turns it back on.

1. `0001_tables.sql`
2. `0002_indexes.sql`
3. `0003_triggers_and_stats.sql`
4. `0004_grants.sql`
5. `0005_disable_rls.sql`
6. `0006_extra_columns.sql`
7. `0007_rls.sql`
8. `0008_storage.sql`
9. `0009_report_photo_upload.sql`
10. `0010_tenant_home.sql`
11. `0011_not_fixed.sql`
12. `0012_invites_created_at.sql`
13. `0013_reassign.sql`
14. `0014_provider_units.sql`
15. `0015_load_test_jobs.sql`
16. `0016_landlord_stats.sql`
17. `0017_provider_open_jobs.sql`
18. `0018_reopen_note.sql`
19. `0019_privacy_notice.sql`
20. `0020_people.sql`
21. `0021_spec_gaps.sql`

`0020_people.sql` is safe to run again. It lets a landlord edit or remove a tenant or a provider. `0021_spec_gaps.sql` lets the landlord mark a job urgent after it is reported, and shows the tenant's Not fixed note to the provider.

## Security check

With the app pointed at a project that already has the demo accounts and the migrations above:

```bash
npm run security:check
```

The script signs in with the anon key and checks that blocked reads and writes stay blocked. It does not read the service role key. A passing run reopens one finished job and reassigns one assigned job, so the dashboard counts will move.

## Host

`vercel.json` sends every path to `index.html` so routes such as `/tenant` and `/landlord/people` load the app. It also sets:

- `Content-Security-Policy`, so the browser may talk only to this site and to the Supabase project named there (API, realtime, and photo storage). Photo previews use `blob:` on this site.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

The policy host must be the same Supabase project as `VITE_SUPABASE_URL`. A deploy to a different project has to change both.
