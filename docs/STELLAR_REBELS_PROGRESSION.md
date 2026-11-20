# Progression and Monetization Design

## The next flight

Select the next stage or replay a favorite. Drag, aim through positioning, learn the wave, collect field equipment and fight its boss. A result names the accomplished objective, shows the record and earned Salvage, and offers Next or Retry immediately. A ship or upgrade is a choice between flights. The route always advances from an ordinary clear, including a clear made with stock equipment.

- **In combat.** A useful pickup changes the next several seconds and rewards reaching it. Waves teach a pattern, combine it with earlier threats, then make room for one climax. A threatening hit and an opening have distinct audio and visual cues.
- **Between stages.** Clearing a location reveals the next one. A new environment, threat pairing or boss problem gives the unlock its value. Ship unlocks are infrequent and introduce a different aiming style. A result earns recognition at once.
- **Over time.** One optional mastery objective per stage complements personal bests. The four shared upgrades use one currency and offer bounded advantages. Endless has its own time record. Mastery never blocks a stage, adds combat stats or requires a repeat quota. Cosmetic rewards can wait for evidence that the art and reward are desirable.

## Stage intent and replay

All six stages, both earnable ships and six optional mastery objectives are playable in the candidate. The first clear of each stage pays a total of 757 Salvage across the route. Installing all four upgrades costs 500, so reaching the finale is enough to buy every upgrade without replaying for currency.

| Stage | Interest and lesson | What a clear earns | Why revisit |
| --- | --- | --- | --- |
| **Vesper Orbit** | A planetary blockade introduces lateral aim, aimed lances, and linked attacks. The Warden’s turrets can be removed individually. | Access to Asteroid Belt and enough first-clear Salvage to afford the first weapon upgrade. | **Disarm the Warden.** Destroy both turrets before the hull. |
| **Asteroid Belt** | Sweep and dive patterns pull away from easy lanes. The Harrow telegraphs the opening in each wall. | Interceptor becomes available. Its rapid lane changes and narrow weapon reward different approach angles. | Defeat The Harrow with hull untouched during the boss fight. Try short deliberate crossing moves. |
| **Relay Station** | Attack a Command Ship, then sweep exposed escorts. The Relay Carrier shields its main hull until both nodes are down. | The relay goes offline and the route opens to Red Sun. | Keep hull intact through the boss or improve a score with earlier target selection. |
| **Red Sun** | Rail Ship locks an old player position. Bait the aim and move early, then return to the damage lane. | Gunship unlocks and Outer Orbit becomes available. | Clean boss objective rewards leaving the beam in time to keep landing shots. |
| **Outer Orbit** | Crossfire and the gravity platform’s pull make short corrections matter. | Advance to the fleet finale. | Master entering the exposed side during the attack rotation and improve score with a different ship footprint. |
| **The Flagship** | The shielded hull mixes rail locks, debris seams and converging spreads. | Campaign completion and access to every earned replay. | Clear without losing hull during the boss. Compare runs using the recorded ship and installed upgrades. |

## Five illustrative sessions

1. **First flight.** The player immediately steers and sees automatic twin fire. They clear several formations, intercept a useful pickup and recognize why an aimed pattern hit. They reach the Warden or want another shot at it.
2. **Breakthrough.** A retry starts with two actions or fewer from the result. The player chooses to take out one turret and opens a safe lane. A Vesper Orbit victory opens the next stage. The first-clear award can pay for Rails, or the player can keep stock and fly on.
3. **A new problem.** The player learns to move toward an announced opening in Asteroid Belt. After clearing it, they inspect and equip the newly earned interceptor. They want to feel how its narrow lance changes the familiar first stage.
4. **Choosing how to play.** The player uses Interceptor or returns to Fighter to beat Relay Station, notices the linked enemy relationship and finds a way to dismantle it. The next location or arc resolution provides a further reason to finish.
5. **One more try.** The player replays their favorite stage to earn its one mastery mark or improve a personal score. A short Endless flight is available if they'd like a different pace, then they can return to the Arcade route.

With every upgrade installed, a session can open directly into a favorite boss and still demand the correct position and timing. The player may choose a quick Interceptor score attempt or a broader Gunship run, pursue a previously missed mastery mark, replay the final stage, or set a personal survival record. Permanent power can shorten exposure and help recover from mistakes. It cannot move the ship to the gap or choose a target. Compare stock and maximum-loadout attempts for this exact difference.

## Economy rules and testable examples

The [production plan](STELLAR_REBELS_PRODUCTION.md) lists the trial prices and six-stage reward caps. First-clear bonuses are larger than sustainable repeat payouts. Later replays pay more in absolute terms and should be compared per active minute before a release. Endless and mastery award zero Salvage. A qualifying failure needs at least three kills. Its value is the lesser of the time-scaled stage cap and `floor(kills × 0.85)`. The bank pays only the amount above the best prior failed result for that stage. In Vesper Orbit, 80 seconds and 12 kills pay 10; repeating the same attempt pays zero; 111 seconds and 19 kills raise the cap reached to 15 and pay five. A later first clear still pays 78. Two tabs can commit rewards or purchases through one serialized IndexedDB transaction per event. A failed write does not represent a banked result.

The starting damage and movement are balanced on their own. Rails should cross a meaningful enemy hit threshold. Chamber should be felt in sound and cadence. Cells complete a bounded roughly 30% sustained offensive improvement across the three upgrades. Hull gives one extra mistake. Keep only effects that remain noticeable during runs and preserve the boss's recognizable actions.

## Business decision and evidence

The six-stage candidate uses the complete free core. The [monetization decision](STELLAR_REBELS_MONETIZATION.md) compares three approaches and describes a future permanent expansion hypothesis. Ads and checkout are absent from the candidate. The project budget is US $15.

Prioritize stock and max-loadout clears, attack recognition after a real defeat, voluntary retries, visible pickup value, first-clear satisfaction and earned-ship handling. Look for interesting choices after the last upgrade. Before selecting a paid variant, test authentic clips of finished free and paid content with representative players. Record what they found worth paying for and what they understood of the offer. Verify real purchase restoration, failure behavior and offline entitlements only if purchase scope is selected. Author play, simulations and independent art reviews provide different evidence. None establishes retention or willingness to pay.
