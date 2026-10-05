# Lungisa: Property Maintenance System – PDR

Oct 5, 2026 · Ndabenhle Mthonti

## 1. Overview

Lungisa is a React + Supabase web app that takes a maintenance problem from tenant report, to landlord assignment, to provider proof-of-fix, with every person seeing only their own data. The MVP ships in 14 days: Day 1 is Monday 5 Oct 2026, Day 14 is Sunday 18 Oct 2026.

**Problem.** Maintenance requests get lost in calls and WhatsApp chats. Landlords cannot see what is urgent, tenants do not know the status, providers get vague instructions, and nobody has proof the work was done.

**Core flow.** Tenant reports with a photo, landlord assigns a provider, provider taps "I am on my way", fixes it, uploads a proof photo, and the tenant sees Done.

**Status model (assumption).** Four stored statuses keep the three roles consistent: `pending` → `assigned` → `on_the_way` → `done`. The landlord's "In Progress" count is `assigned` + `on_the_way`. The tenant sees Pending (red), In Progress (yellow), "Provider is on the way" (yellow) and Done (green).

### Success metrics

| Metric | Target |
| --- | --- |
| Tenant report time (login to sent) | Under 60 seconds |
| Landlord assigns a job | 2 clicks, under 15 seconds |
| Page load on a mid-range phone, 4G | Under 2 seconds |
| Jobs in the database with no visible slowdown | 100,000+ |
| Cross-user data leaks found in security tests | 0 |
| Working MVP deployed | Sunday 18 Oct 2026 |

### MVP scope

- Three roles with email + password login: landlord, tenant, provider
- Landlord dashboard: stats cards, jobs table, assign modal, job details
- Tenant app: My Requests list and Report New Problem form (photo mandatory)
- Provider app: My Jobs Today with call, view photo, on my way, mark done with proof photo
- Live status updates through Supabase Realtime, plus pull-to-refresh as a fallback
- Landlord can add units and invite tenants and providers

### Non-goals for the MVP

- Payments (providers are paid offline), rent tracking, invoicing
- WhatsApp or SMS notifications (planned after launch)
- Chat between users, ratings, multi-landlord marketplace
- Native mobile apps (the web app is mobile-first and installable as a PWA later)

## 2. Users and roles

Each role gets a deliberately small app, and the database itself (not just the screens) enforces what each role can see.

| Role | Persona | Sees | Can do | Must never see or do |
| --- | --- | --- | --- | --- |
| Landlord | Busy owner, checks the dashboard between other work | Stats cards, every job in his properties, tenant name and phone, photos, provider list | Assign providers, view job details and proof photos, add units, invite tenants and providers | Other landlords' data |
| Tenant | Frustrated, wants the tap fixed, will not learn an app | Only his own unit and his own requests, with photos and status | Report a problem (photo required), open his own requests | Other tenants' jobs, provider list, landlord stats |
| Provider | Tradesperson on his phone, often outdoors | Only jobs assigned to him: unit, tenant name and phone, issue, photo | Call tenant, tap "I am on my way", mark done with proof photo | Pending or other providers' jobs, rent, other providers, assigning jobs |

**Role routing.** After login the app reads the user's role and sends them to one place: `/landlord`, `/tenant` or `/provider`. Visiting another role's URL redirects back. The redirect is only convenience; the real protection is in section 6.

**Account creation.** Nobody self-registers. The landlord signs up once; he then invites tenants (tied to a unit) and providers (tied to a trade) by email. This stops strangers from creating accounts and keeps the unit auto-fill reliable.

## 3. Functional requirements

Every requirement has an ID so you can tick it off during testing. "Must" means the MVP is not done without it.

### Landlord dashboard (`/landlord`)

| ID | Requirement | Priority |
| --- | --- | --- |
| L1 | Three stat cards at the top: New (pending, not assigned), In Progress (assigned + on the way), Done this month. Counts come from one database query, not from loading all jobs. | Must |
| L2 | Jobs table with columns: Flat/Unit, Issue, Tenant (name + phone), Photo thumbnail, Status badge, Action. | Must |
| L3 | Clicking a thumbnail opens the full photo in a lightbox. | Must |
| L4 | Status badge colours: Pending red, Assigned yellow, Done green. On the way shows yellow with its own label. | Must |
| L5 | Action button: "Assign Provider" if pending, "View Details" otherwise. | Must |
| L6 | Assign modal: provider dropdown (name + trade, e.g. "Sipho - Plumber"), "Assign Now" button. On click the job becomes `assigned` and the provider sees it immediately. | Must |
| L7 | Job details page: issue, tenant, assigned provider, timeline of status changes, tenant photo and proof photo. | Must |
| L8 | Table is sorted pending first, then newest, with filter by status and search by unit. Loads 20 rows at a time. | Should |
| L9 | Add units, and invite tenants and providers by email. | Must |

