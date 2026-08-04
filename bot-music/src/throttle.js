
const WINDOW_MS = 10_000;
const MAX_IN_WINDOW = 5;

const hits = new Map();

export function checkRate(userId, now) {
  const ts = now ?? Date.now();
  const recent = (hits.get(userId) || []).filter((t) => ts - t < WINDOW_MS);

  if (recent.length >= MAX_IN_WINDOW) {
    const oldest = recent[0];
    return { allowed: false, retryInMs: WINDOW_MS - (ts - oldest) };
  }

  recent.push(ts);
  hits.set(userId, recent);
  return { allowed: true, retryInMs: 0 };
}

const lastSeen = new Map();

export function isDuplicate(key, ms = 1500, now) {
  const ts = now ?? Date.now();
  const prev = lastSeen.get(key);
  lastSeen.set(key, ts);
  return prev !== undefined && ts - prev < ms;
}

const lastAction = new Map();

export function minInterval(key, ms, now) {
  const ts = now ?? Date.now();
  const prev = lastAction.get(key);
  if (prev !== undefined && ts - prev < ms) {
    return { allowed: false, retryInMs: ms - (ts - prev) };
  }
  lastAction.set(key, ts);
  return { allowed: true, retryInMs: 0 };
}
