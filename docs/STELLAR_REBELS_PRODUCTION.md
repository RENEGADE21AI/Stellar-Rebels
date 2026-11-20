# Stellar Rebels production plan

Current player progression, stage intent, early sessions, paid alternatives and the no-ads launch policy are specified in the [Progression and Monetization Design](STELLAR_REBELS_PROGRESSION.md). Across-stage and economy values remain subject to playtesting.

## Repository audit and decision

The original repository audit started at Star Strike RUSH `origin/main` at `214cd64ec37c50d8921b0d0d0e188ad8038956b4`. The baseline is preserved at `legacy/star-strike-baseline`. The playable Stellar Rebels release uses the six-stage `stellar-rebels/arcade` line. Product and art reviews have separate ledgers.

| Area | Current behavior and production decision |
| --- | --- |
| Runtime | Ordered scripts own a fixed 60 Hz Canvas 2D update, DPR cap, named actions, movement rules, sprite pivots and hit circles. Arcade reuses the fixed step, input vocabulary, collision primitive and applicable attack math. Keep the simulation independent of Canvas and persistent storage. Use DOM for menus, HUD and dialogs. |
| Combat | Adaptive phase/wave selection, turn-before-thrust flight, auto-fire and a large roster. Stage schedules replace adaptive run progression. Keep formation, aim, shield/support and dive identities, along with the Warden's safe-gap concept and Rail Ship's telegraph. |
| Controls | Arcade uses relative drag and keyboard with auto-fire. Ship positions follow drag deltas up to their speed limit. Lifting and retouching reanchors at the ship. Activate Ghost Shift by tapping Shift or pressing Space, including with a second finger during a drag. |
| Pause | Legacy standard runs consume health, tutorials do not. Make both policies free. Clear input on resize, capture loss, blur and visibility changes. Resume deliberately with a countdown and brief protection. |
| Art | Registered raster ships, original source PNGs, pickup art and tuned sprite metadata. Keep the legacy assets and owner-approved music. New silhouettes, original logo masters and HUD glyphs ship with Arcade. |
| Audio | The owner authorized both bundled MP3 tracks for distribution on July 28. Reuse the titles and document provenance. Use a small Web Audio impact, warning and pickup palette, separate persisted music/effects controls, and gesture-only startup. |
| Saves | Legacy meta v3 carries cumulative Glory, records, achievements, Codex, settings and identity. Account/device comparison is strongest whole save with a single-owner binding. Prestige at 300,000 Glory remains historical. Arcade Records links to the legacy site, where local values and account access remain with their original origin. No cross-origin transfer or conversion to Salvage occurs. |
| Firebase | Live account functions cover identity, handle claims, strongest-save selection and deletion, with public submissions/league mutation closed. Browser-verifiable claimed scores are insufficient. Arcade runs locally, launches no Firebase connections, writes no legacy data, and does not submit rankings. Keep Rules, backend, and account/release identities intact. |
| Packaging | The web artifact boots Stellar Rebels at `stellar-rebels.web.app`, an additional site in the existing Firebase project. The owner has standing authorization for tested releases to that site through the scoped Hosting command. Mobile builds require explicit approval after launch-quality verification. |
| Tests | 43 legacy test files plus Rules and client emulator suites, visual QA and performance soak. Preserve coverage and update the pause expectation. Add tests for Arcade control, economy, all bosses, unlocks and offline boundaries. |

Canvas 2D meets the sprite scale and fixed-step requirements. New runtime source lives in `arcade/` and reuses applicable legacy rules. The GitHub repository is named Stellar Rebels. The public Hosting site uses Firebase project ID `star-strike-rush` and target `stellar`. [Public Hosting workflow](STELLAR_REBELS_HOSTING.md)

## Player experience

