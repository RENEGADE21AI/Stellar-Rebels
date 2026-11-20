# Stellar Rebels score verification

Each new run draws 128 random bits from the browser's cryptographic generator. A four-word seeded generator controls re-entry lanes. The authored waves, ship statistics, enemy counts, encounter timing and rewards are shared across seeds. A returning craft's new lane is always at least one-quarter of the field from its first lane.

At 60 ticks per second, the recorder stores changes to the target position in sixteenths of a world unit and the tick of each accepted Ghost Shift or protection grant after a pause. The capture contains no name, account ID, device identifier, cursor history or wall-clock timestamps. At the result screen, **Save flight replay** exports the file. Standard play can continue past the verifier's limits of seven minutes for one Arcade stage and 30 minutes for Endless.

```powershell
node scripts/verify-stellar-run.mjs PATH-TO-REPLAY.json
```

The verifier runs the same simulation without a canvas, browser, database or network. It validates the rules, loadout, seed format, input bounds and action timing. It recomputes the terminal tick, score, kills, formation breaks and mastery. Changing a claimed score or ending early fails verification. Categories distinguish the mode, stage, ship, rules version and loadout. The fixed-tick trace can establish that a sequence was legal under the game rules. Player identity, seed issuance and duplicate submission require server ownership. A trace cannot establish that a human produced the inputs.

For a public board, issue a random seed and a single-use run ID from an authenticated endpoint, with the rules version and category bound to the issuance record. Compare incoming configuration to that record. Verify a bounded replay once on a server that keeps the corresponding rules implementation. Write an accepted score and consume its issuance atomically. The verifier requires no game state from the browser beyond inputs and the server-issued seed and configuration. The browser currently ships replay export and the shared verifier. Public ranking and the backend write path await a separately scoped release.
