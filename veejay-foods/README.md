# Veejay Foods — order ahead, skip the queue

Mobile food **pre-order & pickup** for **Veejay Foods**. Launch area: **Abuja Municipal (AMAC) only**. Customers pick a pickup point and time, pay with Paystack (card / bank transfer / USSD), track the order, and collect with a QR code.

> **Sample data.** The three Abuja pickup points (Wuse II, Garki, Jabi), their 08:00–22:00 hours, and the **menu, prices and combo** in `backend/src/seed.ts` are examples — replace them from the dashboard (*Outlets* and *Menu* tabs) before launch. Bundle IDs (`com.example.veejayfoods`) are placeholders until you pick your own.

| Part | Stack | Folder |
|---|---|---|
| Customer app (iOS/Android) | Expo (React Native) + TypeScript, Expo Router | `app/` |
| API | Node 22, Express, TypeScript, Prisma, PostgreSQL | `backend/` |
| Staff/admin dashboard | Vite + React + TypeScript | `admin/` |

**Design & delivery plan** (concept, features, real screenshots, architecture, roadmap): [`docs/design/Veejay-Foods-Design.pdf`](docs/design/Veejay-Foods-Design.pdf) · [HTML version](docs/design/Veejay-Foods-Design.html).

Brand: logo and palette (green `#019947`, red `#F81A08`) are taken from the Veejay Foods logo. Brand name and colours live in `backend/src/env.ts`, `app/src/theme.ts`, `admin/src/brand.ts` + `admin/src/styles.css`.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the data model and design decisions.

## Quick start

```bash
# 1. Backend
cd backend && cp .env.example .env        # set DATABASE_URL + secrets
npm install && npx prisma db push && npm run seed   # seeds 3 SAMPLE Abuja pickup points, a SAMPLE menu with a combo, and an admin
ADMIN_PHONE=+2348012345678 npm run seed   # optional: pick your admin number
npm run dev                               # http://localhost:4000 ; OTP codes print to the console (SMS_PROVIDER=console)

# 2. Staff/admin dashboard
cd ../admin && cp .env.example .env && npm install && npm run dev

# 3. Customer app
cd ../app && cp .env.example .env         # EXPO_PUBLIC_API_URL = your computer's LAN IP on a real phone
npm install && npx expo start
```

Push notifications need an **EAS development build** (not Expo Go) and a real EAS `projectId` in `app/app.json` → `extra.eas.projectId`.

## Tests

```bash
cd backend && npm test    # 67 tests against a real Postgres (set TEST_DATABASE_URL, default postgres://postgres:postgres@localhost/naijabites_test)
cd app && npm test        # pure helpers
```
The backend suite covers: **Paystack webhook** (signature, idempotency, concurrent duplicates, amount/currency tampering, late payment → auto-refund, retry-on-failure, refund events), the **order state machine** (exhaustive transition table, skipping/back-stepping, concurrent clicks), **QR pickup** (forged/unpaid/duplicate/wrong-outlet), **session continuity**, complaints/refunds, slots and reports.

## How the key requirements are met

1. **Auth / sessions** — phone + SMS OTP (hashed, 5-min expiry, 5 attempts, rate-limited). 15-min access JWT + rotating refresh token (30-day sliding). A user with an active order (`PLACED/PREPARING/READY`) is **never signed out**: refresh succeeds even after expiry, and a replayed/lost-response token is tolerated. Clients only clear the session on a definitive `401`, never on network errors.
2. **Menu** — categories, items, combos/meal plans (`isCombo` + components), images, prices in integer kobo (shown as ₦), per-outlet sold-out toggles.
3. **Pickup points** — outlets with weekly opening hours, prep time, slot length and per-slot capacity (capacity is enforced under concurrency with an advisory lock).
4. **Cart & checkout** — choose outlet, day and time slot; unpaid orders hold the slot for 15 min, then release it.
5. **Payments** — Paystack **hosted checkout** (`card`, `bank_transfer`, `ussd`); card data never touches our code. `POST /webhooks/paystack` verifies the HMAC-SHA512 of the raw body, re-checks amount/currency/reference, is idempotent, and the app can also reconcile via `GET /orders/:id/verify` (server → Paystack).
6. **Tracking** — `Placed → Preparing → Ready → Collected` with an Expo push on each change.
7. **QR pickup** — unforgeable per-order QR (HMAC); staff scan in the dashboard; only a paid, `READY` order at that staff member's outlet can be collected, once. Order-code fallback if a phone can't show the QR.
8. **Refunds / complaints** — in-app report with photo; admin approves (full/partial) → Paystack refund to the **original** transaction; Paystack's `refund.processed/failed` webhook finalises it.
9. **Dashboard** — live order queue (with sound), QR scanner, menu/outlets/staff management, complaints & refunds, sales reports.

## Go-live checklist (not done in this repo)

- **Paystack**: set `PAYSTACK_SECRET_KEY`; in the Paystack dashboard set the webhook URL to `https://<api>/webhooks/paystack`. Test with test keys first; `PUBLIC_API_URL` must be the public HTTPS URL (it's the post-payment return page).
- **SMS**: set `SMS_PROVIDER=termii` + `TERMII_API_KEY` / `TERMII_SENDER_ID` (Nigerian sender IDs need registration). Or swap `providers/sms.ts`.
- **Secrets**: real `JWT_ACCESS_SECRET`, `OTP_SECRET`, `QR_SECRET` (the server refuses dev defaults in production).
- **Uploads**: images are stored on local disk (`backend/uploads`); use persistent storage or swap in S3/Cloudinary behind `routes/orders.ts#upload`.
- **Hosting**: any Node host + managed Postgres; serve `admin/dist` as a static site; restrict CORS to the dashboard origin.
- **App stores**: change `bundleIdentifier`/`package` in `app.json`, add real icons, build with EAS.
- **Paystack customer email**: Paystack needs an email per payer and we only have a phone number. Set `PAYSTACK_EMAIL_DOMAIN` to a domain **you own** (receipts may be sent there); the server refuses the placeholder in production.
- **Compliance**: privacy policy & NDPR/NDPA notice (you store phone numbers and complaint photos).

## Known limitations

- Orders are pickup-only (no delivery, no delivery fees, no promo codes).
- Paystack refund completion is asynchronous; admins see `PENDING` until its webhook arrives.
- Slots use Africa/Lagos (UTC+1, no DST) — fixed in `services/slots.ts`.
- The mobile app and dashboard were type-checked and bundled (Metro export / Vite build) and the dashboard was smoke-tested in a browser against the live API, but the **mobile app has not been run on a device or simulator** in this environment, and real Paystack/SMS/push were not exercised (fakes in tests).