Launch → **Play** → Stage Select → Launch → dodge, aim by positioning, collect → result → Next Stage or Retry. Stage Select shows the equipped craft, a direct Change Ship route, a separate Flight School link and a short target preview for available stages. Choosing an available stage launches the equipped craft. Hangar preserves the previous screen and exposes Ship Bay and Upgrades as two tabs. Select any craft to inspect its fire pattern, speed, hull and named unlock even when locked. Flight School can be opened from Stages or Settings and returns to its caller. Clear shows the actual banked reward, newly available stage, Replay, and Stages. A newly unlocked ship adds an inspect action, with a clear route back to the next stage. Settings and Records return home unless invoked from another view. The records card reports local achievements and offers a legacy archive. Endless is a secondary row on Stage Select with survival and score, using the same systems. It grants zero Salvage.

The six proposed stages form one assault on the Dominion's relay network. Each needs a movement problem that can be learned and an encounter that rewards solving it. Stage 1 teaches through the first contact, with a short inline drag/auto-fire cue and optional Flight School. Show a new attack alone before combining it. Brief quiet stretches let players read the environment and reach pickups. Pressure comes from combinations and geometry, with moderate durability increases only for readability. Author each schedule and make guaranteed pickups recognizable. Retry fully resets transient resources.

| Stage | Environment | Formation challenge | Boss and answer |
| --- | --- | --- | --- |
| 1 · Vesper Orbit | Rust-orange limb and debris lanes | Chevrons and scouts, then aimed lances alongside dives | Warden. Read two turret charge marks and focus each marked turret to remove its stream. |
| 2 · Asteroid Belt | Violet asteroid shadow | Sweep patterns create lanes to cross while diving scouts punish parking | Harrow. Move through the open seam in announced paired debris walls. |
| 3 · Relay Station | Teal broadcast ruins | Exposed command craft and escort orbits | Relay Carrier. Cut visibly linked nodes to shut down protection, then exploit the exposed core. |
| 4 · Red Sun | Red radiation horizon | Alternating rail warnings and diagonally advancing formations | Rail Ship. Bait the rail at your old position, then leave the locked stripe. |
| 5 · Outer Orbit | Cold blue rings and a low-lit ice frontier | Phantoms alternate solid rounds and hollow diamonds alongside ordinary formations and scattered gravity lanes | Wraith. Match its realm to damage it, dodge the shots that can hit you and hop when the opening is worth the energy. Gravity Platform remains in Endless. |
| 6 · The Flagship | A dark orbital shipyard | Combine attacks with escalating, distinct spacing and reaction windows | Flagship. Break both pylons, then read the marked debris and rail warnings through the final crossing spreads. |

Prototype wave sections at 145–175 seconds plus a 30–70 second climax. Give the first launch contact within three seconds. Require every stage to clear at base equipment in deterministic coverage and calibrate real difficulty across real human runs. Stage rejection criteria include unavoidable patterns, waiting through repeated openings, indistinct damage signals and power requirements the hangar fails to communicate.

## Ship and progression contracts

| Ship | Weapon pattern | Tradeoff | Unlock |
| --- | --- | --- | --- |
| Fighter | Twin parallel bolt lanes | Responsive, generous hull, reliable concentration | Start |
| Interceptor | Quick narrow center lance | Swift repositioning and concentrated fire, fewer hits to failure | Clear 2 |
| Gunship | Wide off-axis salvo | Controls flanking formations, slower lateral movement, stronger hull | Clear 4 |

Upgrades share one Salvage balance. Use one versioned IndexedDB profile record and serialized read-write transactions across tabs. Re-read the profile inside each transaction before testing prerequisites, changing ownership or balance, and committing purchases atomically. Never show the upgraded stats or debit before transaction completion. Leave a failed write retryable, with the prior committed state visible. Newer unsupported save schemas open in a visibly temporary session without overwriting data. Show exact deltas and prices in the hangar. Starter play must be intact at rank zero. Enemy damage and health stay independent of upgrades.

| Permanent upgrade | Initial effect | Trial cost |
| --- | --- | ---: |
| Calibrated Rails | +8% weapon damage | 70 |
| Cycling Chamber | +9% rate of fire | 125 |
| Resonant Cells | +10% weapon damage | 210 |
| Ablative Hull | +1 hull segment across all ships | 95 |

Cycling Chamber requires Calibrated Rails. Resonant Cells requires both. Ablative Hull can be installed independently. An unaided first clear of Stage 1 can buy Rails; first clears through Stage 3 can buy Rails and Chamber or Rails and Hull, with the larger purchases still optional.

