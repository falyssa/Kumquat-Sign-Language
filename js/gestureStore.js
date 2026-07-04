// Gesture recognition + persistence. No ML training step: we store a handful
// of normalized landmark "snapshots" per gesture and match new frames against
// them with nearest-neighbor distance. Everything lives in localStorage so it
// survives reloads without retraining.

const STORAGE_KEY = 'kumquatSL.gestures.v1';
const WRIST = 0;
const MIDDLE_MCP = 9;

export const DEFAULT_MATCH_THRESHOLD = 0.55;

export function loadGestures() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.gestures) ? parsed.gestures : [];
  } catch {
    return [];
  }
}

export function saveGestures(gestures) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, gestures }));
}

export function createGesture({ word, emoji, samples }) {
  const gestures = loadGestures();
  const gesture = {
    id: crypto.randomUUID(),
    word,
    emoji,
    samples,
    createdAt: Date.now(),
  };
  gestures.push(gesture);
  saveGestures(gestures);
  return gesture;
}

export function addSamplesToGesture(id, newSamples) {
  const gestures = loadGestures();
  const gesture = gestures.find((g) => g.id === id);
  if (!gesture) return null;
  gesture.samples.push(...newSamples);
  saveGestures(gestures);
  return gesture;
}

export function deleteGesture(id) {
  const gestures = loadGestures().filter((g) => g.id !== id);
  saveGestures(gestures);
  return gestures;
}

/**
 * Turns raw MediaPipe hand landmarks (21 points, x/y/z in 0..1 image space)
 * into a position- and scale-invariant feature vector: translate so the
 * wrist is the origin, then scale by the wrist-to-middle-knuckle distance.
 */
export function normalize(landmarks) {
  const wrist = landmarks[WRIST];
  const ref = landmarks[MIDDLE_MCP];
  const scale = Math.hypot(ref.x - wrist.x, ref.y - wrist.y, ref.z - wrist.z) || 1e-6;

  const vec = [];
  for (const point of landmarks) {
    vec.push((point.x - wrist.x) / scale, (point.y - wrist.y) / scale, (point.z - wrist.z) / scale);
  }
  return vec;
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Nearest-neighbor match: compares the live vector against every stored
 * sample across every gesture and returns the closest gesture, or null if
 * nothing is close enough (below DEFAULT_MATCH_THRESHOLD).
 */
export function classify(vec, gestures, threshold = DEFAULT_MATCH_THRESHOLD) {
  let best = null;
  let bestDist = Infinity;

  for (const gesture of gestures) {
    for (const sample of gesture.samples) {
      const dist = euclideanDistance(vec, sample);
      if (dist < bestDist) {
        bestDist = dist;
        best = gesture;
      }
    }
  }

  if (best && bestDist < threshold) {
    return { gesture: best, distance: bestDist };
  }
  return null;
}
