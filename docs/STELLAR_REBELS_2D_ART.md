# Stellar Rebels production 2D art

The foreground uses cinematic stylized realism at portrait phone scale. Ships are close to overhead, with distinct silhouettes, directional light and readable material blocks. Pale panels and teal exhaust identify the player fleet. Hostile metal stays darker and uses small concentrated emitters. Combat layers stay independent of the backdrop. The existing Blender source and original public game assets remain in the repository.

## Generation and export

The reference board compared the strongest Star Strike RUSH hulls with the earlier Blender exports. The new image-generation direction used orthographic isolated objects, clean transparent boundaries, readable scale, soft upper key lighting, worn alloy and bright accent panels. The boss briefs specified empty attachment points, the Rail Ship's forward emitter and an asymmetric attack silhouette. The environment brief asked for a cold blue orbital ring at the upper edge and low exposure across the playable center. Source sheets and environment are stored in `source-art/stellar/2d/`.

| Source | Runtime use |
| --- | --- |
| `fleet.png` | Fighter, Interceptor, Gunship and shield node. The title uses the same Fighter hull. |
| `fighters.png` | Scout, Diver, Sweeper and Command Ship. |
| `command.png` | Warden, Harrow, Relay Carrier and Rail Ship. |
| `hardware.png` | Flagship, Gravity Platform, Gunner and Warden turret. |
| Legacy pickups | `phase-shield.png` for Barrier, `dual.png` for Weapon Power, `repair.png` for Repair and `rapid.png` for Overdrive. Mint treatment on Repair separates it from the blue Barrier. The generated sheet stays as source history. |
| `outer-orbit.png` | The low-density Outer Orbit gameplay plate. |
| `cruiser.png` | Wide passing ship with two empty mounts for the separate copper turrets. |
| `wraith.png` | A new graphite crescent and central crystal with a separately graded purple realm plate. The two exports derive from the same alpha mask. Both legacy Wraith plates remain in the original asset directory. |
| Legacy `enemy-phantom.png`, `enemy-shieldbearer.png` and `asteroid-rock-1.png` | Reoriented Phantom, Escort and debris, sized against current roles. |

Run `python scripts/prepare-stellar-2d.py` with Pillow to reproduce the runtime sprite files. The Fighter uses the individually generated `source-art/stellar/2d/fighter-nozzle.png` and exports into a 600-pixel cell. The built-in ImageGen edit preserved the Fighter’s top-down ivory and teal silhouette, replaced its rear spike with a short recessed rocket nozzle, and left the exhaust to the renderer. The title target follows the rotating opaque sprite. In combat the damage area follows the cyan canopy, with wing tips available for close dodges. For the other assets, the exporter isolates the primary connected silhouette and preserves antialiased edges. Warden turrets and Relay Carrier or Flagship shield nodes render independently. The original two Wraith plates use the same transform. Enemy muzzle positions, player exhaust and the rail origin share the authored coordinates used by combat.

## Review brief

Review mode is until ready, scoped to the completed art batch, within the US $15 project ceiling. The separate three comprehensive product reviews were used on the original campaign milestones. Review the real transparent exports against the best legacy art and inspect actual browser gameplay and motion at 320 × 568 and 390 × 844. Core gates are clear silhouettes, cohesive finish, usable attacks and pickups, aligned live and destroyed components, and no foreground/background readability defect that interferes with play.

Score weights stay fixed through the loop. Craft and silhouettes 25%, materials and lighting 20%, cohesion 15%, phone readability in motion 25%, and functional alignment 15%. Review evidence belongs outside the public flight pack.

### Independent round 1

Commit `b3f3ab396ab5934f892d267132297eb8e39be324`, pack `41eb2a09ccceddb`. Verdict **fixes required**, 8.15/10. Craft 8.8, materials 8.6, cohesion 8.4, phone readability 7.5 and functional alignment 7.3. The reviewer inspected exact exports and legacy art, sampled both motion recordings, and exercised both sizes, all sprites and attack families. All six movable boss units detached from their sockets. The off-axis rail cue connected to the painted emitter. Both Wraith plates shared the same alpha mask.

1. At 320 × 568 the meter covered about 19 CSS px of Harrow, 14 of Gravity Platform, and 2 of Warden at their highest steady position. Wrapped introductory text compounded it at the first hittable frame. The compact HUD now keeps a tighter vertical layout and the three introductory cues fit comfortably. The browser fixture measures clearance before and during combat for all seven bosses.
2. A same-realm shot through the Wraith's outer discs had no contact feedback. Core brackets now mark the vulnerable point in both realms. A matched-realm shot deflects on an outboard disc without damaging the boss or generating energy. The intro and Flight School identify the target, and model QA checks the core and wing response in both realms.

The same critic independently rechecked `1251550ff375e6866a025dfe97fce7da43bc4fde`, pack `cdeb471966c4882`, and found no actionable findings on the corrections. At 320 × 568, the minimum steady gap between the HUD and the visible hull was 6.8 px on Harrow, 11.8 px on Gravity Platform and 23.6 px on Warden. Both Wraith plates showed core brackets. In both realms each outboard disc deflected matched fire, a wrong-realm core hit gave veil feedback, and a same-realm core hit damaged the Wraith.

### Independent round 2

The fixed-field art review of `48ad0bf`, pack `0ac0879c7700ba9`, scored 8.08/10. It found that the cruiser's hull blocked shots aimed at both gun sockets, matched Wraith shots lacked feedback at the inner armor, and the lower HUD could cover the pilot near the steering limit. The correction made guns independently hittable, aligned the Wraith's four armor contacts with its visible plating, and moved flight notices and pickup status into the upper HUD.

The same reviewer rechecked `426ec6aeb30aca67d4913bc65a071a3016091255`, pack `9917fe866b8d0e7`. Verdict **no actionable findings**, with **8.70/10** overall. Craft 8.7, materials 8.5, cohesion 8.6, phone readability 8.8, alignment 8.9. The reviewer steered through the cruiser pass using browser touch at both sizes and disabled both guns. Each left a crossed-out socket. Wraith shots deflect off the inner armor and the marked core remains vulnerable in the matching realm. The ship, HUD and three concurrent pickup statuses stayed visible. Seven boss families measured 39.3%–50.0% of fixed arena width. The arena measured 0.7396 CSS px per logical unit on compact and 1.0156 on tall across phases. [Independent evidence](../../art-review-independent/fixed-48ad0bf/recheck-426ec6a/summary.json)