| Arcade stage | First clear | Repeat clear | Per-attempt defeat tuning value |
| --- | ---: | ---: | ---: |
| Vesper Orbit | 78 | 16 | 20 |
| Asteroid Belt | 95 | 21 | 24 |
| Relay Station | 112 | 27 | 27 |
| Red Sun | 132 | 33 | 31 |
| Outer Orbit | 155 | 40 | 35 |
| The Flagship | 185 | 48 | 40 |

All three weapon improvements together add about 30% sustained damage. The defensive upgrade buys one extra mistake. Every distinct defeat can pay after 24 active seconds, five kills and 54 world units of actual movement. Progress, a stage-specific ceiling and a rate cap keep clears more rewarding. Register a random run ID, stage, ship, rules and upgrade snapshot in an atomic launch transaction. In one settlement transaction consume that ID, decide first or repeat clear, apply Salvage and unlocks, and preserve a recent receipt. A duplicate settlement returns the receipt or a stale-run result. Expire abandoned IDs after a week. Hold a failed settlement for retry with its existing run ID. Results show banked rewards after confirmation. Freeze record context with ship, loadout, assistance, rules, score, duration and result. Device-local records carry no online authority.

Weapon Power adds flank fire for 12 seconds. A second pickup refreshes the timer. Barrier refreshes up to two hits without stacking charges. Repair restores up to two hull and shows the actual amount restored. Overdrive refreshes a seven-second fire-rate and damage bonus. Weapon Power and Overdrive can overlap. The weapon interval has a lower bound. Guaranteed pickups appear as recognizable drifting equipment on authored beats and can be missed. Repair appears before high-pressure sections, with difficulty calibrated around avoiding hits and adequate starting hull. Mods, buffs and effects clear at launch and leave. The rail warns for 1.22 seconds. Debris walls warn for 1.12 seconds and mark a seam at least 94 world units wide. Harrow's paired warnings start 2.12 seconds apart and shift by up to 153.6 units. During the first row's descent its teal seam cue moves with the rocks. The queued row shows its own amber forecast above the live row. The slowest ship remains the reference for hazard timing. Preserve parallel Fighter bolts, striped warnings, white/teal hardpoint brackets, gray crossed-out disabled modules and shape-differentiated pickups. Check against the brightest background in grayscale and high-contrast mode.

Ghost Energy starts at 26 out of 100. Landed hits and kills charge it. A normal Shift costs 38, passes through physical hits for 1.05 seconds and then recovers for 1.15 seconds. Pilots can still steer and fire. Charge gain pauses during ordinary phasing. The Wraith encounter uses a persistent realm hop costing 18. In either realm, shots and vulnerable targets must match. The Wraith alternates realms, so a pilot can wait for a matching window if low on charge. A charged fan locks its direction and realm at the start of the telegraph. Phase time and charge freeze during pause and reset on a fresh run.

## Interface and visual direction

Signal-orange ignition against blue-black space, bone-white technical type, titanium hangar panels, turquoise player plasma and coral hostile fire. Design the title around a real illustration, a clear original emblem and one primary CTA. Frame views with hairlines, clipped corners and a compact instrument family. Stage environments use low-contrast depth and limited colors under vectors and sprites. Enemy silhouettes and projectile geometry take priority over backdrops. Use generated visual concepts, then draw live copy, bars, icons and interaction states deterministically. Verify 390 × 844 and 320 × 568, with 44 CSS px controls and compact cinematic crops.

Concept manifest and contact sheets cover title and launch, route map, ship bay, upgrades, combat, boss variants, power-up feedback, pause, defeat, clear, unlocks, records, Endless, settings, help, offline readiness and local storage failure. The six-stage game is free and ad-free. A later standalone content expansion is the commercial hypothesis worth evaluating once the core has active players. [Monetization decision](STELLAR_REBELS_MONETIZATION.md)

## Hosting and legacy boundary

