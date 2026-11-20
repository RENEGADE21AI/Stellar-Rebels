# Independent product review 02

Reviewer `product_live_round2`. Discovery verdict **FIXES REQUIRED**, **READINESS NOT ESTABLISHED**, weighted browser score **8.4/10**. The exact clean public review used `e3e3e2959c900537be8cda45e3d7274c51993ce4`, pack `c1902aaf54e4875`, and fingerprint `c1902aaf54e48756c9955d00d4ad545d30aac5aa79002f00eac18c592eb8357c`. The same live identity was verified at the end.

## Acceptance gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Public identity and privacy | Met | Clean disposable build matched 75 public HTTPS responses by SHA-256. The 72-entry cached pack and both instrumented journeys stayed on the game’s origin. Live CSP and device permission headers were checked. Progress is local. The named legacy archive link is explicit. |
| Game and core journeys | Met in browser scope | Six stages and bosses cleared in 2:38–3:29 each at natural speed with Chrome touch automation at 390×844. The fresh Vesper flight used Next Flight to continue to Asteroid Belt. Other pairs preloaded only earlier clears. Five minutes of Endless reached 54,509 points and five hull. At 320×568 the reviewer observed a natural defeat at 1:01. Compact fixtures and a clocked Retry covered ships, upgrades, mastery, records and a five-hull reset. Also exercised keyboard, pause, ordinary Shift, Wraith, returning fighters, pickups, music and effects. |
| Reliability and performance | Failed | Twenty-five focused browser/model assertions passed, including atomic settlement and failed-write handling, temporary save recovery, offline cache boot and repair, and slow-art cancel/fallback. Live Chromium and WebKit replays verified. A fully delivered update retained a paused flight, served old audio offline and kept a pilot setting. The partial update below stranded returning players. |
| Entry to owner-approved EAS validation | Met for technical preparation | Independently staged and inspected Expo config. The 57-file candidate ZIP matched the contents of the restaged ZIP apart from 14 generated JavaScript path comments. Both browser engines loaded the packaged file with HTTP blocked, played the music, saved through a simulated host and paused on a simulated interruption. Native verification, signing account, quota, and build approval remain open. |
| High and Critical findings | Failed | The partial rollout case below is a confirmed High. |

On Windows 11 with an i7-1360P and Chromium 149, Play appeared in about 465 ms at 320×568 and 415 ms at 390×844. The pack was ready in 3.4–4.0 s. Warm flight launch took 89–94 ms. Early-flight p95 was 16.7–16.8 ms with isolated 133 and 467 ms gaps. Post-GC JS heap was about 2.96 MB after the first and 3.03 MB after the fifth launch-and-leave cycle. The pack is 9,493,164 bytes. Review spending was $0. [Host measurements](../../../evidence/independent-e3e3e29/host-performance.json)

## SR-D02-01 · High · confirmed

An interrupted update can strand a player with a fully installed game. The reviewer first reproduced a stuck title with a navigation that bypassed the worker. That probe was rejected as evidence of worker behavior. In the valid rerun, the candidate worker answered the navigation and reported all 72 entries ready, including its cached index. The server exposed valid next-generation HTML but answered its game module with 503. The reviewed worker returned the mismatched document with HTTP 200, leaving only a splash screen without Play. A full origin outage restored the complete installed game. Restoring the absent module recovered the release. [Trace](../../../evidence/independent-e3e3e29/partial-rollout.json) · [Stalled splash](../../../evidence/independent-e3e3e29/update-module-unavailable.png)

Keep the installed document until the replacement worker succeeds in populating its own complete pack. Verify the interrupted and successful update in a browser, verify the prior cached index and controlled-navigation flag, and keep the old versioned resources usable for open flights.

## Scores

| Category | Weight | Score | Rationale |
| --- | ---: | ---: | --- |
| Visual quality and consistency | 15% | 9.0 | Distinct craft and environments, clear silhouettes and cohesive UI at two phone sizes. |
| Usability and intuitive workflows | 20% | 8.4 | Readable first-use cues, intuitive drag and auto-fire, direct pause and continuation. Combat text remains dense during busy compact moments. |
| Functionality, usefulness, completeness | 20% | 8.8 | Complete route, distinct boss roles, earned ships and gear, Endless and replays. |
| Reliability and correctness | 20% | 7.0 | Saves, offline handling and replay exercised. The confirmed rollout issue can prevent play. |
| Security, privacy, accessibility | 10% | 8.6 | Restricted origins, local progress, keyboard focus, contrast, reduced motion and shape cues. Assistive technology remains unverified. |
| Performance and operating costs | 10% | 8.8 | Fast host launch, steady typical frame pacing, stable observed JS heap, modest offline pack. Physical-phone evidence is absent. |
| Overall cohesion and polish | 5% | 8.7 | Cruiser, Relay, Wraith and Flagship give meaningfully different choices. Results show the next flight and replay clearly. |

Preserve the shape language, three distinctive handling profiles and direct continuation. Fix the rollout before sign-off. One compact natural-result replay tap did not produce a download. A focused replay and Retry rerun passed on one touch and produced a verified file. No reproducible replay defect was established. First-time human cue comprehension, repeat-play satisfaction, assistive technology, real native lifecycle, and physical-device performance remain unverified. Store acceptance and submission are separate from scope readiness.

## Same-candidate verification

The reviewer retested the four previous findings while the same clean commit and pack remained live. The discovery score and open High remained unchanged.

| Finding | Disposition | Evidence |
| --- | --- | --- |
| SR-WEB-01 | Resolved | Space on focused Pause opened the dialog without spending energy at both portrait sizes. Space on the playing field still activated Ghost Shift. |
| SR-WEB-02 | Resolved | Both sizes showed Hop, named the destination accessibly and identified the current realm. Charge-ready cues offered Hop. With zero energy the cue said Dodge and Space left the realm unchanged. |
| SR-WEB-03 | Resolved | Cancel restored stage focus and immediately allowed Hangar. IndexedDB contained zero active runs and the later image response did not launch a flight. A second attempt started with fallback art in 3.40 s while the image remained held. |
| SR-WEB-04 | Reduced | Under matched 4× CPU throttling at 390×844 and DPR 3, Wraith improved from 133.2 to 33.4 ms p95. The flight clock advanced 8.27 s over 8.28 s. An unthrottled sample measured 16.7 ms p95. Physical performance remains unverified. |

[Prior findings verification](../../../evidence/independent-e3e3e29/prior-findings-verification.json)
