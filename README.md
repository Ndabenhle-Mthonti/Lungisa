# Lungisa

Lungisa is a property maintenance app. A tenant reports a problem with a photo, the landlord assigns a provider, and the provider marks the job on the way and then done with a proof photo. Each person signs in with email and password and only sees their own rows. Postgres Row Level Security enforces that.

The product spec is in [docs/PDR.md](docs/PDR.md).

## Run it locally

Requirements: Node.js 20 or newer, npm, and a Supabase project.

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy the environment file and fill in the two public values from the Supabase project settings (Project URL and the anon key). Leave the service role key only if you will run the local seed script.

   ```bash
   copy .env.example .env.local
   ```

   On macOS or Linux, use `cp .env.example .env.local`.

3. Apply the SQL migrations. See [Migrations](#migrations).

4. Optional: load demo people and jobs on the development project.

   ```bash
   node --env-file=.env.local scripts/seed.mjs
   ```

5. Start the app. Vite prints a local URL, usually `http://localhost:5173`.

   ```bash
   npm run dev
   ```

`.env.local` is gitignored. Do not commit real keys.

## Environment variables

Names only. Do not put the values in this file or in git.

| Name | Where it is set |
| --- | --- |
| `VITE_SUPABASE_URL` | `.env.local` for local development. Vercel project settings for production. This is the only Supabase URL the production build reads. |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` and Vercel. Public anon key. Safe in the browser. |
| `SEED_SERVICE_ROLE_KEY` | `.env.local` only, for `scripts/seed.mjs`, `scripts/seed-load.mjs`, and `scripts/clearload.mjs`. Never set this on Vercel and never prefix it with `VITE_`. |

The invite Edge Function reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from its own secrets. Those stay on Supabase, not in the React app.

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

Do not run `scripts/seed-load.mjs` against a production project. It inserts 100,000 fake jobs.

## Security check

With the app pointed at a project that already has the demo accounts and the migrations above:

```bash
npm run security:check
```

The script signs in with the anon key and checks that blocked reads and writes stay blocked. It does not read the service role key. A passing run reopens one finished job and reassigns one assigned job, so the dashboard counts will move.

## Demo accounts

These exist only after `scripts/seed.mjs` has run on that project. Every password is `LungisaDev123`.

| Role | Person | Email |
| --- | --- | --- |
| Landlord | Thandi | `thandi@seed.lungisa.test` |
| Tenant | Lerato, Flat 1A | `lerato@seed.lungisa.test` |
| Provider | Sipho, plumber | `sipho@seed.lungisa.test` |

The seed also creates tenants Nokuthula (`nokuthula@seed.lungisa.test`, Flat 4B) and Andile (`andile@seed.lungisa.test`, Flat 7C), and providers Themba (`themba@seed.lungisa.test`, electrician) and Jabu (`jabu@seed.lungisa.test`, locksmith).

Do not load these accounts into the production project.

## Host

`vercel.json` sends every path to `index.html` so React Router routes such as `/tenant` and `/landlord/people` load the app. It also sets:

- `Content-Security-Policy`, so the browser may talk only to this site and to `https://YOUR_PROJECT_REF.supabase.co` (API, realtime, and photo storage). Photo previews use `blob:` on this site.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

Before the first production deploy, replace `YOUR_PROJECT_REF` in `vercel.json` with the new Supabase project ref. The ref is the subdomain of the project URL.
