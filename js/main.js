import { startHandTracking } from './handTracker.js';
import { loadGestures, captureFrame, classifySequence } from './gestureStore.js';
import { initDoodleInteractions } from './doodles.js';
import { playChime } from './sfx.js';

const VOTE_WINDOW = 10;
const MIN_VOTES = 6;
const LIVE_WINDOW_FRAMES = 70; // ~2.5-3s of motion at typical webcam framerates
const CLASSIFY_INTERVAL_MS = 120; // re-run DTW matching a few times a second, not every frame

const videoEl = document.getElementById('camera-video');
const canvasEl = document.getElementById('camera-canvas');
const placeholderEl = document.getElementById('board-placeholder');
const emojiLayerEl = document.getElementById('emoji-layer');
const wordPillEl = document.getElementById('word-pill');
const statusLineEl = document.getElementById('status-line');

let gestures = loadGestures();
let votes = [];
let displayedGestureId = null;
let frameBuffer = [];
let bufferHandCount = null;
let lastClassifyAt = 0;

window.addEventListener('storage', () => {
  gestures = loadGestures();
});

function pushVote(id) {
  votes.push(id);
  if (votes.length > VOTE_WINDOW) votes.shift();
}

function currentWinner() {
  const counts = {};
  for (const id of votes) {
    if (id == null) continue;
    counts[id] = (counts[id] || 0) + 1;
  }
  let winner = null;
  let max = 0;
  for (const [id, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      winner = id;
    }
  }
  return max >= MIN_VOTES ? winner : null;
}

function spawnEmoji(emoji) {
  const el = document.createElement('span');
  el.className = 'emoji-float';
  el.textContent = emoji;
  el.addEventListener('animationend', () => el.remove());
  emojiLayerEl.appendChild(el);
}

function resetMatching() {
  frameBuffer = [];
  votes = [];
}

function onResults(hands) {
  if (!hands.length) {
    resetMatching();
    bufferHandCount = null;
    displayedGestureId = null;
    wordPillEl.textContent = '—';
    return;
  }

  // A change in hand count mid-stream means whatever motion was building up
  // no longer belongs to the same sign — start the window over rather than
  // let mismatched-width frames blend together.
  if (bufferHandCount !== null && hands.length !== bufferHandCount) {
    resetMatching();
  }
  bufferHandCount = hands.length;

  frameBuffer.push(captureFrame(hands));
  if (frameBuffer.length > LIVE_WINDOW_FRAMES) frameBuffer.shift();

  const now = performance.now();
  if (now - lastClassifyAt >= CLASSIFY_INTERVAL_MS) {
    lastClassifyAt = now;
    const match = classifySequence(frameBuffer, gestures, bufferHandCount);
    pushVote(match ? match.gesture.id : null);

    const winnerId = currentWinner();
    if (winnerId && winnerId !== displayedGestureId) {
      const gesture = gestures.find((g) => g.id === winnerId);
      if (gesture) {
        wordPillEl.textContent = gesture.word;
        spawnEmoji(gesture.emoji);
        playChime([659.25, 987.77]);
        displayedGestureId = winnerId;
        // Start the window fresh so this sign's tail end can't blend into
        // whatever comes next and throw off the following match.
        resetMatching();
      }
    }
    // If there's no confident winner (or it's the same sign still being
    // held), leave the display exactly as it is — no flicker back to "—".
  }
}

async function init() {
  initDoodleInteractions();

  statusLineEl.textContent = gestures.length
    ? 'Watching for signs…'
    : 'No gestures trained yet — visit the Training Page first.';

  try {
    await startHandTracking({ videoEl, canvasEl, onResults, numHands: 2 });
    placeholderEl.style.display = 'none';
  } catch (err) {
    statusLineEl.textContent = `Camera unavailable: ${err.message}`;
    placeholderEl.textContent = 'Camera unavailable. This needs to run over https:// (or http://localhost) with camera access allowed.';
  }
}

init();
