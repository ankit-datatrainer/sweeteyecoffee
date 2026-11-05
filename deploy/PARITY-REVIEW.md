# Laravel → Expo feature review · 5 November 2026

The supplied `Sweet Eye Coffee/` Laravel folder was compared with `mobile/` and `server/`. The working application remains Expo Router/React Native (Expo Go), its web build, and the existing Node API on the same MySQL schema.

| Area | Result in the application |
| --- | --- |
| Coffee subscriptions | All three website schedules: 2 weeks/15%, monthly/10%, 2 months/5%. Server-priced beans, roast, size, quantity, tax and shipping. Explicit recurring consent tied to the reviewed price. Stripe subscription checkout, customer list, billing portal and end-of-period cancellation. Staff subscription overview. |
| Purchase entry points | Bean cards, full product screen, quick-add sheet, checkout and Account. Product/size/quantity/roast carry into the builder. The one-time cart is preserved. A memory-only draft survives sign-in; renewal consent must be given after sign-in. |
| Recurring fulfillment | Signed Stripe events, authoritative invoice checks, current provider status, unique invoice → order mapping, failed-payment status without shipping orders, snapshot pricing and encrypted addresses compatible with Laravel. Test invoices cannot notify customers, reach live POS or buy shipping labels. |
| Page content | Home, About, Gallery, Contact, Menu, Privacy, Terms and Refund content use the shared `page_contents`/`page_sections` tables. Super admin editing supports text, photos, captions, gallery ordering, hidden sections, section reset and the website’s five extra-section types. Staff/customer writes are rejected. |
| Beans and Hot/Iced | Existing 12oz/2lb/5lb selection, required roast, Hot/Iced options, Large modifiers and iced photos retained. Catalog prices remain authoritative, including any price an admin changed after the website tests were written. Hidden categories cannot be ordered. |
| Images and branding | Original assets compared with the supplied folder. Full bean labels shown without cropping. Screen-density-aware image requests, higher-quality WebP, lossless logos and a new cache generation. Original logo appears beside the header text. HTTPS page photos are permitted by the web image policy. |
| Order time zone | Website-compatible US time-zone setting, date/bill display and staff day totals; opening hours continue to follow the cafe’s local time. |
| UPS fulfillment | Paid-order label purchase with packed weights/dimensions, explicit purchase confirmation, encrypted private labels, multiple packages, tracking, carrier charges, duplicate prevention, and uncertain-result reconciliation. Printing a label does not mark an order as handed to UPS. |

## Verification

- `npm run check`: TypeScript and ESLint.
- `npm test`: 11 policy/integration test groups, including catalog/pricing, access control, page edits, recurring totals/consent, concurrent signup, signature rejection, initial/renewal invoices, duplicates, failed payment, cancellation, portal, encryption, expired/repriced checkout reconciliation, UPS dimensions and uncertain/duplicate labels.
- API tests use a temporary database and mocked payment/shipping providers. They do not copy customer/order records or contact real providers.
- Expo dependency compatibility: up to date; Expo Doctor: 20/20 checks passed. Android/iOS bundles and production web export checked separately. SDK 58 dependencies were updated to the recommended compatible patch releases.
- The patchable high-severity transitive dependency advisory was fixed. npm still reports 12 moderate upstream tooling advisories involving glob/minimatch; its forced proposal downgrades Expo to SDK 52, so that breaking change was not applied.
- Rendered app inspected at desktop and 390px phone width: home branding/banner, bean cards, quick-add → subscription selection, recurring quote and policy content. A 5lb/Dark selection was preserved; a local 12oz preview displayed $22.70 for the two-month plan with the current catalog/tax settings.
- No physical iPhone/Android device or real Stripe/UPS transaction was used. Bundling and browser inspection do not replace physical-device/provider acceptance testing.

## Billing setup before taking subscriptions

In the private `server/.env`, configure:

```dotenv
COFFEE_SUBSCRIPTIONS_ENABLED=true
COFFEE_SUBSCRIPTIONS_ALLOW_LIVE=false
COFFEE_SUBSCRIPTIONS_STRIPE_SECRET=YOUR_STRIPE_TEST_SECRET
COFFEE_SUBSCRIPTIONS_WEBHOOK_SECRET=YOUR_SIGNING_SECRET
LARAVEL_APP_KEY=THE_EXISTING_LARAVEL_APP_KEY
```

The shared encryption key was retained privately from the supplied local configuration. Dedicated subscription billing credentials were not supplied, so the app allows price previews and keeps paid subscription signup unavailable until setup is complete. Do not use the one-time `PAYMENTS_MODE=test` setting as a substitute for Stripe subscription test keys.

Forward these events to `/api/subscriptions/webhook` (or the combined `/api/stripe/webhook`):

```text
checkout.session.completed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
invoice.payment_action_required
```

Use the dedicated signing secret for this destination. Configure the Stripe customer portal for payment-method updates, invoices and cancellation; disable product/quantity/plan changes because fulfillment selections are snapshotted. Local development refuses live subscription keys. Live billing additionally requires production mode and `COFFEE_SUBSCRIPTIONS_ALLOW_LIVE=true`.

Before enabling live billing, verify a provider test checkout, renewal, failed renewal/recovery and cancellation. Stripe must confirm a paid invoice before any delivery order is created. The implementation follows [Stripe recurring Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions) and [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks). Native billing uses the existing Expo Go-compatible [WebBrowser module](https://docs.expo.dev/versions/v58.0.0/sdk/webbrowser/).

No production deployment, real charge, live POS update, customer email or billable UPS label was performed during this review.

## Reference cleanup

The imported Laravel source was backed up outside the application directory as `Sweet Eye Coffee - Laravel reference 2026-11-05.zip`. All 510 included files were checked against the archive, and ZIP integrity verification passed. Source, assets, configurations and database files are retained; reinstallable dependencies and runtime caches are excluded. The archive location, SHA-256 and exclusions are in [laravel-reference-backup.json](laravel-reference-backup.json).

The imported `Sweet Eye Coffee/` directory was moved to the Windows Recycle Bin after verification, so it is removed from the project and remains recoverable. Keep `mobile/`, `server/` and `deploy/`. The web application is built from the same Expo project; it does not depend on the removed Laravel reference. An existing separately deployed Laravel website was not modified.
