# bluffly

A fruit-fly mushroom-body network, wired like a sparse PN→KC expansion, learns heads-up five-card stud from raw cards. Play money only. Not a gambling product.

**Status: M1 passed G1. M2 playable site in this repo.**

```
npx serve .
```

Then open the printed URL. Relative paths; works from `username.github.io/all-in-fly/`.

```
node trainer/train.js
node trainer/verify.js
```

Trainer: Node built-ins only, zero npm dependencies.

## Gate G1 (measured)

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

## Licence

Our code: MIT.

- Brain model: philshiu/Drosophila_brain_model (Shiu et al., *Nature* 2024) — MIT
- Connectome: FlyWire v783 (Dorkenwald, Matsliah et al. 2024) — CC-BY 4.0
- Cell-type annotations: Schlegel et al. 2024 — CC-BY 4.0
- Fly body: NeuroMechFly v2 / flygym — Apache-2.0
- three.js — MIT
