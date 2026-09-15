import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import {
  ACTION_NAMES, START_STACK, applyAction, assertChipConservation, createHand,
  eval5raw, mulberry32, viewFrom,
} from '../app/poker.js';
import { assertPnDisjoint, N_PN } from '../app/encode.js';
import { Brain, N_KC, N_MBON, PROJECTION_SEED, TIE_REL, W_MAX, matchStats, quantizeWeights, tuneThreshold } from './brain-ref.js';
import { collectTeacherSituations, naturalEvalSet } from './generate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function selfTestPoker() {
  const royal = eval5raw(32, 36, 40, 44, 48);
  const wheelSf = eval5raw(0, 4, 8, 12, 48);
  if (royal <= wheelSf) throw new Error('royal should beat wheel sf');
  const quads = eval5raw(48, 49, 50, 51, 0);
  const boat = eval5raw(48, 49, 50, 44, 45);
  if (quads <= boat) throw new Error('quads should beat boat');
  const flush = eval5raw(0, 8, 16, 24, 40);
  const straight = eval5raw(0, 5, 8, 12, 16);
  if (flush <= straight) throw new Error('flush should beat straight');
  const rng = mulberry32(42);
  for (let i = 0; i < 200; i++) {
    const s = createHand(rng);
    assertChipConservation(s);
    let guard = 0;
    while (!s.done && guard++ < 40) {
      const view = viewFrom(s, s.toAct);
      let a = 1;
      for (let k = 0; k < 4; k++) if (view.legal[k]) { a = k; break; }
      applyAction(s, a);
      assertChipConservation(s);
    }
    if (!s.done) throw new Error('hand did not finish');
    if (s.stacks[0] + s.stacks[1] !== START_STACK * 2) throw new Error('end stacks');
  }
  assertPnDisjoint();
}