### Tenant app (`/tenant`): two screens only

| ID | Requirement | Priority |
| --- | --- | --- |
| T1 | Home: a big "+ Report New Problem" button, then his own requests as a simple list: issue, area, coloured status, reported date. No stats, no tables. | Must |
| T2 | Tapping a request shows the details and the photo he uploaded, plus the proof photo once done. | Must |
| T3 | Report form: category (Plumbing, Electrical, Lock, Appliance, Other), unit auto-filled and read-only, short description, big camera button. | Must |
| T4 | Photo is mandatory: the Send button stays disabled until a photo is attached. The database also rejects a job with no photo path. | Must |
| T5 | On the phone the camera button opens the camera directly. Photos are compressed in the browser before upload (target under 400 KB). | Must |
| T6 | After sending: "Sent! Your landlord has been notified. We will update you here." and he returns to Home. | Must |
| T7 | His list updates live when the status changes, including "Provider is on the way". | Must |

### Provider app (`/provider`): one screen only

| ID | Requirement | Priority |
| --- | --- | --- |
| P1 | One list titled "My Jobs Today" showing only jobs assigned to him and not done. | Must |
| P2 | Each job is a large card: Flat and trade, tenant name and phone with a Call button (`tel:` link), issue text, big "View Photo" button, current status. | Must |
| P3 | "I AM ON MY WAY" sets the job to `on_the_way`; the tenant's screen changes to "Provider is on the way". | Must |
| P4 | "MARK AS DONE + UPLOAD PROOF PHOTO" is disabled until a proof photo is taken. On success the job becomes `done` and leaves his list. | Must |
| P5 | Pull-to-refresh and a refresh button, plus live updates when Realtime is connected. | Must |

### Status flow

1. Tenant sends the report: job is created as `pending`, landlord stat "New" goes up.
2. Landlord clicks Assign Now: `pending` becomes `assigned`, with the provider and time saved.
3. Provider taps I am on my way: `assigned` becomes `on_the_way`.
4. Provider uploads proof and marks done: `on_the_way` becomes `done`, with proof photo path and completion time saved.

No other transitions are allowed. A database trigger rejects skipped or backwards moves, and every change is written to a `job_events` history table.

### Edge cases to handle

- Assign clicked twice, or two tabs open: the update only works if the job is still `pending`, so the second click shows "Already assigned".
- Photo upload fails on weak signal: keep the form filled, show a retry button, never lose the description.
- Provider has no jobs: show "No jobs assigned to you today."
- Tenant with no requests: show only the big button and a short friendly line.

## 4. Architecture and tech stack

Lungisa is one React app talking directly to Supabase, so there is no custom server to run, patch or secure.

**Every request passes through Supabase, where RLS decides who sees what**

**React app (in the browser)**

- **Landlord (/landlord)**
  - Stats cards, jobs table, assign modal, job details
- **Tenant (/tenant)**
  - My requests list, report form with photo
- **Provider (/provider)**
  - My Jobs Today, call, on my way, proof photo

**requests** →

← **live updates**

**Supabase (backend)**

- **Auth**
  - Email + password, role in profiles
- **Postgres + Row Level Security**
  - 6 tables, rules per role
- **Storage**
  - Private photo buckets, signed links
- **Realtime**
  - Live status, filtered by RLS
- **Edge Function**
  - Invites (service key stays here)

The browser holds only the public key. Tables and photos are protected by rules inside Supabase.

architecture · React app and Supabase services

The browser holds only the public key; the database rules, not the screens, decide who sees what. Only the invite function uses the powerful service key.

### Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React + Vite | Fast to build, small bundles |
| Routing | React Router | Role-based routes and guards |
| Data fetching | `supabase-js` + TanStack Query | Caching, background refresh, optimistic updates |
| Styling | Tailwind CSS (or CSS Modules) | Quick mobile-first layouts |
| Forms | React Hook Form + Zod | Fast, validated forms |
| Photos | `browser-image-compression` | Shrinks photos and removes location data before upload |
| Backend | Supabase: Postgres, Auth, Storage, Realtime, Edge Functions | Everything needed, with security built in |
| Hosting | Vercel or Netlify | CDN, HTTPS, preview links |
| Testing | Vitest | Quick unit tests |

### Project structure

```text
src/
  app/          routes, role guard, providers
  features/
    auth/       login, session, useRole
    tenant/     HomePage, ReportForm, RequestDetails
    landlord/   Dashboard, StatsCards, JobsTable, AssignModal, JobDetails, People
    provider/   MyJobs, JobCard
  components/   Button, StatusBadge, PhotoViewer, Modal
  lib/          supabaseClient, image helpers, formatters
  types/        generated database types
supabase/
  migrations/   SQL for tables, RLS, triggers, indexes
  functions/    invite-user
  seed.sql
```

### Key technical decisions

- **Migrations in Git.** Every database change is a SQL file in `supabase/migrations`, so the production setup can be rebuilt and nothing is changed by hand.
- **Two Supabase projects:** one for development and testing, one for production.
- **Generated types.** Create TypeScript types from the database so the frontend and the status and category lists never drift apart.
- **One data layer.** All Supabase calls live in `features/*/api.ts` files, never inside components, so queries are easy to find and test.

## 5. Database design

Six tables in Supabase Postgres. Jobs carry `landlord_id` directly, even though it could be looked up through the unit, so security rules and dashboard queries stay fast without joins.

| Table | Key columns | Purpose |
| --- | --- | --- |
| `profiles` | `id` (= auth user id), `role` (landlord / tenant / provider), `full_name`, `phone`, `landlord_id`, `unit_id` (tenants), `trade` (providers) | One row per login; the role lives here, never in browser-editable metadata |
| `properties` | `id`, `landlord_id`, `name`, `address` | Buildings the landlord owns |
| `units` | `id`, `property_id`, `landlord_id`, `label` ("Flat 4B") | Flats; tenants are linked to one |
| `jobs` | `id`, `landlord_id`, `unit_id`, `tenant_id`, `provider_id` (null until assigned), `category`, `description`, `photo_path`, `proof_photo_path`, `status`, `created_at`, `assigned_at`, `on_the_way_at`, `completed_at` | The heart of the system |
| `job_events` | `id`, `job_id`, `from_status`, `to_status`, `actor_id`, `created_at` | Audit trail, filled by a trigger |
| `invites` | `id`, `email`, `role`, `landlord_id`, `unit_id`, `trade`, `used_at` | Pending invitations |

### Rules enforced in the database

- `status` is an enum: `pending`, `assigned`, `on_the_way`, `done`. `category` is an enum: plumbing, electrical, lock, appliance, other.
- `photo_path` is `NOT NULL` with a check that it is not empty, so a report without a photo cannot exist even if the frontend is bypassed.
- A trigger on `jobs` only allows the four forward transitions, requires `provider_id` for `assigned`, and requires `proof_photo_path` for `done`.
- Foreign keys use `ON DELETE RESTRICT` for jobs, so history is never lost by deleting a unit. Deleting is replaced by a `deleted_at` column where needed.

### Indexes (what makes it fast at 100,000+ jobs)

| Index | Serves |
| --- | --- |
| `jobs (landlord_id, status, created_at DESC)` | Landlord table, filters and stats cards |
| `jobs (tenant_id, created_at DESC)` | Tenant request list |
| `jobs (provider_id, status)` partial, where status is not `done` | Provider "My Jobs Today" |
| `jobs (unit_id)` | Unit history on job details |
| `job_events (job_id, created_at)` | Timeline on job details |
| `profiles (landlord_id, role)` | Provider dropdown and tenant lists |

### Stats query

The three stat cards come from one SQL function that returns all three counts using `count(*) filter (where ...)`, so the dashboard never downloads the job list just to count it. The "Done this month" count uses `completed_at >= date_trunc('month', now())`.

### Storage buckets

- `job-photos` (private): tenant report photos, path `landlord_id/job_id/report.jpg`
- `proof-photos` (private): provider proof photos, path `landlord_id/job_id/proof.jpg`
- Images are shown through short-lived signed URLs (about 60 minutes), never public links.

## 6. Security and data protection

