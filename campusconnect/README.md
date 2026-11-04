# CampusConnect — UEW

CampusConnect is a university community app for the University of Education, Winneba. This application lives in its own `campusconnect/` folder so the original PHP/CodeIgniter files at the repository root remain untouched.

## Included in this first conversion pass

- Next.js + TypeScript web application
- UEW-branded responsive feed and sign-in / sign-up screens
- Supabase email/password authentication
- UEW tenant lookup using the existing `institutions.slug = 'uew'` record
- Campus, academic and marketplace post channels
- Feed reading, profile names, post publishing and threaded comments against the existing RLS-protected Supabase tables
- Email confirmation messaging
- Editable student profiles with bio, programme/major, department and graduation year
- Private profile-photo uploads (JPG, PNG and WebP, 2 MB maximum) with signed image URLs
- UEW communities: create public and private groups, browse, join and leave public communities
- Member-only group discussions with author, owner and moderator post deletion
- Private-group invitations with an in-app invitation inbox and verified-member acceptance
- Owner-managed moderator promotion and removal

## Local setup

1. Install Node.js 22 or newer.
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

The UEW tenant record is already seeded. New accounts start with `verification_status = pending`; the app deliberately blocks community access until an authorised campus administrator verifies the account. Email confirmation proves control of an email inbox, not current student status. The official UEW student/faculty email domains have **not** been confirmed or configured, so do not enforce a guessed email suffix. After the university eligibility process is confirmed, provide administrators with a secure verification workflow before inviting the campus.

## Existing database

The app uses existing tables:
- `institutions`
- `users`
- `profiles`
- `posts`
- `comments`
- `groups`
- `group_members`
- `group_posts`
- `group_invites`

The database already has row-level security enabled. The app uses only the public Supabase client and relies on those database policies; no service-role key is included. The `campus-avatars` private Storage bucket is provisioned by the `campusconnect_profile_avatars` migration. Group discussion tables and tenant-safe membership policies are provisioned by `campusconnect_groups_and_discussions`; group creation is protected by the tenant-scoped `groups_insert_owner` policy; a private-schema trigger adds the creator as group admin without exposing a privileged RPC. Private group invitations, verified-recipient acceptance, moderator permissions and column-scoped role changes are provisioned by `campusconnect_group_invites_and_moderation` and `campusconnect_group_role_column_grants`. Storage policies restrict uploads, replacement and deletion to each member's own user-ID folder, and allow reads only for verified campus members. Signed URLs are short-lived.

## Current scope / next build steps

This is a first working web foundation, not a finished production social network. The next increments should add:
1. Notifications and realtime feed updates.
2. Direct messages and realtime updates.
3. Campus events and announcements.
4. Reporting, blocking and moderator tools.
5. An administrator-facing UEW member verification queue and audit trail.
6. Expo Android client sharing the same Supabase backend.


Before public launch, test the RLS policies using separate student accounts and configure the official UEW eligibility process. The legacy root PHP entry point is deliberately preserved.
