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

Failed lines: action-match (need ≥80%), chips vs teacher (need ≥ −40), folded-best (need ≤5 per 1000). See `PROGRESS.md`.

## Licence

Our code: MIT.

Third-party (credited for later milestones; not shipped in M1):

- Brain model: philshiu/Drosophila_brain_model (Shiu et al., *Nature* 2024) — MIT
- Connectome: FlyWire v783 (Dorkenwald, Matsliah et al. 2024) — CC-BY 4.0
- Cell-type annotations: Schlegel et al. 2024 — CC-BY 4.0
- Fly body: NeuroMechFly v2 / flygym — Apache-2.0
- three.js — MIT
