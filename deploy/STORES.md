# Publishing the iOS and Android apps

The store apps are built in the cloud with **EAS** (Expo Application Services) — no Mac or Android Studio needed. Do the VPS deployment (`deploy/DEPLOY.md`) first: the store apps talk to `https://yourdomain.com`.

## What you need

- An **Apple Developer** account ($99/year) and a **Google Play Console** account ($25 once).
- A free **Expo** account: https://expo.dev/signup
- Your site live on HTTPS, plus these public pages (Apple and Google both check them):
  - privacy policy — the app links to `https://sweeteyecoffee.com/privacy-policy`
  - account deletion — the app has **Account → Profile → Delete account**; Google also wants a web page that explains how to ask for deletion (a short page with the support email is enough), e.g. `https://sweeteyecoffee.com/delete-account`

## 1. One-time setup

In `mobile/eas.json`, replace `https://yourdomain.com` with your real domain (both places). Then, in the `mobile` folder:

```bash
npm install -g eas-cli
eas login
eas init            # links the project to your Expo account (adds the project id to app.json)
```

## 2. Build

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

EAS asks to create the iOS certificates and the Android signing key the first time — say yes and let it manage them. Build numbers go up automatically on every build.

To try a build on your own phones first: `eas build --profile preview` (Android gives an installable `.apk`; iOS needs your device registered with `eas device:create`).

## 3. Submit

```bash
eas submit --platform ios --latest
eas submit --platform android --latest
```

iOS goes to App Store Connect (TestFlight first); Android goes to the Play **internal testing** track as a draft. Promote them to production in the consoles when you're happy.

## 4. Store listing answers

**App Store Connect → App Privacy** and **Play Console → Data safety** — data collected, linked to the user, not used for tracking, not sold:

| Data | Why |
|---|---|
| Name, email, phone | Account and order contact |
| Delivery address | Coffee-bean delivery orders |
| Purchase history | Order tracking and history |
| Customer support messages | Support tickets / contact form |
| Photos (staff only) | Menu item pictures uploaded by staff |

Card and wallet details are entered on Square's and Stripe's own forms and never reach the app's server.

**Encryption:** the app only uses standard HTTPS — it's declared exempt in `app.json`, so App Store Connect won't ask on each build.

**Content rating:** Everyone / 4+ (no user-generated public content, no gambling, no mature content).

**Review notes** (both stores) — give the reviewers:
- A normal customer login (create one in the app, e.g. `review@sweeteyecoffee.com`).
- "Payments are real (Square / Stripe). Physical goods — coffee and food picked up in store or shipped. Staff dashboard is for employees only."
- Optionally a staff login if you want them to see the dashboard.

## Screenshots

Take them from the preview build or a simulator: iPhone 6.9" and 6.5", iPad 13" (the app supports iPad), and Android phone. 3–5 screens: Home, Menu, Product, Bag/Checkout, Order tracking.
