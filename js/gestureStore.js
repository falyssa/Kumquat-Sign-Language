// Gesture recognition + persistence. No ML training step: each capture is
// stored as an ordered sequence of frame vectors (handshape *and* the hand's
// path of motion), and live matching aligns the recent rolling window of
// frames against every stored sequence with Dynamic Time Warping (DTW) —
// which handles the sign being performed a little faster or slower than it
// was trained. Everything lives in localStorage so it survives reloads
// without retraining.

const STORAGE_KEY = 'kumquatSL.gestures.v1';
const WRIST = 0;
const MIDDLE_MCP = 9;
const MOTION_DIMS_PER_HAND = 3; // dx, dy, dz relative to the sequence's first frame

export const DEFAULT_SEQUENCE_MATCH_THRESHOLD = 0.9;

// Fingertip landmarks (thumb/index/middle/ring/pinky tips) are the least
// reliable points MediaPipe reports — they're the first thing to get
// occluded when a two-hand sign crosses one hand in front of the other, and
// their estimated position gets noisiest right when that happens. Weighting
// them down means a blocked fingertip's noise can't singlehandedly reject an
// otherwise-correct match, while the more stable joints (wrist, knuckles)
// still carry full weight.
const FINGERTIP_INDICES = new Set([4, 8, 12, 16, 20]);
const FINGERTIP_WEIGHT = 0.4;

// Motion (the hand's actual path through space) has far fewer dimensions
// than handshape (3 vs. 63 per hand), so without a boost it barely moves the
// combined distance even when it's the only thing distinguishing two signs.
// Weighting it up gives path-shape a fair say alongside handshape.
const MOTION_WEIGHT = 2.2;

export function loadGestures() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const gestures = Array.isArray(parsed.gestures) ? parsed.gestures : [];
    const { gestures: migrated, changed } = migrateGestures(gestures);
    if (changed) saveGestures(migrated);
    return migrated;
  } catch {
    return [];
  }
}

// Older saves stored a flat pool of shape-only vectors (`samples`) with no
// motion component and no sequence ordering. Wrapping that pool as a single
// sequence (with zeroed-out motion, since none was recorded) keeps existing
// trained signs working — as static poses — instead of silently discarding
// them the first time this runs against old data.
function migrateGestures(gestures) {
  let changed = false;
  const result = gestures.map((gesture) => {
    if (gesture.sequences) return gesture;
    changed = true;
    const handCount = gesture.handCount || 1;
    const zeroMotion = new Array(MOTION_DIMS_PER_HAND * handCount).fill(0);
    const sequence = (gesture.samples || []).map((shapeVec) => [...shapeVec, ...zeroMotion]);
    const { samples, ...rest } = gesture;
    return { ...rest, sequences: sequence.length ? [sequence] : [] };
  });
  return { gestures: result, changed };
}

export function saveGestures(gestures) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, gestures }));
}

export function createGesture({ word, emoji, sequence, handCount }) {
  const gestures = loadGestures();
  const gesture = {
    id: crypto.randomUUID(),
    word,
    emoji,
    handCount,
    sequences: [sequence],
    createdAt: Date.now(),
  };
  gestures.push(gesture);
  saveGestures(gestures);
  return gesture;
}

export function addSequenceToGesture(id, sequence) {
  const gestures = loadGestures();
  const gesture = gestures.find((g) => g.id === id);
  if (!gesture) return null;
  // Guard against vector-width mismatches (e.g. a 1-hand take slipping into
  // a 2-hand gesture), which would silently corrupt DTW distance checks.
  const expectedWidth = gesture.sequences[0]?.[0]?.length;
  if (expectedWidth && sequence[0]?.length !== expectedWidth) {
    return gesture;
  }
  gesture.sequences.push(sequence);
  saveGestures(gestures);
  return gesture;
}

