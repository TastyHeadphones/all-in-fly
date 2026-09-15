import { buildProjection, N_KC, KC_FANIN } from '../trainer/brain-ref.js';

export async function loadConnectome() {
  const res = await fetch(new URL('connectome.bin.gz', import.meta.url));
  const raw = new Uint8Array(await res.arrayBuffer());
  const ds = new DecompressionStream('gzip');
  const buf = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
  const nKc = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, true);
  const edges = new Uint16Array(buf.buffer, buf.byteOffset + 4, nKc * KC_FANIN);
  const syn = new Float32Array(buf.buffer, buf.byteOffset + 4 + edges.byteLength, nKc * KC_FANIN);
  return { nKc, edges, syn };
}

export function connectomeMatchesBuild(edges, syn) {
  const proj = buildProjection();
  if (edges.length !== proj.edges.length || syn.length !== proj.syn.length) return false;
  for (let i = 0; i < edges.length; i++) if (edges[i] !== proj.edges[i]) return false;
  for (let i = 0; i < syn.length; i++) if (Math.abs(syn[i] - proj.syn[i]) > 1e-5) return false;
  return true;
}
