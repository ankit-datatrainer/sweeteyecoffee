# Sweet Eye Coffee Roasters — App

The Sweet Eye ordering app for iPhone and Android (Expo Go) and the web, plus the small API it talks to. Both use the existing **`sweet_eye_coffee`** MySQL database in XAMPP / phpMyAdmin, so the menu, prices, sold-out flags, coupons, accounts and orders are the same data the Laravel website used.

```
mobile/   Expo SDK 58 app (React Native + web) — screens in mobile/src/app
server/   Node.js API on the sweet_eye_coffee database — serves the menu photos too
```

## Run it

1. Start **MySQL** in the XAMPP control panel (the database runs on port 3307).
2. In this folder:

   ```bash
   npm run dev
   ```

   This starts the API on port 4000 and the Expo dev server on port 8081.
3. Open the app:
   - **Phone (Expo Go):** install Expo Go, connect the phone to the same Wi-Fi as this computer, then scan the QR code shown in the terminal (or open `exp://<this computer's IP>:8081`).
   - **Browser:** open http://localhost:8081.

First time on a new computer: `npm run setup` installs everything.

If the phone can't load the app, allow **Node.js** through Windows Firewall when Windows asks (both ports 8081 and 4000 must be reachable on your network). If your Wi-Fi blocks devices from seeing each other, run `npm run tunnel` for the app — but note the phone still needs to reach the API on port 4000, so set `EXPO_PUBLIC_API_URL` to a public address for the API in that case.

## Going live

- **Website + API on the Hostinger VPS (https://app.sweeteyecoffee.com):** step-by-step in [deploy/DEPLOY.md](deploy/DEPLOY.md) — its own folder, port 4600, PM2 process and nginx file, next to the other apps on that VPS; uses the website's Hostinger database through Remote MySQL. One Node process serves the API, the photos and the web app (`npm --prefix mobile run build:web`).
- **App Store / Google Play:** [deploy/STORES.md](deploy/STORES.md) — EAS cloud builds (`mobile/eas.json` points at https://app.sweeteyecoffee.com), store listing answers and review notes.

Security built in: strict rate limits on sign-in, password reset (codes are discarded after 5 wrong tries), coupons, checkout and contact forms; security headers (CSP, HSTS, no framing); CORS and Stripe return pages locked to your domain; changing a password signs out other devices; changing an email needs the current password; card payments can't be charged twice by double-tapping; staff photo uploads are checked to really be images; Node only listens on 127.0.0.1 behind nginx in production.

## Payments

`server/.env` → `PAYMENTS_MODE`

- `live` (**current setting**): real payments. At checkout the customer picks:
  - **Card**: the Square card form (same Square account and location as the website). The order also appears in Square POS, like website orders.
  - **Apple Pay, Google Pay, Cash App Pay, Amazon Pay**: each shown with its logo. The customer picks one and Stripe's secure page opens on just that method (e.g. Cash App → "Pay with Cash App", QR code / Cash App approval). Same Stripe account and payment-method setup as the website; the app only lists methods switched on there. Apple Pay is offered on iPhone and the web, Google Pay on Android and the web. The app comes straight back once it's paid; cancelling closes the Stripe page and removes the unpaid order. Paid Stripe orders are also added to Square POS as "paid externally (Stripe)", so staff see every order in one place.

  An order stays hidden until its payment succeeds; a cancelled or abandoned payment removes it.
- `test`: orders go into the database as paid "Test payment (no charge)" orders; no card is charged. Switch to this for trying things out, then restart the API.

The Stripe webhook is at `/api/stripe/webhook` (signed with `STRIPE_WEBHOOK_SECRET`). It only matters once the API is on a public address; the app already confirms payments itself when the customer returns.

**Delivery:** local ZIP codes pay the local delivery fee. Other US addresses get the standard shipping rate plus live **UPS** 3 Day Select, 2nd Day Air and Next Day Air prices (from the website's UPS account).

**Not in the app:** PayPal and WhatsApp order alerts. Their keys were empty in the website's `.env`; add PayPal (`PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`) or Twilio keys if you want those built. Square rewards points are not in the app either.

## Email

`MAIL_ENABLED=false` (default) prints emails — receipts, password-reset codes, contact messages — in the API console instead of sending them. Set it to `true` to send through the Hostinger mailbox in `server/.env`.

## What's in the app

- Home: parallax hero, live open/closed status, menu categories, featured carousel, gallery, hours and directions
- Menu with search and category tabs; product pages with Hot/Iced, sizes, milk, flavour and add-on options (prices checked by the server, same rules as the website)
- Menu cards: tap the photo for the full item page, or the **+** for a quick pop-up to pick size and options and add to the bag
- Bag with coupons and live tax; checkout for in-store pickup, curbside (when switched on in settings) and coffee-bean delivery; guest (name + phone) or signed-in
- Order tracking with live status, "I'm here" for curbside, order history
- Accounts: sign up, sign in, password reset by emailed code, profile, support tickets, contact form
- Staff dashboard (admin / super admin accounts, Account → Staff dashboard):
  - today's orders and revenue, live order queue with one-tap status updates
  - **Products:** add, edit, delete; photo and iced photo upload; sizes/styles with prices; which drink options apply; featured / sold out / hidden; arrow reordering within a category
  - **Categories:** add, edit, switch off, seasonal date windows, menu position
  - **Drink options:** rename, reprice (including the Large price), switch off, add new options
  - **Coupons:** percentage or fixed, minimum order, max discount, max uses, start and expiry
  - **Settings:** sales tax, curbside on/off, local delivery fee, standard shipping, local ZIP codes
  - **Availability:** quick sold-out and on-menu switches

As on the website, products that have been ordered are hidden instead of deleted. Unlike the old Laravel admin, a category can only be deleted once it's empty — the database would otherwise delete its products and their order history with it. Uploaded photos are saved in `server/public/images/menu/<category>/` like the website did.

Not in the app: customer management, order exports (Excel/PDF), support-ticket replies, and payment-gateway keys (those live in `server/.env`).

## Photos

Menu and café photos live in `server/public/images` (same files and paths the website used). The API sends phones a resized, compressed WebP copy for each place a photo is shown — e.g. the 2.4 MB bagel photo becomes ~60 KB in the menu grid — and keeps those copies in `server/.image-cache` (rebuilt automatically, safe to delete). The originals are never changed. If a photo is ever missing, the app shows a coffee-cup placeholder instead of an empty box.

## Checks

```bash
npm run check
```

Runs the TypeScript and ESLint checks on the app.

## Database

`server/database/sweet_eye_coffee.sql` is a full dump of the database taken on 28 Oct 2026 (includes the order-list indexes added for speed). Import it in phpMyAdmin to set up a new machine, then copy `server/.env.example` to `server/.env` and fill in the passwords and keys.

The Laravel website code was backed up to `Sweet Eye Coffee - Laravel backup 2026-10-27.zip` in the parent folder before it was removed from here (without `vendor/` and `node_modules/`; `composer install` and `npm install` restore those).
