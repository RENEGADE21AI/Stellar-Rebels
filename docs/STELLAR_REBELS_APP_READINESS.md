# Stellar Rebels browser-to-mobile review

## Brief

The deliverable is the playable six-stage arcade shooter at [stellar-rebels.web.app](https://stellar-rebels.web.app/), plus the preparation needed to enter an app-store-intended Expo EAS validation build. The audience is people who want a quick, readable portrait arcade shooter with a satisfying route to clear and replay. Core scope covers all public browser journeys, compact and tall phone layouts, game feel, combined art and audio, save and update integrity, and the native handoff. The game is fully free and ad-free. Accessibility and reliability apply to the normal browser experience. Human retention, physical-device performance, native runtime behavior and store review require their own evidence.

Mode is **UNTIL_READY**, with no numerical round cap. The existing three historical product reviews remain recorded in [the original ledger](STELLAR_REBELS_PRODUCT_REVIEWS.md). This ledger begins a newly authorized whole-game loop. [Production art reviews](STELLAR_REBELS_2D_ART.md) have their own scope. The incremental spending ceiling is US $15. The existing public Hosting target is the only authorized deployment. Native builds and store submission require explicit owner approval.

## Fixed scoring and acceptance

| Category | Weight | Scope |
| --- | ---: | --- |
| Visual quality and consistency | 15% | Actual playfield, audio-visual coherence, responsive menus and readable combat art |
| Usability and intuitive workflows | 20% | First flight, touch and keyboard, confidence in hazards, choices, pause, retry, continuation |
| Functionality, usefulness, completeness | 20% | Flight rhythm and quality, progression, Wraith and ordinary Ghost Shift, earned ships and replay value |
| Reliability and correctness | 20% | Offline boot and repair, atomic results, save recovery, session-safe pack updates, deterministic replay |
| Security, privacy, accessibility | 10% | Read-only scope verification, asset and origin boundaries, inclusive presentation and interaction, truthful privacy |
| Performance and operating costs | 10% | Host frame and asset measurements at both sizes, browser and packaging limits, actual spending |
| Overall cohesion and polish | 5% | The six flights form a journey, meaningful choices read in play, the main loop stays simple |

Reviewers score each category out of 10. Aim for exceptional execution with the fixed rubric. A high grade alone cannot satisfy readiness. Release gates require a clean versioned public build, actual representative gameplay at both sizes, no unresolved high or critical launch-scope findings, reliable save and update recovery, and verifiable bundle configuration that can enter owner-approved build validation. Missing human, physical-device or approval evidence is reported separately. Record each independent assessment, dispositions and post-fix checks before opening a fresh review.

## Round 1 · live 426ec6a

Independent reviewer `product_live_round1` tested the exact public `426ec6aeb30aca67d4913bc65a071a3016091255` / `9917fe866b8d0e7` and matched the served game module to clean local source. Verdict **FIXES REQUIRED** and **8.28/10 for the browser scope**. Native evidence was outside the frozen candidate.

| Category | Score | Independent assessment |
| --- | ---: | --- |
| Visual quality and consistency | 8.7 | Strong title, fleet silhouettes and hazard shapes. Compact in-flight text needs prioritization. |
| Usability and intuitive workflows | 7.8 | Direct continuation, retry and ship selection. Keyboard pause, Wraith wording and lack of launch feedback interrupt play. |
| Functionality, usefulness, completeness | 8.7 | Six complete flights, three stock craft, earned progression, realm combat, Endless and exportable replays. Some regular wave sequences are predictable. |
| Reliability and correctness | 8.3 | Settlement and cache recovery passed. Slow art held launch controls. A separately simulated update from a much older controller remained unverified offline. |
| Security, privacy, accessibility | 7.9 | Local profile, restrictive Hosting headers, reduced motion, contrast and shape cues. Focused keyboard activation and Wraith naming need attention. |
| Performance and operating costs | 8.0 | Normal host play held approximately 16.7–16.8 ms p95 at DPR 1. High-DPR tall layout left less headroom. The review incurred $0. |
| Overall cohesion and polish | 8.5 | The art, combat decisions and progression reinforce a cohesive arcade loop. Three usability gaps recur at prominent moments. |

The reviewer cleared seven live natural-clock flights with Chromium touch and telemetry-guided steering. Stock Fighter cleared Vesper at both sizes and Asteroid at 390×844. Stock Interceptor cleared Relay at 320×568 and Red Sun at 390×844. Stock Gunship cleared Outer at 390×844 and Flagship at 320×568. The six stage exports verified in Node. The later-stage fixtures preloaded earlier clears for entry and played every encounter from its opening. Compact Vesper destroyed both cruiser guns, earned 78 Salvage, installed Rails for 70, entered the next flight and retained the stage unlock and remaining 8 Salvage after reload. Live defeat and Retry reset hull, energy and Barrier and issued a new seed. The reviewer also exercised all three ship views, both Flight School routes, Endless at both sizes, two-finger Shift, returning fighters, Wraith Hops, settings, and decoded flight audio. These tests establish game behavior and coverage. Human difficulty, sound mix and enjoyment remain unverified. [Independent round evidence](../../evidence/independent-live-426ec6-review/)

The reviewer ran 5 live browser and 16 model regressions. Chromium and WebKit produced separate verified Endless replays. The exact public update receipt from the primary agent records `cdeb471966c4882` → `9917fe866b8d0e7`, with the paused flight and cached old art available offline before activation. In a separate simulated, offline-only transition from the much older `b96179751255275`, the reviewer retained the flight and old art but the document stayed on the old worker. The approved update journey stages a complete published generation before offering an explicit update at the menu. [Live update receipt](../../evidence/round-one-update/update-verified.json)

| ID | Severity and reproduced issue | Coordinator disposition and evidence |
| --- | --- | --- |
| SR-WEB-01 | Medium. Space on a focused Pause button was consumed by the flight ability shortcut. Enter activated Pause. | Scope Space to the playfield or default control activation. Recheck energy and keyboard pause at both target sizes. |
| SR-WEB-02 | Medium. Wraith's charged warning and accessible button said Shift while the visible button said Hop. | Align the intro, warning, visible button and accessible labels. Show the player's realm and the destination. When energy is low, recommend dodging. Recheck touch, keyboard and both realms. |
| SR-WEB-03 | Medium. Holding one valid environment response for 11.5 seconds made existing navigation appear unresponsive. The old request launched even after attempted navigation away. | Show preparation and cancellation, restore focus and remove the unstarted run. Give art a 3.2-second loading budget and fall back to the readable starfield and silhouettes as needed. Recheck held and failed requests in a disposable context. |
| SR-WEB-04 | Low. With device scale factor 3, unthrottled tall Vesper measured 50, 33.3 and 33.4 ms p95 on different samples. With 4× CPU throttling, their first sample measured 100 ms compact and 133.4 ms tall. | Precompose each static plate and preserve the existing crop, grade, moving stars and logical field. Reprofile matched openings plus active boss combat. Carry physical performance as a device validation item. |

Keep the ship silhouettes, fixed combat field, cruiser crossing, bounded single-currency upgrades, and direct Next Flight and Retry actions. Retain recognizable regular formations as part of the classic cadence. A future challenge adjustment needs human evidence at normal and fully upgraded profiles.

[Complete round 1 record](stellar-product-critics/round-01.md)

## Round 2 · live e3e3e29

Independent reviewer `product_live_round2` verified `e3e3e2959c900537be8cda45e3d7274c51993ce4` / `c1902aaf54e4875`. Discovery graded the browser scope **8.4/10** and returned **FIXES REQUIRED**. The shipped game passed the core journeys. Reliability and the no-open-High gate failed because an interrupted update could hide the installed game behind an unplayable splash screen.

| Visual | Usability | Functionality | Reliability | Security, privacy, accessibility | Performance and costs | Cohesion |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 9.0 | 8.4 | 8.8 | 7.0 | 8.6 | 8.8 | 8.7 |

All six stages cleared at natural speed using live touchscreen events. The reviewer also completed five minutes of Endless with 54,509 score and five hull, observed a natural compact defeat, verified upgrades and receipts on the public site, measured the main flows on two portrait sizes and independently ran the native file proof in both browser engines. The primary agent ran 228 local regression cases and seven targeted public browser cases, verified the actual public update from `9917fe866b8d0e7`, and completed a separate five-minute live Endless run with 52,899 score and five hull. [Independent evidence](../../evidence/independent-e3e3e29/) · [Public update](../../evidence/round-two-update/update-verified.json) · [Author Endless](../../evidence/round-two-live-endless/flight.json)

The same reviewer independently resolved SR-WEB-01 through -03 on this exact candidate. The Wraith matched its button, prompt and current realm at both sizes. Cancelling held art allowed immediate navigation and left no active run. The next flight used fallback art after 3.40 seconds. The author’s matched simulation measured opening p95 of 66.7→16.7 ms compact and 116.7→33.3 ms tall in Chromium with 4× synthetic CPU throttling and DPR 3. The same Flagship fixture improved 116.7→50.1 ms compact and 200→66.7 ms tall. The independent reviewer measured 133.2→33.4 ms p95 in a separate, matched tall Wraith sample. Physical thermal behavior, memory and timing remain open. [Author opening](../../evidence/round-two-performance-stress.json) · [Author Flagship](../../evidence/round-two-performance-boss.json) · [Independent recheck](../../evidence/independent-e3e3e29/prior-findings-verification.json)

**SR-D02-01 · High.** With a verified 72-entry installed cache, a successful HTML response for an alternate generation and a `503` on its module stranded the live worker’s user on the splash. The initial reproduction bypassed the service worker. The reviewer repeated it and explicitly confirmed `fromServiceWorker: true` and the intact installed cache. The corrected worker serves its complete cached document, protects active flights, and exposes a new generation only when its own worker has cached the whole pack. Recovery from missing or evicted current files verifies the same generation and has a bounded wait. An older worker's code can govern the first navigation during migration. Once the new worker takes control it applies the complete-generation policy. [Before](../../evidence/independent-e3e3e29/partial-rollout.json) · [Controlled regression](../../evidence/round-three-rollout/rollout.json)

[Complete round 2 record and recheck](stellar-product-critics/round-02.md)
