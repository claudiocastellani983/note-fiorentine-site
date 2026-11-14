# Note Fiorentine — Gestionale prenotazioni

Standalone responsive web app / PWA for the restaurant team and public booking flow.

## Architecture
- Next.js App Router on a dedicated Vercel project.
- Dedicated Neon PostgreSQL database, separate from the website CMS.
- Managed Neon Auth / Better Auth for staff accounts.
- One shared booking store for public requests and staff-entered bookings.

## Current implementation
- Staff agenda, booking creation, editing, status changes and table assignment.
- Public availability endpoint and booking request form.
- Weekly service hours, table capacity and duration settings.
- Per-date, per-30-minute online slot overrides only. Staff can still enter bookings manually when an online slot is closed.
- PWA manifest and service worker.

## Required first-time setup
1. Create the first owner account in Neon Auth and add its row to `public.staff_profiles` with role `owner`.
2. Configure dining tables and service hours in the staff settings.
3. Test public availability, booking creation, concurrent requests and staff operations.
4. Add the production custom domain only after the acceptance tests pass.

Do not disable Guestplan until the replacement has passed end-to-end tests and the restaurant explicitly approves the switch.

Preview build: staff and public routes are deployed from the `reservations-app` branch.
