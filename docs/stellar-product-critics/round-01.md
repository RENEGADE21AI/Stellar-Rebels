# Independent product review 01

Reviewer `product_live_round1`. Discovery verdict **FIXES REQUIRED**. Weighted browser score **8.28/10**. The clean public commit was `426ec6aeb30aca67d4913bc65a071a3016091255`, asset pack `9917fe866b8d0e7`. The served app module matched the packaged module byte for byte and the candidate stayed unchanged during discovery. The native source was outside this review candidate.

## Findings

**SR-WEB-01 · Medium · Keyboard Pause.** At both portrait sizes, Tab twice from the live playfield focuses Pause. Space leaves the dialog closed while Enter opens it. The global ability shortcut consumes the native button action and can spend Ghost Energy. Preserve the focused button action and retest Space on both the playfield and focused controls.

**SR-WEB-02 · Medium · Wraith terminology.** In the tall live Wraith fight, the charged attack said “Dodge or Shift out of physical fire.” The visible control said “Physical / Hop,” and its accessible name stayed “Ghost Shift.” The mismatch complicates a decision during the 1.04-second telegraph. Use Hop consistently and expose the player's current realm and the destination. Verify both realms, keyboard and touch, with and without enough energy. [Observed frame](../../../evidence/independent-live-426ec6-review/5-390/wraith-ghost.png)

**SR-WEB-03 · Medium · Slow launch response.** Before service-worker control, the reviewer held only the valid background response for 11.5 seconds. The stage list showed enabled-looking controls and no preparation status. Back and Change ship had no effect. Releasing the response still launched the flight. Announce preparation, allow cancellation, bound asset waits and verify that a cancelled preparation cannot launch or leave an unstarted run. [Fault injection](../../../evidence/independent-live-426ec6-review/launch-stall/report.json)

**SR-WEB-04 · Low · Tall rendering headroom.** At DPR 3 on desktop Chromium, compact unthrottled Vesper p95 was 16.7 ms. Three tall samples were 50.0, 33.3 and 33.4 ms. The two repeats tracked wall time. Under 4× synthetic CPU throttling the first sample measured 100.0 ms compact and 133.4 ms tall with the game clock falling behind. Profile background composition and canvas scaling, including an active boss. Physical-device performance remains unverified. [Stress check](../../../evidence/independent-live-426ec6-review/performance.json) · [Tall repeats](../../../evidence/independent-live-426ec6-review/performance-repeat-tall.json)

## Executed coverage

- Seven natural-clock HTTPS flights cleared using telemetry-guided Chromium touch. Stock Fighter flew Vesper at both sizes and Asteroid at 390×844. Stock Interceptor flew Relay at 320×568 and Red Sun at 390×844. Stock Gunship flew Outer at 390×844 and Flagship at 320×568. Stages 2–6 preloaded earlier clears solely for entry. All subsequent waves, touch motion, hull, boss attacks, outcomes and settlement were real. Six campaign replay exports verified.
- Both natural Vesper clears took approximately 2:38, compared with approximately 2:57 in an earlier supplied run. The compact pilot disabled both cruiser guns. The crossing creates a reason to leave a productive firing lane, then teaches the Warden's targeting rule. Harrow’s seams, Relay’s shield links, Red Sun’s rail and Wraith’s realm windows reward different steering choices. Some repeating regular waves in the middle of Relay and Red Sun are predictable.
- Compact Vesper banked 78 Salvage, bought Rails for 70, started Stage 2 with Next Flight and kept its unlock and 8 Salvage after reload. A separate live defeat and Retry reset hull, Ghost Energy and Barrier and issued a new seed. The review covered pause, resume, leave confirmation, both Flight School return routes, all three ship views, Endless at both widths and remembered settings. Campaign runs recorded ordinary two-finger Shift, returning fighters and six successful Wraith hops. Music decoded and played after input. Effects were scheduled during combat. Subjective mix and hardware audio remain unverified.
- Five live browser and 16 model regressions passed, including mobile-layout WebKit pause and resume, atomic IndexedDB saves and purchases, recovery from temporary storage, cached offline boot and missing-cache repair. Distinct live Chromium and WebKit Endless seeds and exports verified. The primary agent’s paired public update test covers `cdeb471966c4882` → `9917fe866b8d0e7` with paused flight continuity, an old cached asset read offline and the explicit update at the menu. The reviewer's separate localhost check from much older `b96179751255275` retained the flight and art but reverted to the old controller. Offline-only uptake in that separate case remains unverified. [Exact public update](../../../evidence/round-one-update/update-verified.json)
- Live exercised requests stayed on the Hosting origin. The reviewer checked headers and read-only paths, and observed no ads, payments or public leaderboard writes. No incremental purchases were made. Production account billing remains unverified.

## Scores

| Category | Weight | Score | Rationale |
| --- | ---: | ---: | --- |
| Visual quality and consistency | 15% | 8.7 | Strong title and fleet silhouettes. Readable projectile shapes and consistent portrait frame. Compact in-flight text needs prioritization. |
| Usability and intuitive workflows | 20% | 7.8 | Direct Next Flight and Retry, ship choices and appropriate touch targets. Focused Space, launch feedback and Wraith wording interrupt play. |
| Functionality, usefulness, completeness | 20% | 8.7 | Six playable flights, three stock craft, earned progression, Ghost Shift, realm combat, Endless and replay export. Some regular waves are predictable. |
| Reliability and correctness | 20% | 8.3 | Settlement, retry and offline save recovery hold. A slow asset creates a navigation stall. Older offline update case remains open. |
| Security, privacy, accessibility | 10% | 7.9 | Local progression, narrow Hosting boundary, reduced motion, contrast and shape cues. Focus activation and Wraith naming need correction. |
| Performance and operating costs | 10% | 8.0 | Standard host gameplay held about 16.7–16.8 ms p95. The 9.49 MB pack is bounded, with about 64% from music. Synthetic CPU and tall DPR tests show headroom limits. |
| Overall cohesion and polish | 5% | 8.5 | Art, audio, combat decisions and progression form one arcade loop. The three usability gaps affect prominent player moments. |

## Scope conclusion

Correct the three confirmed usability defects and recheck their interactions. Preserve the flight footprint, meaningful weak points, gear and stage continuation, and varied tactical boss decisions. Native eligibility needs an identified staged bundle. Physical device performance, safe areas, lifecycle and audio behavior, assistive technology use and first-time human enjoyment and difficulty are open. Native builds and store submission need separate owner approval.