The rule is simple: the browser is never trusted. Every protection below is enforced by Supabase (Postgres Row Level Security, Auth, Storage policies), so a hacked or edited frontend still cannot read someone else's data.

### Row Level Security (RLS)

Turn RLS on for every table and add no "allow all" policies. A helper function `app_role()` reads the caller's role from `profiles`.

| Table | Landlord | Tenant | Provider |
| --- | --- | --- | --- |
| `jobs` read | Rows where `landlord_id` = his id | Rows where `tenant_id` = his id | Rows where `provider_id` = his id |
| `jobs` insert | No | Yes, only with his own `tenant_id`, his own unit, status `pending` and a photo path | No |
| `jobs` update | Assign only: set provider, pending to assigned | No | Only his own jobs: assigned to on the way, on the way to done |
| `profiles` read | His tenants and providers | Only his own row | Only his own row, plus the tenant on a job assigned to him (name and phone) |
| `units`, `properties` | Own rows, full access | Read his own unit only | No access |
| `job_events` | Read for his jobs | Read for his jobs | Read for his jobs |

What a provider may do (and what a tenant must not see, such as the provider list) is enforced here, not by hiding buttons. Tenant phone numbers reach a provider only through the job he is assigned to.

### Authentication

- Supabase Auth with email + password, minimum 8 characters, email confirmation on, and leaked-password protection enabled.
- Role is stored in `profiles`, written only by the invite function using the service role. Users cannot change their own role.
- Session tokens refresh automatically; logout clears the session on that device.
- Rate limits on login and invite endpoints (Supabase Auth limits plus a cap on the invite function).

### Files and photos

- Both buckets are private. Storage policies check the first folder in the path matches the user's landlord, and tenants may only upload to their own job path.
- Allow only JPEG and PNG, maximum 5 MB per file, checked in the bucket settings and in the browser.
- Strip photo location data (EXIF) during the browser compression step, so tenants' home locations are not stored in image files.

### Application security

