# Stellar Rebels Blender art critic ledger

The art-only review mode is UNTIL_READY, with no fixed number of independent assignments. Review the renders and representative actual gameplay when available. Readiness requires original and distinct silhouettes at phone scale, coherent faction materials and lighting, readable attacks and pickups, correctly anchored alpha sprites, faithful collision and weapon geometry, editable sources, repeatable exports, and no open material defects. The product ledger is maintained separately.

## Fixed art rubric

Originality, silhouette and role recognition 25%, modeling and proportion 15%, materials, lighting and faction cohesion 15%, visual integration and mobile readability 25%, alignment, transparency, animation and reproducibility 20%. Report assessed portions and evidence limits with the candidate ID. Substantial later changes need fresh independent coverage. Targeted fixes can be checked by the same critic.

| Batch | Candidate and evidence | Dispatch and report | Findings, correction and verification |
| --- | --- | --- | --- |
| Stage 1 vertical slice | `a7e66200ba87f27dfd9b1fc19021273ca40d10f1`, individual alpha sprites, legacy comparisons and 320 × 568 / 390 × 844 Chromium captures | Art critic 1, `art_slice`, FIXES REQUIRED, 66/100 | ART-S1-01–05. See corrections and verification below. |
| Revised opening verification | `cd22e945fc8f92df817041818daaf53883794655`, matched treatments, Vesper boss and inner fleet | Same critic, targeted retest, FIXES REQUIRED, 77/100 | Verified Vesper overlays, uniform scaling and cover consistency. Kept finish and linked anchors open. Added ART-V3-01 and ART-V3-02. |
| Full route, revised materials and outer fleet | `ff2e1db56c129c8defa5487a3bcb02e256f40298`, all six stages and finished graded plates | Art critic 2, `art_full`, HOLD, 83/100 | ART-F01–03. Verified source renders, alpha bounds, major silhouettes and grade. |
| Full-route focused retest | `3e9d3fde4275214006c37ac42d113e593ec3b2dd`, pack `168e4072b985801` | Same art critic, READY, 88/100 | All three findings passed on exact 320 × 568 and 390 × 844 captures. |

## Opening discovery and corrections

| Finding | Change |
| --- | --- |
| ART-S1-01 · High | Enemies open fire below the score row. The compact boss label is one line, boss entry settles lower and the intro ends before the first attack. Pickup timing stays in the HUD. |
| ART-S1-02 · High | Added overlapping stepped plates, cooling and recessed hardware to Warden and Gunner, with separate surface projections and smoother coated canopy glass. |
| ART-S1-03 · Material | Shared the actual tilt calculation between the guns and the ship. Two Gunner lances use positioned barrels and a distinct profile. Diver carries a chevron before its attack. |
| ART-S1-04 · Material | The gameplay projection uses one scale for both axes at compact and tall sizes. The environment uses the full screen independently. |
| ART-S1-05 · Material | The title uses an oblique render of the same Fighter model over a new atmospheric plate. The opening environment has a graded playfield version. |

The critic reproduced 13 out of 13 sprite renders with Blender 5.2.1 from the Stage 1 pipeline at 32 samples. Four texture images were packed into the source. Original Star Strike RUSH art served as the finish reference. Its detailed ships exposed the early render's flatter materials and sparser silhouettes. The revised treatment is inspected in motion and at its actual displayed size.

The V3 retest found that linked Gunner fire still used its old center origin. Both modes now share the rotated rail hardpoints. ART-V3-01 moved Harrow's seam cue clear of the compact boss meter and split the paired warning into sequential cues. ART-V3-02 fixed material drift between the generator and fleet workbench by regenerating and saving all Blender batches and corresponding exports from the same source. The revised pressure shell is curved and uses a coated low-roughness surface. The original cover showed flat opaque-looking geometry.

New backgrounds are derived from two horizon-only ImageGen atlases. The playfield renderer crops without stretching and grades the plates beneath the live combat layer. Reuse the illustrated width and reduced contrast away from the edges. Keep bright solid fills, distinct leading silhouettes and separate halo shape for enemy fire, friendly fire and equipment.

## Full-route discovery and correction

The critic opened exact runtime shots from all six stages and ran touch in Chromium at 320 × 568 and 390 × 844. Blender 5.2.1 opened all four editable batches with four packed surface textures each. The critic rerendered the Fighter, Harrow, Gravity Platform and title craft. All four matched the committed PNG data. Every one of the 21 foreground sprites had clean alpha bounds.

| Finding | Correction |
| --- | --- |
| ART-F01 · Blocker | Harrow's queued next seam could be mistaken for the opening in the leading row. The live seam now follows the actual stones in pale teal. The next seam uses a separate amber dashed forecast near its launch point. The second warning starts later, and both rows launch clear of the boss hull. |
| ART-F02 · Material | At compact size the boss meter covered the Gravity Platform's upper lobes. The Platform settles 24 world units lower to reserve that clearance. |
| ART-F03 · Material | The Rail Ship's beam could appear disconnected when baited sideways. Its forward muzzle now projects a visible targeting link and focusing lens into the locked stripe. The Flagship uses the same cue. |

The independent recheck reproduced the previous Harrow attack and verified that the shipped rows keep their own marks through warning and descent, in default and high contrast. The Gravity Platform clears the compact HUD at peak bob by 1.6 CSS pixels and the tall HUD by 69 pixels. Both off-axis rail attacks remain attached to a visible emitter and focal lens. The critic accepted the art at these browser sizes. Debris can skim the lower hull briefly during release, and the compact HUD trims a thin upper edge of the Rail Ship and Flagship in some poses. The attack cues and roles remain legible. Physical-device rendering remains outside the measured evidence.
