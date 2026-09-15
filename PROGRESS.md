# PROGRESS

## Judgement calls

- Raise cap: 4 raises per street, then RAISE is illegal but ALL-IN remains legal if chips remain. Spec gives a fixed raise size but no cap; uncapped re-raises between two strong hands drown the action distribution in RAISE.
- First to act: highest showing card on street 1 (suit tie-break), best showing poker hand later.
- Stacks reset to 100 every hand (as specified).
- Heads-up unmatched chips are refunded at the end of a betting round.
- Folded-best: counted only on street 4 (all cards out) when the fly folds a completed hand that would have won, and only if the teacher would not also fold. Earlier streets would count correct folds of live underdogs who happen to win the runout, which cannot meet ≤5/1000.
- Called-worst: facing an opponent ALL-IN, fly calls, current cards are high-card 7 or worse with no pair.
- Betting amounts use a log thermometer so typical 0–100 chip values do not saturate every bin equally.
- PN→KC synapses have seeded random weights in [0.4, 1.2] so the KC threshold is tunable; binary 20/270 Hz sums sit on a discrete step (≈21% vs ≈4.7% firing) that misses the 5–10% band.
- KC readout is ReLU of (weighted PN sum − theta). M1 is rate-coded.
- Phase A uses the specified error-only depress-correct / potentiate-wrong rule, with a 3-seed bag of 2-epoch perceptrons averaged. Training is on the natural teacher self-play distribution (mild per-class step scale only).
- Evaluation of chips seats the fly as player 0 and 1 on alternate hands.

## M1

Trainer, encoding, 96-unit readout, Phase A plasticity, `verify.js`. No WASM, no UI, no 3D.

### Step 1 — spec conformance (sections 3 and 4)

- Hand strength / equity / category / pot odds as network input? **pass** — `app/encode.js` uses card flags, rank/suit counts, street, pot, toCall, stacks, last actions, aggression, fold-rate. No evaluator output.
- `equity.js` reachable from `app/`? **pass** — grep of `app/` is no.
- PN sets disjoint? **pass** — `assertPnDisjoint()` walks 680 exclusive ranges.
- 96 MBON units with 96 weight columns? **pass** — `N_MBON = 96`, `w` is 5177×96, compartment mean is over 24 units.
- Per-unit MBON drives and KC firing exportable? **pass** — `forward()` / `exportState()` return `kcFire`, `mbonDrive` (96), `compartmentMean`.
- Explicit tie/null fallback, not array-order? **pass** — `decide()` uses a relative spread vs `tieRel`; fallback CALL if free, else FOLD.
- Illegal actions masked before argmin? **pass** — illegal compartment means set to +Infinity.
- Evaluation on natural distribution? **pass** — `naturalEvalSet` is teacher self-play; oversampling is not used at eval. Training bag is natural-order examples.
- Plasticity asymmetric, error only? **pass** — `learnOnError` depresses the correct compartment, potentiates the wrongly chosen, skip if match.
- Phase B eligibility traces? **n/a** — M1 is Phase A only.

### Step 2 — adversarial self-check

- Most likely way the numbers flatter: holdout pair-search overfit (~1 point). Official verify is a fresh seed. Action-match 79.1% is not a carried holdout figure.
- Policy collapse? No. Dist 12/53/24/11, none above 70%. All recalls ≥50%.
- Worst situations: street 1 with two cards (weak information) still mostly CALL/RAISE per teacher; facing all-in is learned enough that called-worst is 0; river fold-winners remain the leak.
- Phase B always-fold / always-shove: **n/a** (no Phase B in M1).
- Simpler than spec: (1) rate-coded ReLU KCs instead of LIF (M1 explicitly); (2) random PN→KC, not FlyWire (M3); (3) 24 units in a compartment get the same update, so they stay near-copies — they are still 96 columns; (4) raise cap of 4; (5) folded-best restricted to street 4 as above.

### Step 3 — fix rounds

More than three rounds. Representation distinguishes pairs (KC overlap pair vs trash ≈0.54). Unconstrained perceptron ceilings around 77–80% match. Bagging reached 79.6% holdout / 79.1% verify.

Tried and rejected or insufficient: uniform oversampling (RAISE collapse on natural), IDF/AdaGrad (RAISE/ALL-IN died), windowed betting thermometers (match dropped), river-only fine-tune (destroyed overall match), never-fold-river (chips −1488 vs teacher), rarer teacher all-ins (did not repair EV).

Hypothesis for the remaining miss: 20 Hz / 270 Hz sparse random expansion of raw cards plus betting thermometers is only a moderately linear approximation of an equity teacher. ~21% action errors concentrate on river fold/call and missed/extra aggression; with 100-chip all-ins those errors cost ~2 chips/hand vs the teacher. Getting chips ≥ −40 would need either much higher match on expensive actions or much smaller pots. The ≤5/1000 folded-best line is the same leak (11 measured).

Did not: change gate thresholds, rebalance eval, skip tests, or route hand strength into the network.

### G1 (measured, `EVAL_HANDS=2200 PLAY_HANDS=2000 MC=120 node trainer/verify.js`)

```
action-match vs teacher, natural distribution: 79.1%
per-action recall — FOLD 84.9%  CALL 82.1%  RAISE 69.6%  ALL-IN 76.8%
action distribution — FOLD 12.1%  CALL 53.4%  RAISE 23.5%  ALL-IN 10.9%
chips won per 100 hands vs random player: 527.60
chips won per 100 hands vs equity teacher: -204.75
folded the best hand at showdown, per 1000 hands: 11.00
called an all-in holding the worst possible hand, per 1000 hands: 0.00
KC sparsity (mean % firing): 7.0%
saturated synapses: 0.0%
equity.js imported anywhere under app/: no
hands trained: 10000
```

**G1 FAIL.** Stop. M2–M5 not started.

Uncertain: whether a LIF core plus real FlyWire PN→KC degrees (M3) would lift card conjunctions enough to clear the last point of match and the river-fold leak. Not tested, because that is a later milestone.
