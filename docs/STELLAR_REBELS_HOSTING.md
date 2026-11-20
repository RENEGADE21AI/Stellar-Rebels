# Stellar Rebels browser deployment

The owner has standing authorization for tested public browser releases at [stellar-rebels.web.app](https://stellar-rebels.web.app/). This covers Firebase Hosting target `stellar` only. It resolves to `projects/star-strike-rush/sites/stellar-rebels`. The separate legacy site, shared back end, native builds, and store distribution have their own authorization.

## Publish a tested web revision

Use Node 22 and the locked dependencies. Build with `node scripts/build_stellar.js` from a clean commit, run the Arcade model and packaged browser checks, then publish that exact commit. The publish script verifies the local mapping, Hosting-only configuration, package identity, authenticated remote site, and deployed version. Use `-CheckOnly` for local scope and package verification.

```powershell
.\scripts\publish-stellar.ps1 -VerifiedCommit (git rev-parse HEAD)
```

Verify the public URL in a fresh browser session, including combat, stage selection, audio, retry and local saves. Test an existing profile with a prior controller on meaningful updates. A controlled navigation serves the complete installed document. A successor worker takes control after caching its whole generation and continues to serve versioned assets to open older documents. A menu-only update action reloads a settled, durably stored profile. Use `node scripts/stellar-rollout-qa.js INSTALLED_DIST NEXT_DIST` to exercise recovery from a blocked replacement and repair of missing art while unrelated network responses stall. Repair downloads missing entries and checks generation identity for unsuffixed document or metadata files. Keep a previous known-good package and record the release history from Firebase Hosting.

If a new build breaks core play, use Roll back in the **stellar-rebels** Hosting dashboard or republish the previously tested checkout with its artifact. Recheck the live version and fresh play after rollback. Leave the latest playable release up while a broken candidate is being repaired. Firebase keeps earlier versions in Hosting release history. [Hosting releases and rollback](https://firebase.google.com/docs/hosting/manage-hosting-resources)

The original public browser milestone was commit `def5edaa4059a335ddf2a370b27ce508e496f428`, pack `4b5b85cac8444a6`. The public HTTPS version matched and all five packaged browser tests passed, including WebKit pause and resume and Chromium offline recovery.

## Optional Google sign-in

The Account screen is available only at the canonical Stellar Rebels origin when a build explicitly enables it. Google sign-in manages identity. Scores, Salvage, settings, and unlocked ships remain in the device browser's pilot save. Opening the Account screen loads Firebase Auth. The installed guest flight pack remains playable offline.

For an enabled release, verify that `stellar-rebels.web.app` is an authorized Firebase Auth domain, its HTTPS origin is allowed on the browser key served by `/__/firebase/init.json`, and the existing Google OAuth web client authorizes `https://stellar-rebels.web.app/__/auth/handler` as a redirect URI. Preserve the existing legacy restrictions. The browser SDK and provider helper both use `stellar-rebels.web.app` as their Auth domain. [Firebase redirect checklist](https://firebase.google.com/docs/auth/web/redirect-best-practices)

```powershell
$env:STELLAR_ENABLE_GOOGLE_SIGN_IN = '1'
node scripts/build_stellar.js
$env:STELLAR_ACCOUNT_DIST = (Resolve-Path dist-stellar).Path
node --test tests/stellar-account.test.js
```

The local account tests replace the OAuth provider with a fixture and exercise the production Account UI in Chromium and WebKit. On the hosted candidate use a test Google account to verify provider navigation, successful return, cancellation, reload, and sign-out. Verify the old game's Google button can still reach the provider. The sign-in button uses the [approved Google artwork](https://developers.google.com/identity/branding-guidelines).
