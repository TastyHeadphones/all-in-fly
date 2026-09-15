import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import {
  ACTION_NAMES, ALL_IN, START_STACK, applyAction, assertChipConservation, createHand,
  eval5raw, mulberry32, shuffle, viewFrom,
} from '../app/poker.js';
import { assertPnDisjoint, N_PN } from '../app/encode.js';
import { Brain, N_KC, N_MBON, PROJECTION_SEED, W_MAX, matchStats, quantizeWeights, tuneThreshold } from './brain-ref.js';
import { collectTeacherSituations, isWorstPossible, naturalEvalSet, playHand, randomLegal } from './generate.js';
import { TEACHER_MC } from './teacher.js';

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
  const trash = { myHole: 0, myUp: [5, 9, 14, 21] };
  const wheelSt = { myHole: 0, myUp: [5, 8, 13, 16] };
  const babyFlush = { myHole: 0, myUp: [4, 8, 12, 20] };
  if (!isWorstPossible(trash)) throw new Error('7-high trash should count');
  if (isWorstPossible(wheelSt)) throw new Error('2-6 straight is not worst');
  if (isWorstPossible(babyFlush)) throw new Error('7-high flush is not worst');
  const rng = mulberry32(42);
  for (let i = 0; i < 120; i++) {
    const { state } = playHand(rng, (v) => randomLegal(v, rng), (v) => randomLegal(v, rng));
    if (state.stacks[0] + state.stacks[1] !== START_STACK * 2) throw new Error('end stacks');
  }
  for (let i = 0; i < 40; i++) {
    const shove = (v) => (v.legal[ALL_IN] ? ALL_IN : randomLegal(v, rng));
    const { state } = playHand(rng, shove, (v) => randomLegal(v, rng));
    assertChipConservation(state);
    if (state.stacks[0] + state.stacks[1] !== START_STACK * 2) throw new Error('shove stacks');
  }
  const s = createHand(mulberry32(1));
  applyAction(s, viewFrom(s, s.toAct).legal[1] ? 1 : 2);
  assertChipConservation(s);
  assertPnDisjoint();
}

function saveArtifacts(brain, stats) {
  const dir = path.join(ROOT, 'weights');
  fs.mkdirSync(dir, { recursive: true });
  const { i8, scales } = quantizeWeights(brain.w);
  const gz = zlib.gzipSync(Buffer.from(i8.buffer, i8.byteOffset, i8.byteLength), { level: 9 });
  fs.writeFileSync(path.join(dir, 'kc2mbon.i8.gz'), gz);
  const meta = {
    version: 'm1-2',
    n_pn: N_PN,
    n_kc: N_KC,
    n_mbon: N_MBON,
    projection_seed: PROJECTION_SEED,
    kc_threshold: brain.theta,
    kc_threshold_by_street: brain.thetaStreet,
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
  const epochs = Number(process.env.EPOCHS || (quick ? 2 : 3));
  const lr0 = Number(process.env.LR || 0.03);
  const samples = Number(process.env.MC || TEACHER_MC);

  console.log('self-test poker + PN disjointness');
  selfTestPoker();
  console.log('ok');

  const rng = mulberry32(12345);
  console.log('generating teacher self-play', trainHands, 'hands');
  const t0 = Date.now();
  const { items, dist, actions, hands } = collectTeacherSituations(trainHands, rng, samples);
  console.log('generate ms', Date.now() - t0, 'actions', actions, 'hands', hands);
  console.log('teacher dist', dist.map((d) => (100 * d / actions).toFixed(1) + '%').join('  '),
    'counts', dist.join(','));
  for (let a = 0; a < 4; a++) console.log('  ', ACTION_NAMES[a], dist[a]);

  console.log('holdout natural', holdoutHands, 'hands');
  const holdout = naturalEvalSet(holdoutHands, mulberry32(99991), samples);
  console.log('holdout decisions', holdout.length);

  const brain = new Brain({ seed: PROJECTION_SEED, initSeed: 7 });
  const tuneViews = holdout.length ? holdout : items.slice(0, 400);
  const tuned = tuneThreshold(brain, tuneViews, 0.07);
  console.log('KC threshold', tuned.thetaStreet.map((t) => t.toFixed(1)).join('/'),
    'sparsity', (tuned.sparsity * 100).toFixed(2) + '%');

  const natural = items;
  let errors = 0;
  let seen = 0;
  const rngTrain = mulberry32(777);
  for (let e = 0; e < epochs; e++) {
    const lr = lr0 * Math.pow(0.82, e);
    shuffle(natural, rngTrain);
    let hit = 0;
    for (let i = 0; i < natural.length; i++) {
      const view = natural[i].view;
      const y = natural[i].teacherAction;
      const a = brain.act(view);
      seen++;
      if (a === y) hit++;
      else {
        brain.learnOnError(a, y, lr * [1.05, 0.95, 1.28, 1.15][y]);
        errors++;
      }
    }
    const hol = matchStats(brain, holdout);
    const sat = brain.saturation();
    console.log(
      'epoch', e + 1,
      'lr', lr.toFixed(5),
      'train', ((hit / natural.length) * 100).toFixed(1) + '%',
      'holdout', (hol.match * 100).toFixed(1) + '%',
      'recall', hol.recall.map((r) => (r * 100).toFixed(0)).join('/'),
      'dist', hol.dist.map((d) => (d * 100).toFixed(0)).join('/'),
      'sat', (sat * 100).toFixed(2) + '%',
    );
  }

  const saved = saveArtifacts(brain, {
    lr0,
    trainHands,
    epochs,
    samples,
    errors,
    seen,
    theta: brain.theta,
    thetaStreet: brain.thetaStreet,
    finalSaturation: brain.saturation(),
    teacherDist: dist,
    teacherActions: actions,
  });
  console.log('saved weights', saved.bytes, 'bytes gzipped, version', saved.meta.version);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
