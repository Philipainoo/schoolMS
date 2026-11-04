# CampusConnect — UEW

CampusConnect is a university community app for the University of Education, Winneba. This application lives in its own `campusconnect/` folder so the original PHP/CodeIgniter files at the repository root remain untouched.

## Included in this first conversion pass

- Next.js + TypeScript web application
- UEW-branded responsive feed and sign-in / sign-up screens
- Supabase email/password authentication
- UEW tenant lookup using the existing `institutions.slug = 'uew'` record
- Campus, academic and marketplace post channels
- Feed reading, profile names and post publishing against the existing RLS-protected Supabase tables
- Email confirmation messaging

## Local setup

1. Install Node.js 20 or newer.
2. Open a terminal in `campusconnect/`.
3. Install dependencies: `npm install`.
4. Copy `.env.example` to `.env.local`.
5. In the Supabase dashboard for project `jfwnudfdiuopdsjqakku`, copy the public anon/publishable key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never use a service-role or secret key in this app.
6. Run `npm run dev` and open http://localhost:3000.

## Supabase Auth setup

In Supabase Authentication settings:
- Enable email/password sign-up.
- Keep email confirmation enabled.
- Add your local and production app URLs to the allowed redirect URLs.
- Configure a production SMTP provider before inviting the whole campus.

The UEW tenant record is already seeded. The official UEW student/faculty email domains have **not** been confirmed or configured, so this first pass does not pretend to validate current enrolment. Email confirmation proves control of an email inbox, not current student status. Do not enforce a guessed email suffix.

## Existing database

The app uses existing tables:
- `institutions`
- `users`
- `profiles`
- `posts`

The database already has row-level security enabled. The app uses only the public Supabase client and relies on those database policies; no service-role key is included.

## Current scope / next build steps

This is a first working web foundation, not a finished production social network. The next increments should add:
1. Profile editing and avatar uploads with a private/public storage policy.
2. Comments and notifications.
3. Groups and membership workflows.
4. Direct messages and realtime updates.
5. Campus events and announcements.
6. Reporting, blocking and moderator tools.
7. Expo Android client sharing the same Supabase backend.

Before public launch, test the RLS policies using separate student accounts and configure the official UEW eligibility process. The legacy root PHP entry point is deliberately preserved.
