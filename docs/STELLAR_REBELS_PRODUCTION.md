# Stellar Rebels production plan

## Repository audit and decision

The baseline is Star Strike RUSH `origin/main` at `214cd64ec37c50d8921b0d0d0e188ad8038956b4`, checked out clean. Remote history includes `pre-competition`, Glory/Prestige, competition verification, build-week polish, preview and performance branches. The live Hosting version endpoint returned the same SHA and reported public competition paused. Matching live backend identity requires separate verification. This build starts from `main`, with the baseline preserved at `legacy/star-strike-baseline`. No Stellar Rebels critic ledger was found in the checkout, branch history, or matching project files.

| Area | Current behavior and production decision |
| --- | --- |
| Runtime | Ordered scripts own a fixed 60 Hz Canvas 2D update, DPR cap, named actions, movement rules, sprite pivots and hit circles. Arcade reuses the fixed step, input vocabulary, collision primitive and applicable attack math. Keep the simulation independent of Canvas and persistent storage. Use DOM for menus, HUD and dialogs. |
| Combat | Adaptive phase/wave selection, turn-before-thrust flight, auto-fire and a large roster. Stage schedules replace adaptive run progression. Keep formation, aim, shield/support and dive identities, along with the Warden's safe-gap concept and Rail Tyrant's telegraph. |
| Controls | Keyboard, virtual joystick and Ghost Shift or contextual dash. Arcade uses relative drag and keyboard, with auto-fire and no extra combat button. Ship positions follow drag deltas immediately up to their speed limit. Lifting and retouching reanchors at the ship. |
| Pause | Legacy standard runs consume health, tutorials do not. Make both policies free. Clear input on resize, capture loss, blur and visibility changes. Resume deliberately with a countdown and brief protection. |
| Art | Registered raster ships, original source PNGs, pickup art and tuned sprite metadata. Keep the legacy assets and owner-approved music. New silhouettes, original logo masters and HUD glyphs ship with Arcade. |
| Audio | The owner authorized both bundled MP3 tracks for distribution on July 28. Reuse the titles and document provenance. Use a small Web Audio impact, warning and pickup palette, separate persisted music/effects controls, and gesture-only startup. |
| Saves | Legacy meta v3 carries cumulative Glory, record, achievements, Codex, settings and identity. Account/device comparison is strongest whole save with a single-owner binding. Prestige at 300,000 Glory is historical and grants no power. Archive the readable local Glory, Prestige and best score in Arcade Records. Preserve original keys and legacy account access. Apply no automatic balance conversion. |
| Firebase | Live account functions cover identity, handle claims, strongest-save selection and deletion, with public submissions/league mutation closed. Browser-verifiable claimed scores are insufficient. Arcade runs locally, launches no Firebase connections, writes no legacy data, and does not submit rankings. Keep Rules, backend, and account/release identities intact. |
| Packaging | Existing Firebase static build, web manifest and exact-SHA release approvals. The new artifact boots Stellar Rebels at the root of the same Hosting project and retains a same-origin `/legacy/index.html` for existing records and account access. The legacy source and build remain separately runnable. No tracked native package or billing integration surfaced. |
| Tests | 43 legacy test files plus Rules and client emulator suites, visual QA and performance soak. Preserve coverage and update the pause expectation. Add tests for Arcade control, economy, all bosses, unlocks and offline boundaries. |

Canvas 2D meets the sprite scale and fixed-step requirements with the current tooling. Phaser would replace integration seams that already work. Godot adds a port and native release pipeline without resolving an observed constraint. Keep Canvas, isolate new source in `arcade/`, and minimize changes in legacy shared code. Rendered 3D remains an art pipeline choice. Rebrand the existing repository's game and production build. Keep the Firebase project ID `star-strike-rush` and deploy only through the existing build-specific gate. The Firebase console display name can be updated independently of its immutable project ID.

## Player experience

Launch → **Play** → Stage Select → Launch → dodge, aim by positioning, collect → result → Next Stage or Retry. The selected stage and ship can be changed before launch. The hangar presents three craft plus four shared upgrades. The records card reports local achievements and offers a legacy archive. Endless is a compact row on Stage Select with survival and score, using the same systems. It grants zero Salvage so that shortest attempts and survival loops cannot displace the campaign economy.