export function updateGestureMeta(id, { word, emoji }) {
  const gestures = loadGestures();
  const gesture = gestures.find((g) => g.id === id);
  if (!gesture) return null;
  if (word !== undefined) gesture.word = word;
  if (emoji !== undefined) gesture.emoji = emoji;
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

/**
 * Turns 0-2 detected hands (each `{ landmarks, handedness }`) into a single
 * shape feature vector for gesture matching. Hands are sorted by handedness
 * ("Left" before "Right") so a two-hand gesture's vector stays consistent
 * regardless of which hand is physically on which side of the frame. Each
 * hand is normalized independently, then concatenated.
 */
export function normalizeHands(hands) {
  const sorted = [...hands].sort((a, b) => a.handedness.localeCompare(b.handedness));
  const vector = [];
  for (const hand of sorted) {
    vector.push(...normalize(hand.landmarks));
  }
  return { vector, handCount: sorted.length };
}

/**
 * Captures one frame's worth of tracking data: the shape vector (as above,
 * already position/scale invariant so it can't see movement), plus each
 * hand's raw wrist position and scale — kept separately so a *sequence* of
 * frames can later be turned into a motion path via `buildSequence`.
 */
export function captureFrame(hands) {
  const sorted = [...hands].sort((a, b) => a.handedness.localeCompare(b.handedness));
  const shape = [];
  const wrists = [];
  for (const hand of sorted) {
    shape.push(...normalize(hand.landmarks));
    const wrist = hand.landmarks[WRIST];
    const ref = hand.landmarks[MIDDLE_MCP];
    const scale = Math.hypot(ref.x - wrist.x, ref.y - wrist.y, ref.z - wrist.z) || 1e-6;
    wrists.push({ x: wrist.x, y: wrist.y, z: wrist.z, scale });
  }
  return { shape, wrists, handCount: sorted.length };
}

/**
 * Turns an ordered list of `captureFrame` results into an ordered list of
 * combined vectors (handshape + motion) ready for storage or DTW matching.
 * Each hand's motion is its wrist's displacement from that same hand's
 * position in the sequence's first frame, scaled by that hand's size at the
 * start — so the path is comparable regardless of how close the hand is to
 * the camera, while still capturing genuine movement through space (which
 * the shape vector alone deliberately can't, since it's re-centered on the
 * wrist every frame).
 */
export function buildSequence(frames) {
  if (frames.length === 0) return [];
  const start = frames[0].wrists;
  return frames.map((frame) => {
    const motion = [];
    for (let h = 0; h < frame.wrists.length; h++) {
      const wrist = frame.wrists[h];
      const startWrist = start[h] || wrist;
      const scale0 = startWrist.scale || 1e-6;
      motion.push(
        (wrist.x - startWrist.x) / scale0,
        (wrist.y - startWrist.y) / scale0,
        (wrist.z - startWrist.z) / scale0
      );
    }
    return [...frame.shape, ...motion];
  });
}

function frameDistance(a, b, weights) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += weights[i] * d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Per-dimension weights for a frame vector of the given hand count, laid out
 * the same way `buildSequence` concatenates it: each hand's 21 landmarks (in
 * x/y/z triples) followed by each hand's motion (dx/dy/dz). See
 * FINGERTIP_WEIGHT and MOTION_WEIGHT above for why.
 */
function buildWeightVector(handCount) {
  const weights = [];
  for (let h = 0; h < handCount; h++) {
    for (let i = 0; i < 21; i++) {
      const w = FINGERTIP_INDICES.has(i) ? FINGERTIP_WEIGHT : 1;
      weights.push(w, w, w);
    }
  }
  for (let h = 0; h < handCount; h++) {
    weights.push(MOTION_WEIGHT, MOTION_WEIGHT, MOTION_WEIGHT);
  }
  return weights;
}

/**
 * Dynamic Time Warping distance between two frame-vector sequences: finds
 * the lowest-cost alignment between them, stretching/compressing in time as
 * needed, so the same sign performed a bit faster or slower still matches.
 * Normalized by the alignment's path length so sequences of different
 * lengths stay comparable.
 */
export function dtwDistance(seqA, seqB, weights) {
  const n = seqA.length;
  const m = seqB.length;
  if (n === 0 || m === 0) return Infinity;
  const w = weights || new Array(seqA[0].length).fill(1);

  let prev = new Array(m + 1).fill(Infinity);
  let curr = new Array(m + 1).fill(Infinity);
  prev[0] = 0;

  for (let i = 1; i <= n; i++) {
    curr[0] = Infinity;
    for (let j = 1; j <= m; j++) {
      const cost = frameDistance(seqA[i - 1], seqB[j - 1], w);
      curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }

  const total = prev[m];
  return total / (n + m);
}

/**
 * Matches a live (in-progress) sequence of frames against every stored
 * gesture's recorded takes, returning the closest gesture if it's within
 * `threshold`, or null. Only gestures recorded with the same hand count are
 * considered, since their vectors aren't comparable.
 */
export function classifySequence(liveFrames, gestures, handCount, threshold = DEFAULT_SEQUENCE_MATCH_THRESHOLD) {
  if (liveFrames.length === 0) return null;
  const liveSequence = buildSequence(liveFrames);
  const weights = buildWeightVector(handCount);

  let best = null;
  let bestDist = Infinity;

  for (const gesture of gestures) {
    const gestureHandCount = gesture.handCount || 1;
    if (gestureHandCount !== handCount) continue;

    for (const sequence of gesture.sequences) {
      if (sequence[0]?.length !== liveSequence[0]?.length) continue;
      const dist = dtwDistance(liveSequence, sequence, weights);
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
