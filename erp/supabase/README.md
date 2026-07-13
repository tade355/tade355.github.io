# Setting up Supabase for the Emagrims ERP

This is the first step toward giving the ERP real shared data across
devices and staff, instead of each browser having its own separate
localStorage copy. Nothing in the live app changes yet — this just gets
the backend ready.

## 1. Create a Supabase account and project

1. Go to https://supabase.com and sign up (free tier is enough to start).
2. Click **New project**.
   - Organization: create one if you don't have one yet (e.g. "Emagrims").
   - Project name: `emagrims-erp`
   - Database password: generate a strong one and save it somewhere safe
     (a password manager, not chat) — you won't need it day-to-day, but
     you'll want it if you ever need direct database access.
   - Region: pick the one closest to Nigeria that Supabase offers
     (e.g. an EU region) for the best latency.
3. Wait a minute or two for the project to finish provisioning.

## 2. Run the schema

1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `erp/supabase/schema.sql` from this repo, copy its full contents,
   paste into the editor, and click **Run**.
4. You should see "Success. No rows returned." That creates every table
   the app needs (employees, inventory, invoices, operations, payroll,
   etc.) plus the row-level-security policies described at the top of
   that file.

## 3. Get the credentials I need

1. In the dashboard, go to **Project Settings → API**.
2. Copy two values and send them to me:
   - **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
   - **anon / public key** (a long string starting with `eyJ...`)

Do **not** send me the `service_role` key — that one bypasses all
security and should never be used in client-side code. The `anon` key is
the one that's safe to embed in the ERP's JavaScript (it's what
Supabase's row-level-security policies are designed to be used with).

## What happens after that

Once I have the project URL and anon key, I'll:
1. Add the Supabase JS client to the ERP.
2. Migrate one or two modules first (I'd suggest **Fund Requests** and
   **Leave Requests** — they're self-contained and you'll notice
   immediately if shared data is working, since a request submitted on
   one phone will show up on another).
3. Write a one-time script to copy your existing localStorage data
   (staff, projects, equipment, etc.) into the new database, so nothing
   you've already entered gets lost.
4. Once that's working well, convert the rest of the modules the same
   way.

**Caveat worth repeating:** this still won't add real login security —
the "who's using this device" picker will keep working the same way.
Real password-based logins tied to Supabase Auth would be a separate,
later step if you decide you want it.
