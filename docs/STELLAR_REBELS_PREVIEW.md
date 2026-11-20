# Stellar Rebels preview and approvals

## Stage 1 checkpoint

The Stage 1 browser preview was verified at `http://127.0.0.1:4184/`. It is the clean web build of `a7e66200ba87f27dfd9b1fc19021273ca40d10f1` with pack ID `829363851236bf0`. It uses a detached checkout so later art and balance changes do not alter the checkpoint. The loopback address is available on the development PC while its server is running.

Fly with the starter Fighter and stock weapons. Try dragging near an edge, lifting and landing your finger somewhere else, then continuing without a jump. Watch the first coordinated wing to see whether aiming at its command hardware feels worthwhile. Notice when a pickup changes your approach. At the Warden, try fighting with one turret intact, then clearing both. The most valuable feedback is where a hit surprised you and whether you wanted an immediate retry.

## Current preview

The ongoing local web preview uses `http://127.0.0.1:4183/`. Build and serve from the repository using Node 22.

```powershell
node scripts/build_stellar.js
node scripts/serve-static.js dist-stellar 4183
```

`/version.json` records the source commit and whether the package was assembled from a modified tree. The Firebase site `stellar-rebels.web.app` is provisioned in the existing project `star-strike-rush`. Public deployment and Expo EAS mobile builds require explicit owner approval. This browser preview uses device-local data. The old site retains its existing account and saves.

The browser artifact contains all six stages, complete free progression, offline play after pack download, and the secondary Endless mode. At 320 × 568 and 390 × 844, Chromium exercised the opening combat, each boss with named fixtures, both unlocked ships, upgrade purchases, maximum-loadout replay and records after reload. A wall-clock touch run finished the original Stage 1 checkpoint. WebKit launch, pause and resume are also covered. Hardware touch and sustained physical-device performance require device testing.
