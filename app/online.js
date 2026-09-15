const DB = 'bluffly';
const STORE = 'memory';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadMemory() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('visitor');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveMemory(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, 'visitor');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearMemory() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('visitor');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function emptyStats() {
  return {
    hands: 0,
    visitorFoldToAgg: { n: 0, folds: 0 },
    visitorRaise: [0, 0, 0, 0],
    visitorActs: [0, 0, 0, 0],
    visitorStreet: [0, 0, 0, 0],
    visitorStrongAgg: { n: 0, agg: 0 },
    flyDist: [0, 0, 0, 0],
    flyDist0: [0, 0, 0, 0],
    flyHands0: 0,
  };
}

export function noteVisitorAction(stats, street, action, flyAgg) {
  const s = Math.max(1, Math.min(4, street)) - 1;
  stats.visitorStreet[s]++;
  if (action === 2 || action === 3) stats.visitorRaise[s]++;
  if (flyAgg) {
    stats.visitorFoldToAgg.n++;
    if (action === 0) stats.visitorFoldToAgg.folds++;
  }
}

export function noteFlyAction(stats, action) {
  stats.flyDist[action]++;
  if (stats.hands < 20) {
    stats.flyDist0[action]++;
    stats.flyHands0++;
  }
}

export function noteShowdown(stats, visitorStrong, visitorAgg) {
  if (visitorStrong) {
    stats.visitorStrongAgg.n++;
    stats.visitorStrongAgg.agg += visitorAgg;
  }
}

export function rate(n, d) {
  return d ? n / d : 0;
}
