import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { mulberry32 } from '../app/poker.js';
import { assertPnDisjoint } from '../app/encode.js';
import { Brain, N_KC, N_MBON, dequantizeWeights, matchStats } from './brain-ref.js';
import { makeTeacher } from './teacher.js';
import { naturalEvalSet, playMatch, randomLegal } from './generate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function equityImportedUnderApp() {
  const app = path.join(ROOT, 'app');
  if (!fs.existsSync(app)) return false;
  for (const f of walk(app)) {
    if (!f.endsWith('.js') && !f.endsWith('.html')) continue;
    const t = fs.readFileSync(f, 'utf8');
    if (t.includes('equity.js') || t.includes('trainer/equity')) return true;
  }
  return false;
}

export function loadBrain(root = ROOT) {
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'weights', 'meta.json'), 'utf8'));
  const gz = fs.readFileSync(path.join(root, 'weights', 'kc2mbon.i8.gz'));
  const buf = zlib.gunzipSync(gz);
  const i8 = new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  if (i8.length !== N_KC * N_MBON) throw new Error('weight length ' + i8.length);
  const w = dequantizeWeights(i8, meta.scales);
  const brain = new Brain({ w, theta: meta.kc_threshold, seed: meta.projection_seed });
  brain.theta = meta.kc_threshold;
  return { brain, meta };
}

function pct(x) {
  return (x * 100).toFixed(1);
}

export async function runVerify(opts = {}) {
  const quick = process.argv.includes('--quick') || opts.quick;
  const evalHands = Number(process.env.EVAL_HANDS || (quick ? 80 : 1200));
  const matchHands = Number(process.env.MATCH_HANDS || (quick ? 60 : 800));
  const playHands = Number(process.env.PLAY_HANDS || (quick ? 80 : 1000));
  const samples = Number(process.env.MC || (quick ? 40 : 140));

  assertPnDisjoint();
  const eqApp = equityImportedUnderApp();
  const { brain, meta } = loadBrain();

  const items = naturalEvalSet(evalHands, mulberry32(4242), samples);
  const stats = matchStats(brain, items);
  const teacher = makeTeacher(samples);
  const fly = (view) => brain.act(view);
  const randRng = mulberry32(51);
  const vsRandom = playMatch(playHands, mulberry32(53), fly, (v) => randomLegal(v, randRng));
  const vsTeacher = playMatch(playHands, mulberry32(52), fly, teacher, { teacherFn: teacher });

  const sat = brain.saturation();
  const trained = meta.training?.trainHands ?? meta.training?.seen ?? 0;

  const gate = {
    match: stats.match * 100,
    recall: stats.recall.map((r) => r * 100),
    dist: stats.dist.map((d) => d * 100),
    chipsRandom: vsRandom.chipsPer100,
    chipsTeacher: vsTeacher.chipsPer100,
    foldedBest: vsTeacher.foldedBestPer1000,
    calledWorst: vsTeacher.calledWorstPer1000,
    sparsity: stats.sparsity * 100,
    saturated: sat * 100,
    equityApp: eqApp ? 'yes' : 'no',
    handsTrained: trained,
    recTot: stats.recTot,
    nEval: items.length,
  };

  const block = [
    `action-match vs teacher, natural distribution: ${pct(stats.match)}%`,
    `per-action recall — FOLD ${pct(stats.recall[0])}%  CALL ${pct(stats.recall[1])}%  RAISE ${pct(stats.recall[2])}%  ALL-IN ${pct(stats.recall[3])}%`,
    `action distribution — FOLD ${pct(stats.dist[0])}%  CALL ${pct(stats.dist[1])}%  RAISE ${pct(stats.dist[2])}%  ALL-IN ${pct(stats.dist[3])}%`,
    `chips won per 100 hands vs random player: ${vsRandom.chipsPer100.toFixed(2)}`,
    `chips won per 100 hands vs equity teacher: ${vsTeacher.chipsPer100.toFixed(2)}`,
    `folded the best hand at showdown, per 1000 hands: ${vsTeacher.foldedBestPer1000.toFixed(2)}`,
    `called an all-in holding the worst possible hand, per 1000 hands: ${vsTeacher.calledWorstPer1000.toFixed(2)}`,
    `KC sparsity (mean % firing): ${pct(stats.sparsity)}%`,
    `saturated synapses: ${pct(sat)}%`,
    `equity.js imported anywhere under app/: ${eqApp ? 'yes' : 'no'}`,
    `hands trained: ${trained}`,
  ].join('\n');

  const pass =
    stats.match >= 0.80 &&
    stats.recall.every((r) => r >= 0.50) &&
    stats.dist.every((d) => d <= 0.70) &&
    vsRandom.chipsPer100 > 5 &&
    vsTeacher.chipsPer100 >= -40 &&
    vsTeacher.foldedBestPer1000 <= 5 &&
    vsTeacher.calledWorstPer1000 <= 2 &&
    stats.sparsity >= 0.05 && stats.sparsity <= 0.10 &&
    sat < 0.05 &&
    !eqApp;

  return { gate, block, pass, stats, vsRandom, vsTeacher, meta, matchHands };
}

const isMain = process.argv[1] && path.normalize(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runVerify().then((r) => {
    console.log(r.block);
    console.log(r.pass ? 'G1 PASS' : 'G1 FAIL');
    if (!r.pass) process.exitCode = 1;
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