function saveArtifacts(brain, stats) {
  const dir = path.join(ROOT, 'weights');
  fs.mkdirSync(dir, { recursive: true });
  const { i8, scales } = quantizeWeights(brain.w);
  const gz = zlib.gzipSync(Buffer.from(i8.buffer, i8.byteOffset, i8.byteLength), { level: 9 });
  fs.writeFileSync(path.join(dir, 'kc2mbon.i8.gz'), gz);
  const meta = {
    version: 'm1-1',
    n_pn: N_PN,
    n_kc: N_KC,
    n_mbon: N_MBON,
    projection_seed: PROJECTION_SEED,
    kc_threshold: brain.theta,
    w_max: W_MAX,
    scales: Array.from(scales),
    training: stats,
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return { bytes: gz.length, meta };
}

async function main() {
  const quick = process.argv.includes('--quick');
  const trainHands = Number(process.env.TRAIN_HANDS || (quick ? 400 : 10000));
  const holdoutHands = Number(process.env.HOLDOUT_HANDS || (quick ? 80 : 800));
  const epochs = Number(process.env.EPOCHS || (quick ? 2 : 6));
  const perEpoch = Number(process.env.PER_EPOCH || (quick ? 2000 : 50000));
  const lr0 = Number(process.env.LR || 0.03);
  const samples = Number(process.env.MC || (quick ? 40 : 160));

  console.log('self-test poker + PN disjointness');
  selfTestPoker();
  console.log('ok');

  const rng = mulberry32(12345);
  console.log('generating teacher self-play', trainHands, 'hands');
  const t0 = Date.now();
  const { buckets, dist, actions, hands } = collectTeacherSituations(trainHands, rng, samples);
  console.log('generate ms', Date.now() - t0, 'actions', actions, 'hands', hands);
  console.log('teacher dist', dist.map((d) => (100 * d / actions).toFixed(1) + '%').join('  '),
    'counts', dist.join(','));
  for (let a = 0; a < 4; a++) {
    console.log('  bucket', ACTION_NAMES[a], buckets[a].length);
  }

  console.log('holdout natural', holdoutHands, 'hands');
  const holdout = naturalEvalSet(holdoutHands, mulberry32(99991), samples);
  console.log('holdout decisions', holdout.length);

  const probe = new Brain({ seed: PROJECTION_SEED, initSeed: 7 });
  const tuneViews = holdout.map((x) => x.view).slice(0, 400);
  const tuned = tuneThreshold(probe, tuneViews.length ? tuneViews : buckets[1].slice(0, 200), 0.07);
  console.log('KC threshold', tuned.theta.toFixed(2), 'sparsity', (tuned.sparsity * 100).toFixed(2) + '%');

  const natural = [];
  for (let a = 0; a < 4; a++) {
    const b = buckets[a];
    for (let i = 0; i < b.length; i++) natural.push(b[i]);
  }
  let errors = 0;
  let seen = 0;
  const trainStats = { epochs: [], lr0, trainHands, perEpoch, samples, theta: tuned.theta };
  const bag = new Float32Array(N_KC * N_MBON);
  let nBag = 0;
  const seeds = [7, 13, 29];
  let best = { score: -1, w: null, hol: null };
  const brain = probe;
  brain.theta = tuned.theta;

  for (const initSeed of seeds) {
    const net = new Brain({ seed: PROJECTION_SEED, initSeed });
    net.theta = tuned.theta;
    net.tieRel = TIE_REL;
    const rngTrain = mulberry32(777 + initSeed);
    const acc = new Float32Array(net.w.length);
    for (let e = 0; e < Math.min(epochs, 2); e++) {
      const lr = lr0 * Math.pow(0.82, e);
      for (let i = natural.length - 1; i > 0; i--) {
        const j = (rngTrain() * (i + 1)) | 0;
        const t = natural[i];
        natural[i] = natural[j];
        natural[j] = t;
      }
      let hit = 0;
      for (let i = 0; i < natural.length; i++) {
        const view = natural[i];
        const y = view.teacherAction;
        const a = net.act(view);
        seen++;
        if (a === y) hit++;
        else {
          const scale = [1.1, 0.92, 1.22, 1.28][y];
          net.learnOnError(a, y, lr * scale);
          errors++;
        }
      }
      const hol = matchStats(net, holdout);
      const sat = net.saturation();
      console.log(
        'seed', initSeed, 'epoch', e + 1,
        'train', ((hit / natural.length) * 100).toFixed(1) + '%',
        'holdout', (hol.match * 100).toFixed(1) + '%',
        'recall', hol.recall.map((r) => (r * 100).toFixed(0)).join('/'),
        'dist', hol.dist.map((d) => (d * 100).toFixed(0)).join('/'),
        'sat', (sat * 100).toFixed(2) + '%',
      );
      trainStats.epochs.push({ seed: initSeed, epoch: e + 1, holdoutMatch: hol.match, recall: hol.recall, dist: hol.dist, saturation: sat });
      for (let i = 0; i < acc.length; i++) acc[i] += net.w[i];
    }
    for (let i = 0; i < acc.length; i++) acc[i] /= Math.min(epochs, 2);
    net.w.set(acc);
    const hol = matchStats(net, holdout);
    const sat = net.saturation();
    console.log(
      'seed', initSeed, 'avg',
      (hol.match * 100).toFixed(1) + '%',
      'recall', hol.recall.map((r) => (r * 100).toFixed(0)).join('/'),
      'sat', (sat * 100).toFixed(2) + '%',
    );
    const recMin = Math.min(...hol.recall);
    const distMax = Math.max(...hol.dist);
    const gateish = sat < 0.05 && recMin >= 0.50 && distMax <= 0.70;
    const score = (gateish ? 5 : 0) + hol.match;
    if (score > best.score) best = { score, w: Float32Array.from(net.w), hol, sat };
    for (let i = 0; i < bag.length; i++) bag[i] += acc[i];
    nBag++;
  }
  for (let i = 0; i < bag.length; i++) bag[i] /= nBag;
  brain.w.set(bag);
  brain.theta = tuned.theta;
  brain.tieRel = TIE_REL;
  const holBag = matchStats(brain, holdout);
  const satBag = brain.saturation();
  console.log(
    'bagged',
    (holBag.match * 100).toFixed(1) + '%',
    'recall', holBag.recall.map((r) => (r * 100).toFixed(0)).join('/'),
    'dist', holBag.dist.map((d) => (d * 100).toFixed(0)).join('/'),
    'sat', (satBag * 100).toFixed(2) + '%',
  );
  const recMinB = Math.min(...holBag.recall);
  const distMaxB = Math.max(...holBag.dist);
  const gateB = satBag < 0.05 && recMinB >= 0.50 && distMaxB <= 0.70;
  const scoreB = (gateB ? 5 : 0) + holBag.match;
  if (gateB) best = { score: scoreB, w: Float32Array.from(bag), hol: holBag, sat: satBag };
  if (best.w) {
    brain.w.set(best.w);
    console.log('using', (best.hol.match * 100).toFixed(1) + '%',
      'recall', best.hol.recall.map((r) => (r * 100).toFixed(0)).join('/'));
  }

  trainStats.errors = errors;
  trainStats.seen = seen;
  trainStats.theta = brain.theta;
  trainStats.finalSaturation = brain.saturation();
  trainStats.teacherDist = dist;
  trainStats.teacherActions = actions;

  const saved = saveArtifacts(brain, trainStats);
  console.log('saved weights', saved.bytes, 'bytes gzipped, version', saved.meta.version);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