Build the player website at `/` and publish through the scoped `stellar` Hosting target. The fingerprinted `/arcade/` subtree contains the fixed pack, and `version.json` identifies its commit. The original Hosting origin owns its device saves and account data, linked from Records. Source art, credentials, test fixtures and developer tools stay outside the public artifact. An installed worker retains the pinned files used by open pages. The menu offers an update once the new pack is ready. New online navigation gets the current page, with the installed document as an offline fallback. If the cached pack is evicted, reconnecting and loading the game repairs it. Device saving has its own recovery path. [Public Hosting workflow](STELLAR_REBELS_HOSTING.md)

### Gameplay and monetization steering

The campaign has six stages. Ordinary Ghost Shift is available in Arcade and Endless. The Wraith's persistent realms are confined to its encounter. The free core includes every ship, stage and upgrade. Mobile builds use Expo EAS after launch-quality verification and explicit owner approval. Project ceiling is US $15.

`-StageBackendPreview` currently deploys shared live Functions and Firestore Rules before opening a Hosting preview channel. It is a production infrastructure mutation despite its name. Build and smoke locally for these milestones. For a future staged release, require exact-build owner authorization before invoking the existing shared backend staging workflow. Preserve the SHA-parity check for that workflow. Do not claim hosting/backend equality from a local build or perform a silent backend deployment for a front-end rename.

## Asset and export plan

Ship new 2D artwork for the player hulls, standard hostile fleet, independent boss modules, pickups and Outer Orbit. Retain the legacy Wraith's matched realm plates, Phantom, Shieldbearer and asteroid art. Keep the Blender workbench available as source history. Aim the player up and enemies down. Favor pale ceramic and copper on the player fleet, dark metal and concentrated warning lights on hostiles. Compare actual pixels on the real playfields. [2D source and review ledger](STELLAR_REBELS_2D_ART.md)

Create editable logo directions around a flight chevron, orbital slash and signal pennant. Select for readability in a small app icon and on the title. Export true paths in stacked, horizontal, emblem, light, dark and mono versions with transparent PNGs. Use a mask-safe square app icon and the existing web packaging sizes plus a 180px Apple touch icon.

## Implementation, verification and review

1. Freeze the design candidate with actual concepts, manifest, wordmark options and this plan. Use product review 1 with a visual inspection and same-reviewer correction check.
2. Build Stage 1, input, lifecycle pause, clean run boundaries, art and one meaningful buy. Verify home-to-stage, failure/retry, no interruption injury, and starter clear. Start the art loop on the first real batch.
3. Complete three stages, the second ship, hangar, four pickups and Endless. Capture browser evidence, including compact touch, real fights and rewards. Use product review 2 and verify corrections.
4. Add stages 4–6 and the third ship after the slice, finish artwork and records, package the offline build, and run release tests. Recheck art material changes against the latest render and in-game evidence.
5. Freeze the complete release candidate and use product review 3. Fix and verify justified findings. Identify reviewed and final snapshots. Establish readiness only against the tested platform and device evidence.

Acceptance includes functional boot, accessible menu/focus controls, deterministic pause/resume, clean progression and records after reload, idempotent settlements, consistent input at 30–120 Hz, appropriate warnings and collision readability, offline launch after pack download, no runtime errors, and smooth sustained play at representative viewports. Budget ≤1.6 MiB before first actionable UI on a cold run, ≤12 MiB for the offline pack including audio, ≤1.3 million backing-store pixels, and ≤16 MiB decoded art in the most demanding scene. On a named midrange 60 Hz target such as Pixel 7a and iPhone 12, aim for median render interval near 16.7 ms, p95 ≤22 ms and under 1% of intervals over 34 ms during a five-minute late-stage or Endless run. Profile measured values independently on the host and target hardware. Browser touch and performance probes measure their own environments only. Human playtesting, real customer willingness to pay, signing and a store submission require separate evidence.

## Decision log

Committed requirements are Arcade-first flow, secondary Endless, relative touch and keyboard, safe pause, three different ships, one bounded progression economy and separate review ledgers. The public web build has free complete access, offline flight packs, device-local records, earned Ghost Energy and zero Endless Salvage. The three comprehensive product reviews are complete. Artwork uses its own until-ready review allowance.
