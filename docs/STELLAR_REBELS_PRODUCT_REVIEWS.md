# Stellar Rebels product critic ledger

Mode EXACT. Three comprehensive independent assignments across the project. The current repository, remote branch names/history and matching local artifacts yielded no prior Stellar Rebels critic ledger or consumed review. The separate Blender ledger tracks art reviews. Marketing skill discoverability was verified during setup.

| Slot | Candidate | Dispatched | Completed report | Findings, changes and verification |
| --- | --- | --- | --- | --- |
| 1 | `71ab835d661516ac0bae72dc9cc5ab4d034b1d3c` design and actual concepts | Nov 19, product-critic `product_design` | FIXES REQUIRED | SR-D01–08. See discovery and verification below. |
| 2 | Playable three-stage candidate | Pending | Pending | Pending |
| 3 | Complete release candidate | Pending | Pending | Pending |

Remaining allowance is **2**. A dispatched assignment consumes its slot. Same-critic targeted verification stays within the designated slot.

## Fixed product rubric

Visual quality and consistency 15%, usability 20%, functionality and completeness 20%, reliability 20%, security/privacy/accessibility 10%, performance and operating costs 10%, cohesion 5%. Use the planned artifact for design claims and executed evidence for build claims. An applicable area with insufficient evidence prevents a complete score. Readiness requires passing the applicable functional, visual, reliability and packaging gates in the production plan and resolving material findings.

## Review 1 discovery

The critic opened both sheets, the three-mark board, the app icon, and all 50 concept frames. File dimensions matched 390 × 844 and 320 × 568. The critic traced first use, route, hangar, combat, boss, pickup, result, settings and recovery against the plan, then inspected legacy pause, save, Firebase bootstrap, Hosting packaging, release and performance source. The assessment was read-only. Runtime, device, touch, accessibility, account continuity, offline and commercial coverage were unavailable at this milestone.

| Category | Score and rationale |
| --- | --- |
| Visual | 8.0. Strong recognizable title and logo. Compact controls and combat cues need polish. |
| Usability | 6.0. Play, retry and Endless are clear. Loadout, help and result paths lack explicit edges. |
| Functionality | 7.0. Distinct campaign and loadouts. Settlement and tuning contracts are incomplete. |
| Reliability | 5.0. Free pause is sound. Failed saves, concurrency and cache rollover lack definitions. |
| Security, privacy, accessibility | 5.5. Local archive boundary is sensible. Shared-backend preview risk and compact hit target gaps remain. |
| Performance and cost | 4.5. Canvas reuse and capped resolution are good. Legacy thresholds and download assumptions do not prove smooth play. |
| Cohesion | 7.5. Consistent industrial language. Mock combat cues diverge from the rules. |

The critic withheld a complete weighted product score because implementation and device evidence were unavailable. First priorities were settlement integrity, dual-entry packaging and cloud gates, then navigational continuity. The critic preserved the Flare direction, distinct tactical boss premises, starter-clear requirement, and local Endless with no currency.

| Finding | Evidence and impact | Correction and verification target |
| --- | --- | --- |
| SR-D01 · Major | Tall and compact frames 03–05, 14–18, 22–23 lacked selected craft, upgrade tab, explicit help and defined result back paths. | Added equipped craft/change action, visible craft selection and unlock criteria, both hangar tabs and help. Defined win, replay, double-unlock and caller return edges. Verify these in the slice. |
| SR-D02 · Major | Plan fresh-read followed by put allowed overlapping rewards or purchases and premature banked copy. | Defined versioned transaction-owned balance, active run and receipt IDs, failure recovery, concurrent tests, and read-only historical data. Verify duplicate settlement, concurrent actions and unchanged legacy keys. |
| SR-D03 · Major | `scripts/release.ps1` can stage live backend before exact production approval. | Documented shared production side effects, exact-build authorization before staging, parity check and local-only verification. Verify the guard stops before a cloud write. |
| SR-D04 · Major | Build had one root and a future root worker could swallow legacy/Auth. Frame 24 only showed device failure. | Specified legacy paths, precache scope/version/update boundaries, manifest separation and a distinct offline-ready state. Test both entries, cold and warm offline boot and recovery. |
| SR-D05 · Material | Frames 07–12 misidentified Rail’s stage and used inconsistent bolt, warning and hardpoint cues. | Aligned stage label, striped warning, contrasted markers, disabled mark and paired bolt cues. Verify real art and hazard geometry in both sizes and grayscale. |
| SR-D06 · Material | Missing defeat cap, prerequisites, stacking, timing bounds and early affordability. | Documented the six-stage reward table, upgrade ordering, pickup refresh and boss reaction baselines. Verify base clears and payout per active minute. |
| SR-D07 · Material | Pause in compact art was smaller than 44 CSS px. Small statuses and an action-like Overdrive chevron obscured HUD. | Increased Pause drawing to 44 and replaced status button with read-only treatment. Verify DOM targets, focus, type and reduced motion. |
| SR-D08 · Material | Inherited mobile QA thresholds tolerate near-total dropped frames. | Added provisional p95/frame-drop and transfer/texture targets for named phone classes. Collect host and device evidence separately. |

The first critic returned for targeted verification of the revised concepts, source and first playable stage. The remaining save-origin and Hosting wording was corrected in the production plan after the review. The separate live-build round covers runtime journeys and observed frame behavior.