The six proposed stages form one assault on the Dominion's relay network. Each needs a movement problem that can be learned and an encounter that rewards solving it. Stage 1 teaches through the first contact, with a short inline drag/auto-fire cue and optional Flight School. Show a new attack alone before combining it. Brief quiet stretches let players read the environment and reach pickups. Pressure comes from combinations and geometry, with moderate durability increases only for readability. Author each schedule and make guaranteed pickups recognizable. Retry fully resets transient resources.

| Stage | Environment | Formation challenge | Boss and answer |
| --- | --- | --- | --- |
| 1 · The Breach | Rust-orange limb and debris lanes | Chevrons and scouts, then aimed lances alongside dives | Gatekeeper. Read two turret charge marks and focus each marked turret to remove its stream. |
| 2 · Glass Belt | Violet asteroid shadow | Sweep patterns create lanes to cross while diving scouts punish parking | Debris Warden. Move through the open seam in announced paired debris walls. |
| 3 · Dead Signal | Teal broadcast ruins | Exposed command craft and escort orbits | Relay Matron. Cut visibly linked nodes to shut down protection, then exploit the exposed core. |
| 4 · Red Meridian | Red radiation horizon | Alternating rail warnings and diagonally advancing formations | Rail Tyrant. Bait the rail at your old position, then leave the locked stripe. |
| 5 · Hollow Sun | Amber crescent and distant dust | Flanking support, rotating wedge fire and late crossfire | Siphon Core. Read pull lanes and hit the exposed wings or work the opening between spinning fire. |
| 6 · Crownfall | Cold eclipse edge | Combine attacks with escalating, distinct spacing and reaction windows | Meridian Crown. Break two pylons, then learn a marked gap sequence and the final crossing windows. Show a finale and return to replayable stages. |

Prototype wave sections at 145–175 seconds plus a 30–70 second climax. Give the first launch contact within three seconds. Require every stage to clear at base equipment in deterministic coverage and calibrate real difficulty across real human runs. Stage rejection criteria include unavoidable patterns, waiting through repeated openings, indistinct damage signals and power requirements the hangar fails to communicate.

## Ship and progression contracts

| Ship | Weapon pattern | Tradeoff | Unlock |
| --- | --- | --- | --- |
| Kestrel | Twin parallel bolt lanes | Responsive, generous hull, reliable concentration | Start |
| Needle | Quick narrow center lance | Swift repositioning and concentrated fire, fewer hits to failure | Clear 2 |
| Bastion | Wide off-axis salvo | Controls flanking formations, slower lateral movement, stronger hull | Clear 4 |

Upgrades share one Salvage balance. Trigger purchases after reading fresh state, check prerequisites and balance, and save the debit and upgrade as a single write. No currency storage capacity. Show exact deltas and prices in the hangar. Starter play must be intact at rank zero. Enemy damage and health stay independent of upgrades.

| Permanent upgrade | Initial effect | Trial cost |
| --- | --- | ---: |
| Calibrated Rails | +8% weapon damage | 70 |
| Cycling Chamber | +9% rate of fire | 125 |
| Resonant Cells | +10% weapon damage | 210 |
| Ablative Hull | +1 hull segment across all ships | 95 |

All three weapon improvements together add about 30% sustained damage. The only defensive improvement buys one extra mistake. Initial first-clear bonuses move from 78 to 178 Salvage. Repeat rewards scale from 16 to 46. Bounded active-play payouts on defeat use wave progression and demonstrated kills, with reduced payout for repeat failures on the same stage until a clear or advancement. Terminal state is the only award boundary. Retrying a level or boss checkpoint cannot reissue the same result. No checkpoints in campaign or Endless. Start decisions, best records and unlocks persist across sessions. Freeze record context with ship, loadout, assistance settings, rules version, score, duration and result. Local saves can be edited by device owners and carry no online authority.

Weapon Power adds flank fire for a sustained interval. Barrier absorbs two hits until exhausted or the stage ends. Repair restores up to two hull. Overdrive accelerates and intensifies the current weapon for a short interval. Guaranteed pickups appear as recognizable drifting equipment on authored beats and can be missed. Repair appears before high-pressure sections, with difficulty calibrated around avoiding hits and adequate starting hull. Mods, buffs and FX clear at launch/leave.