- Only the Supabase `anon` key goes in the React app. The `service_role` key lives only in Edge Functions and is never committed.
- Secrets go in environment variables (`.env.local` ignored by git; production values in the host's settings).
- React escapes text by default; never use `dangerouslySetInnerHTML` with user text.
- HTTPS only, plus security headers on the host (Content-Security-Policy, X-Content-Type-Options, Referrer-Policy).
- Validate inputs twice: in the form (for friendly errors) and in the database (check constraints, length limits).

### Privacy (POPIA)

Lungisa holds personal information (names, phone numbers, photos of homes), so it falls under South Africa's POPIA. For the MVP:

- Collect only what is needed: name, phone, unit, job details. No ID numbers, no rent amounts.
- Show a short privacy notice at first login explaining what is stored and why, with a contact email.
- Allow a tenant or provider to request deletion: the landlord removes the profile and anonymises old jobs.
- Enable Supabase daily backups, and choose the project region closest to South Africa to keep latency low.

### Security tests before launch

- Log in as tenant A and try to read tenant B's jobs through the browser console: must return no rows.
- As a provider, try to read an unassigned job, call `update` to assign yourself, and open another provider's photo URL: all must fail.
- As a tenant, try to read the provider list and landlord stats: must fail.
- Try to upload a job with no photo straight through the API: must be rejected.

## 7. Performance and scalability

Speed on a phone with weak signal matters more than raw server power. These choices keep the app fast as data grows.

- **Paginate everything.** Lists load 20 rows at a time using keyset pagination ("jobs older than this timestamp"), not page numbers, which stay fast on huge tables. Add a "Load more" button.
- **Select only needed columns.** The landlord table asks for unit, issue, tenant name, phone, status and the thumbnail path, never whole rows with long text.
- **Count in the database.** Stats cards use the single stats function from section 5.
- **Small images.** Compress in the browser to about 1280 px wide JPEG, quality 0.7, so photos are 200-400 KB instead of 5 MB. Landlord thumbnails use Supabase image transformations (about 120 px) instead of downloading the full photo.
- **Lazy loading.** Split React code by route so a tenant never downloads the landlord dashboard. Use `React.lazy` and `loading="lazy"` on images.
- **Cache and refetch smartly.** Use TanStack Query: cached lists show instantly, then refresh in the background; mutations update the cache immediately (optimistic updates).
- **Targeted Realtime.** Each role subscribes only to its own rows (landlord by `landlord_id`, tenant by `tenant_id`, provider by `provider_id`). RLS also applies to Realtime, so no one receives other people's changes.
- **Offline-friendly forms.** Keep the report draft in memory and show a clear "No connection, retry" message instead of an error screen.
- **Region and hosting.** Pick the Supabase region nearest to South Africa and deploy the React build to a CDN host (Vercel or Netlify) for fast static delivery.

### Capacity plan

The free Supabase tier is enough to build and demo. Before real landlords use it, move to the Pro plan for daily backups and more storage. Later, if photos grow, add a 12-month archive for old proof photos. With the indexes in section 5, Postgres handles hundreds of thousands of jobs without special tuning.

### Performance checks

- Seed 100,000 fake jobs and confirm the landlord dashboard still loads in under 2 seconds.
- Run Lighthouse on `/tenant` and `/provider` with mobile throttling; aim for a performance score of 85 or higher.
- Use `EXPLAIN ANALYZE` on the three main queries and confirm each one uses an index.

## 8. UX and design guidelines

One design system, three very different experiences. Build with plain CSS modules or Tailwind and a handful of shared components (Button, StatusBadge, PhotoViewer, Modal, Spinner).

| Area | Landlord | Tenant | Provider |
| --- | --- | --- | --- |
| Device | Laptop first, works on phone | Phone only, one thumb | Phone only, outdoors, sometimes gloves |
| Layout | Stat cards, then table | One big button, then a simple list | One column of huge cards |
| Button size | Standard (40 px high) | Large (56 px high) | Extra large (64 px high), full width |
| Text | 14-16 px | 16-18 px | 18 px or larger |
| Screens | Dashboard, job details, people | Home, report form, request details | My Jobs Today |

### Shared rules

- **Status colours are the same everywhere:** Pending red `#D93025`, In Progress / Assigned / On the way yellow `#F9AB00`, Done green `#1E8E3E`. Always show the word as well as the colour, so colour-blind users are not left guessing.
- **One main action per screen.** The tenant sees one big button; the provider sees the next step only ("I am on my way", then "Mark as done").
- **Plain language, no jargon.** "Send to Landlord", not "Submit ticket".
- **Always confirm.** Success messages after send, assign and done; clear retry messages on errors.
- **Loading states.** Skeleton rows for the table and cards, so the page never looks frozen.
- **Accessibility basics.** Contrast ratio of at least 4.5:1, labels on every field, buttons reachable by keyboard, alt text on photos.
- **Mobile-first.** Design at 375 px width first, then widen for the landlord's desktop table.

### Tenant form: the 30-second rule

Order the form by effort: pick category (one tap), unit already filled, camera button, optional short text. Description is the only typing and is allowed to be short. The Send button stays grey until the photo exists and turns solid when ready.

## 9. 14-day build plan

The plan builds the foundation (database and security) before the screens, then one role at a time, in the order the data flows: tenant, landlord, provider. Plan for about 4-6 focused hours a day. Day 7 and Day 12 are the safety buffers.

| Day | Date | Focus | Done when |
| --- | --- | --- | --- |
| 1 | Mon 5 Oct | Setup: Vite + React + React Router, Supabase project (nearest region), Git repo, environment variables, folder structure, colour and button tokens | App runs locally and connects to Supabase |
| 2 | Tue 6 Oct | Database: tables, enums, indexes, status trigger, `job_events` trigger, stats function, seed data (1 landlord, 3 tenants, 3 providers, 50 jobs) | Seed data visible in the Supabase table editor |
| 3 | Wed 7 Oct | Auth: login page, `profiles` row on signup, role routing, protected routes, logout | Each role logs in and lands on its own area |
| 4 | Thu 8 Oct | Security: RLS policies on all tables, storage buckets and policies, test each role in the SQL editor | A tenant cannot read another tenant's job |
| 5 | Fri 9 Oct | Tenant report form: category, auto-filled unit, camera input, photo compression, upload, create job | A report with photo lands as `pending` |
| 6 | Sat 10 Oct | Tenant Home list and request details, status badges, success message, empty state | Tenant flow works end to end |
| 7 | Sun 11 Oct | Buffer and review of the tenant flow, plus invite Edge Function and "People" form for the landlord | A new tenant can be invited and can log in |
| 8 | Mon 12 Oct | Landlord dashboard: stats cards, jobs table with pagination, thumbnails, lightbox, loading skeletons | Table matches the seed data; stats are correct |
| 9 | Tue 13 Oct | Assign modal (guarded update), job details page, status timeline | Assigning moves job to `assigned` once only |
| 10 | Wed 14 Oct | Provider app: My Jobs Today cards, Call button, View Photo, "I am on my way" | Provider sees only his jobs; tenant sees "on the way" |
| 11 | Thu 15 Oct | Provider proof upload and Mark Done, Realtime for all three roles, pull-to-refresh | Full flow works with three browsers open |
| 12 | Fri 16 Oct | Buffer: security test script, 100,000-job performance test, `EXPLAIN` checks, fix findings | Section 6 and 7 checks all pass |
| 13 | Sat 17 Oct | Polish: mobile layout, empty and error states, accessibility pass, privacy notice, test on real phones | A first-time user finishes the tenant flow in under 60 seconds |
| 14 | Sun 18 Oct | Deploy to Vercel or Netlify, production Supabase settings, headers, backups, smoke test, README, demo recording | Live URL works for all three roles |

### Milestone gates

- **End of Day 4:** database and security are solid. Do not start screens until a tenant provably cannot see another tenant's data.
- **End of Day 7:** tenant flow complete.
- **End of Day 11:** full tenant to landlord to provider to tenant loop works.
- **End of Day 14:** deployed and tested.

### If you fall behind, cut in this order

1. Landlord search and status filters (L8)
2. Status timeline on job details (keep the data, skip the UI)
3. People form: invite people by SQL or the Supabase dashboard instead
4. Optimistic updates (keep plain refetching)

Never cut: mandatory photos, RLS policies, the guarded status transitions, or the security tests.

### Daily routine

- Start each day by writing the day's goal in one line, and end it by committing to Git with a clear message.
- Test the feature as each role before moving on; don't leave testing for the end.
- Keep a short `BUGS.md` list; fix blockers the same day and park the rest for Day 12-13.

## 10. Testing, launch, risks and roadmap

### Testing

- **Manual role walkthrough (every day):** run the full loop with three browser profiles, one per role.
- **Security tests:** the four checks in section 6, repeated on the production project before launch.
- **Unit tests (light):** status badge mapping, photo compression helper, form validation. Use Vitest; do not aim for full coverage in 14 days.
- **Device tests:** one Android phone and one iPhone (or Safari) for the camera input, plus Chrome on desktop for the landlord.
- **Pilot:** before announcing it, let one real tenant, one provider and one landlord use it for a few days and note every confusion.

### Launch checklist

- ☐ Production Supabase project created; RLS enabled on every table (check the dashboard shows no warnings)
- ☐ `service_role` key only in Edge Function secrets, not in the repo or React build
- ☐ Email confirmation and leaked-password protection on; auth redirect URLs set to the live domain
- ☐ Storage buckets private with size and type limits
- ☐ Daily backups on; region close to South Africa
- ☐ Security headers set; HTTPS enforced
- ☐ Privacy notice and contact email visible
- ☐ Seed or demo data removed from production
- ☐ README with setup steps, role accounts for demo and how to run the security tests
- ☐ Error logging (Sentry free tier or Supabase logs) switched on

### Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| RLS written wrongly, data leaks | Medium | Very high | Build on Day 4 before screens; run the cross-user tests every time a policy changes |
| Photo uploads fail on weak signal | High | High | Compress in browser, show retry, keep form data, small file limit |
| Scope grows (chat, payments, notifications) | High | High | Non-goals list in section 1; new ideas go in the roadmap below |
| Camera input behaves differently on iPhone | Medium | Medium | Test on a real iPhone on Day 5, not Day 13 |
| Falling behind schedule | Medium | Medium | Buffers on Day 7 and 12; cut list in section 9 |
| Free tier limits (storage, bandwidth) | Low for the MVP | Medium | Compress images; move to Pro before real use |

### After the MVP (roadmap)

1. WhatsApp or SMS notifications for new jobs and status changes
2. Urgency flag (e.g. no water, no power) and an automatic reminder for jobs pending over 24 hours
3. Installable PWA with push notifications
4. Multiple properties per landlord with filters, and a monthly report
5. Provider ratings and a job cost record, if payments move online later

### Sources

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [POPIA (Information Regulator, South Africa)](https://inforegulator.org.za/)

These links were not opened while writing; they are the official starting points for each topic.
