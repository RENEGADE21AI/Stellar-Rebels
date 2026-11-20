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

`/version.json` records the source commit and whether the package was assembled from a modified tree. The pinned browser artifact is `def5edaa4059a335ddf2a370b27ce508e496f428`, pack `4b5b85cac8444a6`. All 65 web payload files in the portable archive match the clean artifact by SHA-256. The Firebase site `stellar-rebels.web.app` is provisioned in the existing project `star-strike-rush`. Public deployment and Expo EAS mobile builds require explicit owner approval. This browser preview uses device-local data. The old site retains its existing account and saves.

The browser artifact contains all six stages, complete free progression, offline play after pack download, and the secondary Endless mode. At 320 × 568 and 390 × 844, Chromium exercised the opening combat, each boss with named fixtures, both unlocked ships, upgrade purchases, maximum-loadout replay and records after reload. A wall-clock touch run finished Vesper Orbit in the frozen three-stage checkpoint. WebKit launch, pause and resume are also covered. Hardware touch and sustained physical-device performance require device testing.

## Browser evidence

On `def5edaa4059a335ddf2a370b27ce508e496f428`, an automated pilot used ordinary touch events in real time to complete five minutes of Endless. It survived with five hull and 53,557 score. Host Chromium recorded a 16.7 ms p95 render interval across 18,002 frames, with zero intervals over 34 ms in that test. The packaged build transfers about 0.51 MiB of cold resources through the first actionable title, and the complete offline pack is about 9.50 MiB including both music tracks. The stock Endless scene's source images total about 9–11 MiB decoded at 4 bytes per pixel, estimated from dimensions and including the upper range from the independent preload inventory. Browser and GPU memory overhead are outside that estimate.

The first combined regression pass exposed two stale legacy WebKit expectations for the removed pause health charge. After updating them, the 216-case suite passed. The final combined run passed 219 of 220 cases. The one legacy tutorial restart scenario that timed out in the combined run passed on the unchanged revision in isolation. The five exact Arcade browser tests and ten model tests passed. They cover Chromium touch through a real rail strike, free pause, WebKit launch and resume, keyboard Hangar focus, IndexedDB transactions, cache recovery and the simultaneous Repair regression. WebKit's first attempt on isolated port 4190 was rejected before any HTTP request. The same artifact passed at 4183 and 4191.