## Interface and visual direction

Signal-orange ignition against blue-black space, bone-white technical type, titanium hangar panels, turquoise player plasma and coral hostile fire. Design the title around a real illustration, a clear original emblem and one primary CTA. Frame views with hairlines, clipped corners and a compact instrument family. Stage environments use low-contrast depth and limited colors under vectors and sprites. Enemy silhouettes and projectile geometry take priority over backdrops. Use generated visual concepts, then draw live copy, bars, icons and interaction states deterministically. Verify 390 × 844 and 320 × 568, with 44 CSS px controls and compact cinematic crops.

Concept manifest and contact sheets accompany this plan. Plan for title and launch, route map, ship bay, shop, stage launch, combat, boss variants, power-up feedback, pause, defeat, clear, stage and ship unlock, purchase, records, Endless combat/result, settings/help and offline recovery. Billing is deferred from this artifact pending real platform configuration and owner release authorization. There is no in-game purchase or restoration screen in the initial web build. A US $4.99 full unlock remains a commercial hypothesis for a separately verified release.

## Asset and export plan

Maintain editable `.blend` workbench and scripted Blender geometry, materials and render settings. Compile centered transparent sprites, with intentional blank space, aligned collision circles and hardpoints. Aim the player up and enemies down in screen space. Use a near-overhead orthographic camera, soft top-left key, colored edge light, ceramic against dark metal for friendly hulls, and dark oxidized metal, copper and warning resonators for enemies. Give each hull a silhouette that reads without faction colors. Keep tiny surface markings secondary. Inspect at phone size on the real background and check the full-alpha boundary, aiming origins, centered collider and legible threats.

Batch one begins with Kestrel, scouts, aimed lancers, divers, Gatekeeper and FX. Batch two rolls out the remaining ship, enemy, boss, module and pickup families in sync with content. Reuse the staged audio tracks. Build unique clear shapes for power, barrier, repair and overdrive. Render campaign environments with isolated shapes and retain stable exposure below the gameplay layer.

Create editable logo directions around a flight chevron, orbital slash and signal pennant. Select for readability in a small app icon and on the title. Export true paths in stacked, horizontal, emblem, light, dark and mono versions with transparent PNGs. Use a mask-safe square app icon and the existing web packaging sizes plus a 180px Apple touch icon.

## Implementation, verification and review

1. Freeze the design candidate with actual concepts, manifest, wordmark options and this plan. Use product review 1 with a visual inspection and same-reviewer correction check.
2. Build Stage 1, input, lifecycle pause, clean run boundaries, art and one meaningful buy. Verify home-to-stage, failure/retry, no interruption injury, and starter clear. Start the art loop on the first real batch.
3. Complete three stages, the second ship, hangar, four pickups and Endless. Capture browser evidence, including compact touch, real fights and rewards. Use product review 2 and verify corrections.
4. Add stages 4–6 and the third ship after the slice, finish artwork and records, package the offline build, and run release tests. Recheck art material changes against the latest render and in-game evidence.
5. Freeze the complete release candidate and use product review 3. Fix and verify justified findings. Identify reviewed and final snapshots. Establish readiness only against the tested platform and device evidence.

Acceptance includes functional boot, accessible menu/focus controls, deterministic pause/resume, clean progression and records after reload, idempotent settlements, consistent input at 30–120 Hz, appropriate warnings and collision readability, offline launch after pack download, no runtime errors, and smooth sustained play at representative viewports. Physical phone tests need a connected device or human evidence. Browser touch and performance probes measure their own environments only. Human playtesting, real customer willingness to pay, signing and a store submission require evidence beyond local automated tests.

## Decision log

Committed requirements are Arcade-first flow, secondary Endless, relative touch, safe pause, three materially different ships, one bounded progression economy, untouched historical data, and separate review ledgers. Chosen implementation decisions are an offline PWA in the existing Hosting build, local Arcade records, free complete access in this artifact, keyboard as the second control path, zero Endless currency, and no active ability. Trial values are timings, durability, pickup locations, currency prices, pressure and speed. Tune them against measured play. Production deployment requires the existing exact-build approval. Billing is outside this build.
