# bluffly

A fruit-fly mushroom-body network, wired like a sparse PN→KC expansion, learns heads-up five-card stud from raw cards. Play money only. Not a gambling product.

**Status: M1 complete. G1 did not pass after multiple fix rounds.** Later milestones (web app, WASM LIF, 3D fly, Actions training) were not started because the spec forbids proceeding past a failed gate.

## What exists

Offline trainer only (`trainer/`). No UI, no WASM, no 3D.

```
node trainer/train.js
node trainer/verify.js
```

Zero npm dependencies. Node built-ins only.

## Gate G1 (measured)

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

Failed line: folded-best (need ≤5 per 1000). Match, recall, distribution, chips, sparsity, and saturation pass. See `PROGRESS.md`.

## Licence

Our code: MIT.

Third-party (credited for later milestones; not shipped in M1):

- Brain model: philshiu/Drosophila_brain_model (Shiu et al., *Nature* 2024) — MIT
- Connectome: FlyWire v783 (Dorkenwald, Matsliah et al. 2024) — CC-BY 4.0
- Cell-type annotations: Schlegel et al. 2024 — CC-BY 4.0
- Fly body: NeuroMechFly v2 / flygym — Apache-2.0
- three.js — MIT
