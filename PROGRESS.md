# PROGRESS

## Judgement calls

- Raise cap: 4 raises per street, then RAISE is illegal but ALL-IN remains legal if chips remain.
- First to act: highest showing card on street 1 (suit tie-break), best showing poker hand later.
- Stacks reset to 100 every hand.
- Heads-up unmatched chips are refunded at the end of a betting round.
- Folded-best: every street-4 fold where the fly’s completed five-card hand would have won, including cases the teacher would also fold.
- Called-worst: facing an opponent ALL-IN and calling with a high-card ≤7 and no pair/straight/flush (5-card `eval5` category 0).
- Betting amounts use a log thermometer.
- PN→KC synapses have seeded random weights in [0.4, 1.2] so the KC threshold is tunable.
- One theta per street, each tuned to 7% firing on that street’s natural views (overall still 7%).
- Phase A: one net, 3 epochs over the natural teacher set, mild per-class step scale. Eval never oversamples.
- Chip EV seats the fly as player 0 and 1 on alternate hands.
- Teacher MC is `TEACHER_MC = 160` for train and verify (verify reads `meta.training.samples` if present).

## M1

Trainer, encoding, 96-unit readout, Phase A plasticity, `verify.js`. No WASM, no UI, no 3D.

### Step 1 — spec conformance (sections 3 and 4)

- Hand strength / equity / category / pot odds as network input? **pass** — `app/encode.js` uses card flags, rank/suit counts, street, pot, toCall, stacks, last actions, aggression, fold-rate.
- `equity.js` reachable from `app/`? **pass** — grep of `app/` is no.
- PN sets disjoint? **pass** — `assertPnDisjoint()` plus encode offsets taken from `PN_GROUPS`.
- 96 MBON units with 96 weight columns? **pass** — `N_MBON = 96`; per-unit init spread and `unitScale` so columns are not copies.
- Per-unit MBON drives and KC firing exportable? **pass** — `forward()` returns `kcFire`, `mbonDrive` (96), `compartmentMean`.
- Explicit tie/null fallback, not array-order? **pass** — `decide()` relative spread vs `tieRel`; CALL if free, else FOLD.
- Illegal actions masked before argmin? **pass** — illegal means set to +Infinity.
- Evaluation on natural distribution? **pass** — `naturalEvalSet` is teacher self-play with live fold-rate; same `TEACHER_MC` as training.
- Plasticity asymmetric, error only? **pass** — `learnOnError` depresses correct, potentiates wrong, skip if match.
- Phase B eligibility traces? **n/a** — M1 is Phase A only.

### Step 2 — adversarial self-check

- Eval pipeline used to zero fold-rate and run a different MC than training; that understated match by ~1–2 points and crushed chip EV. Fixed: live fold-rate + shared `TEACHER_MC`.
- Policy collapse? No. Dist 12.5/62.5/16.5/8.4, none above 70%. All recalls ≥50%.
- Worst situations: street 4 still the weakest match (~69% on a probe) and is where folded-best is charged.
- Phase B always-fold / always-shove: **n/a**.
- Simpler than spec: rate-coded ReLU KCs (M1); random PN→KC not FlyWire (M3); raise cap of 4.

### Step 3 — fix rounds

Pipeline bugs (fold-rate, MC mismatch) were the main chip/match distortion. After the fix, match and chips vs teacher pass. Folded-best stays high because the fly extra-folds winners on fifth street (teacher self-play measures 0 on the same metric). Street-4-only fine-tunes destroyed overall match; a 4% FOLD-drive bump on the river did not cut the leak.

Did not: change gate thresholds, rebalance eval, skip tests, or route hand strength into the network.

### G1 (measured, `EVAL_HANDS=2200 PLAY_HANDS=2000 node trainer/verify.js`, MC from `meta.training.samples` = 160)

```
action-match vs teacher, natural distribution: 80.3%
per-action recall — FOLD 85.0%  CALL 91.3%  RAISE 55.9%  ALL-IN 65.5%
action distribution — FOLD 12.5%  CALL 62.5%  RAISE 16.5%  ALL-IN 8.4%
chips won per 100 hands vs random player: 496.40
chips won per 100 hands vs equity teacher: 77.45
folded the best hand at showdown, per 1000 hands: 19.50
called an all-in holding the worst possible hand, per 1000 hands: 0.00
KC sparsity (mean % firing): 7.0%
saturated synapses: 0.5%
equity.js imported anywhere under app/: no
hands trained: 10000
```

**G1 FAIL** on folded-best (19.50 > 5 per 1000). Other lines pass, including match ≥80% and chips vs teacher ≥ −40. Stop. M2–M5 not started.

Per-street sparsity on a 400-hand probe after per-street theta: street 1 6.9%, 2 7.0%, 3 6.9%, 4 7.0%.
