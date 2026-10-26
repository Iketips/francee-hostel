# FranCee Hostel staff dashboard setup

The staff dashboard uses Supabase for shared FranCee Hostel records. The public page lists three room types with separate ground-floor, first-floor, and double-room photos.

## 1. Connected Supabase project

The FranCee Hostel site is connected to the `fracee` Supabase project. Its Project URL and browser-safe publishable key are configured in `supabase-config.js`. The current `supabase-schema.sql` has been applied; it creates the hostel tables, row-level security policies, private identity-document bucket, and seeds 33 rooms with 34 beds.

The publishable key is intentionally public browser configuration and is committed with the public site. Never put a Supabase secret or service-role key in `supabase-config.js` or any other browser file.

For future schema changes, back up the project before applying the updated SQL in **SQL Editor**. The schema is designed to be re-applied, but applying schema changes to a live database should still be done deliberately.

In **Authentication** settings, enable email/password sign-ups and email confirmation for student accounts. Add your deployed student portal URL to the allowed redirect URLs if you customize the email confirmation link.

For each invited staff account, copy its user ID from the Supabase users list and add it to the staff allowlist in SQL Editor:

   ```sql
   insert into public.staff_members (user_id, display_name)
   values ('AUTH-USER-UUID', 'Staff name');
   ```


Only users listed in `staff_members` can read or change staff records. Do not add student accounts to `staff_members`. Student accounts use a separate browser session from the staff dashboard.

## 2. Connect the page

1. Serve the site over HTTPS (or use `localhost` for development); browser authentication may not work when opening the page directly as a `file://` URL.
2. Students use `student.html` for room choices, requests, and the live occupancy chart. `inex.html` is the main hostel page and staff dashboard.
3. Open `inex.html` and go to **Staff dashboard**. The project settings from `supabase-config.js` are used automatically. If it is blank, enter the Supabase **Project URL** and **publishable/anon key** from the project API settings.
4. Sign in with an invited account that has also been added to `staff_members`.

The URL and publishable/anon key in `supabase-config.js` are public browser settings; the publishable/anon key is designed for client-side use and is not a service-role key. Keep row-level security enabled and never place a service-role key in the page. If using the dashboard’s local setup form instead, those settings are saved in that browser only.

## Student room requests and identity documents

After connecting the public page to the same Supabase project, students can open **Request a room** on their preferred room and submit their name, phone number, optional email, stay dates, guest count, and a proof-of-identity JPG, PNG, or PDF (maximum 5 MB). The schema creates a private `room-request-identities` storage bucket. Students can submit a request and upload its document but cannot read requests or download documents. Only staff accounts in `staff_members` can see the requests in the dashboard and create short-lived private links to their documents.

Apply the current full `supabase-schema.sql` in the SQL Editor to create the request table, bucket, and row-level security policies. If the schema has already been installed, run the updated full schema again after taking a database backup; it is designed to be re-applied. For public submissions from student devices, set `supabase-config.js` with the project URL and publishable/anon key. Do not put a service-role key in the page. For production, add CAPTCHA or equivalent abuse protection in front of public submissions and set a retention schedule for identity documents; do not keep identity documents longer than necessary.

## Rooms, rates, and reports

The schema seeds 33 rooms in total: 32 single rooms and one additional ground-floor double room. The 16 ground-floor single rooms are arranged in two rows of eight at GHS 7,000 per person for the full academic year. The 16 first-floor single rooms are arranged in two rows of eight at GHS 8,000 per person for the full academic year. The ground-floor double room is GHS 5,500 per person for the full academic year and has two separate regular beds, not bunks. Each room has a private toilet, bath, and kitchen. The seeded room identifiers are `GF-01` through `GF-16`, `FF-01` through `FF-16`, and `GF-D01`.

The dashboard records guests, rooms, beds, bookings, payments, and expenses. The double room has two separately bookable regular beds. Bookings preserve the selected room's per-person academic-year rate and cannot overlap on a bed; booking dates are limited to eight calendar months. Report totals are filtered by date range and currency; occupancy counts each occupied room only once, even if both beds in the double room are booked. The monthly chart shows bookings created and paid revenue for the last six calendar months.

Student room requests are stored separately from confirmed bookings. Staff should verify each request and identity document, contact the student, and enter a confirmed reservation in the signed-in dashboard.

## Student room issue reports

The student portal includes a **Report a room issue** form. Students select a specific room (`GF-01`–`GF-16`, `FF-01`–`FF-16`, or `GF-D01`), an issue category and urgency, then provide their name, phone number, and description. Submissions are stored in `public.room_issues`. Only authorized staff can view reports or update their status (`open`, `in progress`, or `resolved`); students cannot read other reports. Staff review the **Student room issues** section in the dashboard.

The issue-report form uses the configured Supabase project and publishable/anon key. Apply the updated full `supabase-schema.sql` to create the table, checks, grants, and row-level-security policies. Students see a submission reference when the report is saved; they do not get access to the staff dashboard or other students' reports.

## Student portal photos and accounts

The student portal (`student.html`) starts with a rotating room-photo carousel with previous/next and direct-slide controls. Students can optionally create an account using their name, email, and an 8-character-minimum password, or sign in and out using email/password. Supabase email confirmation may be required before sign-in. Guest room requests and issue reporting remain available without an account. Student sessions are stored separately from staff dashboard sessions; student sign-in does not grant access to staff data.

Enable email/password sign-ups and confirmation in Supabase Authentication for the account forms to work. The project URL and publishable/anon key must be configured in `supabase-config.js`. Student accounts are authenticated with Supabase but do not require adding any student to `staff_members`.

## Shared occupancy and room availability

The student portal, public hostel page, and staff dashboard use `get_public_hostel_status()` for the same aggregate counts and room-type availability. The public function returns counts only; it does not expose guest names, contact details, bookings, or identity files. Pages refresh these numbers about once a minute. **People accommodated** counts active `checked_in` bookings for today. **Rooms remaining** counts active rooms with no pending, confirmed, or checked-in booking today; **beds available** also accounts for the two separate beds in the ground-floor double room. Room requests do not reserve rooms; staff should confirm requests and create bookings before they affect availability. Students should check availability for their intended dates with staff, since the public chart shows today’s status.

Apply the updated full `supabase-schema.sql` to create the aggregate status function. The student page can be opened at `student.html`; it shares requests and availability with the staff dashboard through the configured Supabase project. The site palette is now pinkish red.
