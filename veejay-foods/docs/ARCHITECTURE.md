# VeeJay Foods — architecture proposal

"VeeJay Foods" is a placeholder brand; change `BRAND` in `backend/src/env.ts`, `app/src/theme.ts`, `admin/src/brand.ts`.

## Repo layout
```
veejay-foods/
  backend/   Node 22 + Express + TypeScript + Prisma (PostgreSQL) — REST API, Paystack, push, QR
  app/       Expo (React Native) + TypeScript — customer app
  admin/     Vite + React + TypeScript — staff/admin dashboard (web, incl. QR scanner)
  docs/
```
Build order: backend (with tests) → app → admin.

## Key decisions
- **Money** is integer kobo everywhere (`priceKobo`); only the UI formats ₦.
- **Combos** are `MenuItem` rows with `isCombo = true` plus `ComboComponent` rows (item + qty).
- **Order snapshots**: `OrderItem` copies name + unit price so later menu edits never change past orders.
- **Order lifecycle**: `PENDING_PAYMENT → PLACED → PREPARING → READY → COLLECTED`; `PENDING_PAYMENT → CANCELLED` (timeout/abandon).
  The customer-visible flow is Placed → Preparing → Ready → Collected; an order becomes `PLACED` **only** when the Paystack webhook (or server-side verify) confirms payment. A pure transition table (`orderStateMachine.ts`) is the single source of truth.
- **Payments**: Paystack hosted checkout (`channels: card, bank_transfer, ussd`). The app opens `authorization_url` in the system browser / in-app browser; card data never touches us. Webhook = HMAC-SHA512 of the raw body; processing is idempotent (`WebhookEvent.eventKey` unique) and re-checks amount, currency and reference against our `Payment` row. `GET /orders/:id/payment/verify` lets the app reconcile if the webhook is late.
- **Auth**: phone + OTP (SMS provider interface; Termii-style). Short-lived JWT access token (15 min) + rotating opaque refresh token (hash stored, 30-day sliding expiry). **A user with an active order is never signed out**: refresh succeeds even past expiry while an order is `PLACED/PREPARING/READY`, a just-rotated token is accepted for a 60 s grace window (flaky mobile networks), and tokens are never revoked by reuse while an order is active.
- **QR pickup**: payload `nbg1.<orderId>.<HMAC(orderId)>`, derived (not stored) so the app can always re-render it. Staff scan → `POST /staff/scan`; only a paid, `READY` order at the staff member's outlet can become `COLLECTED`, atomically (single-use).
- **Refunds**: customer files a `Complaint` (reason, text, photo). Admin approves → `Refund` row → Paystack refund API to the original payment method; Paystack's refund webhook finalizes status.
- **Push**: Expo push service (works with FCM/APNs); a notification is sent on every status change.
- **Uploads**: complaint photos / menu images behind a `Storage` interface (local disk in dev, swap for S3/Cloudinary in prod).

## Data model (Prisma, see `backend/prisma/schema.prisma`)
| Model | Purpose |
|---|---|
| User | phone (unique, E.164), name, role CUSTOMER/STAFF/ADMIN, outletId (staff), expoPushToken |
| OtpCode | phone, hashed code, expiry, attempts, consumedAt |
| RefreshToken | hashed token, familyId, expiry, rotatedAt, revokedAt |
| Category, MenuItem, ComboComponent | menu, combos/meal plans, images, price kobo |
| Outlet, OutletHours | pickup points, weekly hours, prep time, slot size/capacity |
| OutletItemAvailability | per-outlet sold-out override |
| Order, OrderItem, OrderEvent | order, snapshot lines, status history |
| Payment | Paystack reference, amount, status, channel, raw verify payload |
| WebhookEvent | idempotency log of every Paystack webhook |
| Complaint, Refund | wrong-order report with photo; refund to original method |

## API surface (summary)
`/auth/otp/request|verify|refresh|logout` · `/menu` · `/outlets`, `/outlets/:id/slots` · `/orders` (create/list/get/payment/verify/qr) · `/complaints` · `/webhooks/paystack` · `/staff/orders`, `/staff/scan` · `/admin/menu|outlets|refunds|reports`.
