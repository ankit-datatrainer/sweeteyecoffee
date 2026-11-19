# Publish Sweet Eye Coffee on Apple and Google Play

The app uses React Native and Expo SDK 58. You can start both signed cloud builds from Windows. The blank **Build** section in App Store Connect needs a signed iOS build uploaded and selected. The iOS and Android identifiers are both `com.sweeteyecoffee.app`.

## 1. Verify the release settings

- Keep the existing Apple record, **Sweet Eye Coffee House**, and confirm its registered bundle ID matches `com.sweeteyecoffee.app`. Use the existing Google Play listing for that same Android package. The app displays **Sweet Eye Coffee** on the device.
- The build’s marketing version is `1.0.0`. On the existing **Prepare for Submission** page, make sure the App Store version field matches the build. [Apple version number](https://developer.apple.com/help/glossary/version-number/)
- Both production build profiles use `https://app.sweeteyecoffee.com`. The app supports iPhone and iPad. Expo SDK 58 sets Android target API 36. EAS selects the SDK-compatible Xcode image. Check the actual build logs and the Play bundle report for the target API and 16 KB support before release. [Google target API](https://support.google.com/googleplay/android-developer/answer/11926878) · [Android 16 KB checks](https://developer.android.com/guide/practices/page-sizes) · [Apple SDK requirements](https://developer.apple.com/news/upcoming-requirements/) · [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- Confirm the support inbox is monitored and that deletion tickets with a `DEL-` reference have an assigned owner. Resolve open fulfillment or subscription billing before deleting associated data, retain only records needed for fulfillment, disputes or legal obligations, review records held by payment and delivery providers, and confirm completion to the account holder. These requests appear in the existing support ticket queue and generate a staff notification. [Apple account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/) · [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)

## 2. Build the signed files on Windows

Open PowerShell from the project directory. Sign in to the Expo account or organization that owns this app. If an Expo project already exists, link that project rather than registering a duplicate. Enter credentials and verification codes only in the provider's sign-in prompt.

```powershell
cd mobile
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest init
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest build --platform android --profile production
```

Select the Apple team that owns your existing App Store Connect record and confirm the bundle ID. Use the existing signing credentials if a build has already been uploaded. For a first Play upload, use Play App Signing and keep the upload key backed up. The build links return an **iOS .ipa** and an **Android .aab**. The production profile increments build numbers remotely. [EAS Build setup](https://docs.expo.dev/build/setup/)

## 3. Upload, install and smoke-test both builds

1. **Apple**. Run `npx eas-cli@latest submit --platform ios` from `mobile` and choose the successful production build. Use the numeric App Store Connect app ID from the existing record if prompted. Wait for processing, install from TestFlight, then return to the **Build** section of the matching iOS version and select the processed build. [Expo Submit for iOS](https://docs.expo.dev/submit/ios/)
2. **Google Play**. Open **Testing → Internal testing**, create a release and upload the signed `.aab`. Follow the Play App Signing prompt. After the first manual upload, EAS Submit can handle later uploads once a Google service account is configured. If Play requires closed testing for a new personal developer account, keep at least 12 testers opted in continuously for 14 days and apply for production access before release. [Expo Submit for Android](https://docs.expo.dev/submit/android/) · [Google testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
3. Test on iPhone, iPad and Android using the signed builds. Browse categories, switch an Americano from Hot to Iced, customize it, check bag pricing, review pickup and delivery options, test account creation, sign-in, password reset and deletion with disposable accounts, and confirm staff can select a single image without granting broad photo access. Test payment and fulfillment with approved sandbox settings. Verify the signed Android bundle in Play Console and on a 16 KB environment. Capture native screenshots from these builds using the six views in the kit.

## 4. Add the graphics and listing details

| Upload field | Asset |
| --- | --- |
| Play Console → Main store listing → App icon | Google Play app icon 512.png |
| Play Console → Main store listing → Feature graphic | Google Play feature graphic 1024x500.png |
| Play Console → Phone screenshots | Six portrait screens in Android Phone, 1080 × 1920 |
| App Store Connect → iPhone with Dynamic Island (medium) | Six portrait screens in iPhone 6.3, 1206 × 2622 |
| App Store Connect → iPhone with Dynamic Island (large), optional | Six portrait screens in iPhone 6.9, 1320 × 2868 |
| App Store Connect → iPad 13-inch | Six portrait screens in iPad 13, 2064 × 2752 |
| Apple app icon | Included in the iOS build from mobile/assets/images/icon.png |
| Website or social promotion | Wide promotion banner 1600x900.png |

The kit has plain app captures and promotional compositions in all four sizes. These were captured from the responsive Expo web app. Verify them against the signed native builds and use native captures for final submission, particularly where the system or native UI differs. The six views are Home, Hot and iced menu, Customize a drink, Shop coffee beans, Review your bag, and Choose pickup. Use one version of each view in a listing. The wide promotion banner is for external marketing. [Apple screenshot sizes](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) · [Apple screenshots in use](https://developer.apple.com/help/app-review/guideline-reference/2-3-3-screenshots/) · [Google preview assets](https://support.google.com/googleplay/android-developer/answer/9866151)

Suggested listing text is in the kit. Choose **Food & Drink**, complete the content and age rating questionnaires, and provide the reviewer a working, ordinary customer account in the private App Review or App access fields. Verify it works without extra authentication. Give reviewers the reproducible steps to browse as a guest, customize an item, view the bag and find deletion under **Account → Profile → Delete account**. Provide any access details for staff-only screens if the reviewer needs them.

## 5. Complete privacy, app content and review

- **Privacy policy**. Enter `https://app.sweeteyecoffee.com/legal/privacy`. **Account deletion URL for Google**. Enter `https://app.sweeteyecoffee.com/delete-account` after opening it publicly and checking that sign-in returns to the deletion form. **Support URL**. Enter `https://app.sweeteyecoffee.com/contact`.
- Review the App Privacy and Data safety questionnaires using the table below. Base the final answers on the signed release, your production configuration and your processor contracts. The app's payment forms handle physical products. Square and Stripe handle card or wallet data, and UPS may receive shipping data. [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/) · [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) · [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/) · [Google payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)

| Data to review | Use and collection context |
| --- | --- |
| Name, email, phone and account ID | Account, login, guest checkout and order contact. Some fields are optional. |
| Delivery address and pickup details | Delivery fulfillment and curbside pickup. Delivery data may go to the carrier. |
| Orders, quantities, price and payment references | Order history and fulfillment. Card entry is handled by the payment provider. Confirm each store's processor and payment-data disclosure rules. |
| Support messages and order notes | User-submitted support and order information. |
| Selected staff photos | A staff member selects a photo to upload to the catalog or a shop page. The customer flow does not ask for photos. |
| Device, diagnostic and network data | Check server logs and production third-party SDK behavior for fields the store expects you to disclose. |

- **Apple export compliance**. The project currently sets `ITSAppUsesNonExemptEncryption` to false for standard system encryption. Review the encryption declaration and linked SDKs with the account owner before submitting. Respond to any App Store Connect prompts using the actual build. [Apple export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)
- **Release**. On Apple select the processed build and use **Add for Review** after completing the mandatory fields. On Google finish **App content**, **Data safety**, **App access**, store listing, pricing and countries, then request production access or submit the production release as shown in your console. Keep the store declarations consistent with the feature availability in production. Subscription billing depends on its separate Stripe setup.
