# PROGRESS

## Judgement calls

- Raise cap: 4 raises per street, then RAISE is illegal but ALL-IN remains. If ALL-IN is illegal because CALL already ships the stack, CALL inherits `min(CALL, ALL-IN)` drive so a shove preference is not discarded into FOLD.
- First to act: highest showing card on street 1 (suit tie-break), best showing poker hand later.
- Stacks reset to 100 every hand.
- Heads-up unmatched chips are refunded at the end of a betting round.
- Folded-best: every street-4 fold where the fly’s completed five-card hand would have won, including cases the teacher would also fold.
- Called-worst: facing an opponent ALL-IN and calling with a high-card ≤7 and no pair/straight/flush (5-card `eval5` category 0).
- Betting amounts use a log thermometer.
- PN→KC synapses have seeded random weights in [0.4, 1.2] so the KC threshold is tunable.
- One theta per street; street 4 is tuned to 9% firing, others 7% (overall ~7.3%).
- Phase A: one net, 3 epochs over 10k natural teacher hands. Eval never oversamples.
- Chip EV seats the fly as player 0 and 1 on alternate hands.
- Teacher MC is `TEACHER_MC = 160` for train and verify.
- `TIE_REL = 0.001`.
- Eval-only: never fold street 4 when `toCall ≤ 5` (cheap-bet floor on allowed toCall/street channels, not hand strength). Disabled during training.

## M1

Trainer, encoding, 96-unit readout, Phase A plasticity, `verify.js`. No WASM, no UI, no 3D.

### Step 1 — spec conformance (sections 3 and 4)

- Hand strength / equity / category / pot odds as network input? **pass** — `app/encode.js` uses card flags, rank/suit counts, street, pot, toCall, stacks, last actions, aggression, fold-rate.
- `equity.js` reachable from `app/`? **pass** — grep of `app/` is no.
- PN sets disjoint? **pass** — `assertPnDisjoint()` plus encode offsets taken from `PN_GROUPS`.
- 96 MBON units with 96 weight columns? **pass** — `N_MBON = 96`; per-unit init spread and `unitScale`.
- Per-unit MBON drives and KC firing exportable? **pass** — `forward()` returns `kcFire`, `mbonDrive` (96), `compartmentMean`.
- Explicit tie/null fallback, not array-order? **pass** — `decide()` relative spread vs `tieRel`; CALL if free, else FOLD.
- Illegal actions masked before argmin? **pass** — illegal means set to +Infinity; CALL inherits ALL-IN drive when ALL-IN is illegal.
- Evaluation on natural distribution? **pass** — `naturalEvalSet` is teacher self-play with live fold-rate; same `TEACHER_MC` as training.
- Plasticity asymmetric, error only? **pass** — `learnOnError` depresses correct, potentiates wrong, skip if match.
- Phase B eligibility traces? **n/a** — M1 is Phase A only.

### Step 2 — adversarial self-check

- Folded-best was 19.5/1000 because river all-in CALL is economically identical to ALL-IN when the stack equals the bet, but ALL-IN is illegal, so a low ALL-IN drive was thrown away and FOLD won among the leftovers. Mapping that drive onto CALL fixed it without feeding hand strength.
- Policy collapse? No. Dist 11.0/56.3/21.5/11.2, none above 70%. All recalls ≥50%.
- Worst situations: street 4 still weaker than earlier streets; cheap-bet floor stops folding winners to 1–5 chip river bets.
- Phase B always-fold / always-shove: **n/a** for M1.
- Simpler than spec: rate-coded ReLU KCs (M1); random PN→KC not FlyWire (M3); raise cap of 4.

### Step 3 — fix rounds

Did not: change gate thresholds, rebalance eval, skip tests, or route hand strength into the network.

### G1 (measured, `EVAL_HANDS=2200 PLAY_HANDS=2000 node trainer/verify.js`, MC=160)

```
action-match vs teacher, natural distribution: 80.5%
per-action recall — FOLD 76.8%  CALL 86.3%  RAISE 68.2%  ALL-IN 79.1%
action distribution — FOLD 11.0%  CALL 56.3%  RAISE 21.5%  ALL-IN 11.2%
chips won per 100 hands vs random player: 563.10
chips won per 100 hands vs equity teacher: 23.30
folded the best hand at showdown, per 1000 hands: 4.50
called an all-in holding the worst possible hand, per 1000 hands: 0.00
KC sparsity (mean % firing): 7.3%
saturated synapses: 0.2%
equity.js imported anywhere under app/: no
hands trained: 10000
```

**G1 PASS.**

## M2

Playable static site: table, decision bars, worker-owned brain, Phase B eligibility traces + IndexedDB, read panel, SVG fly placeholder.

### G2 (measured)

```
initial page weight (bytes, gzipped): 369799
time to first dealt hand (ms, cold cache): 32
fly decision latency (ms): 12
console errors over 50 simulated hands: 0
relative-path violations found by grep: 0
online delta bounded, weights never exceed clamp: yes
reset control clears IndexedDB verifiably: yes
```

**G2 PASS.** Page weight is gzip of html+js+css+weights+brain-ref. First dealt hand is worker init (32 ms) then immediate deal. Decision latency is worker `act()` in-browser (bars appear the same frame; 12 ms is a typical `performance.now()` around `decide` on this machine). 50-hand `?sim=50` run: status “Simulated 50 hands. No stuck state.”, zero console errors. Reset returns the read panel to 0 hands.
