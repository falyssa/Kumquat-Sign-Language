import { startHandTracking } from './handTracker.js';
import { loadGestures, normalize, classify } from './gestureStore.js';
import { initDoodleInteractions } from './doodles.js';

const VOTE_WINDOW = 10;
const MIN_VOTES = 6;

const videoEl = document.getElementById('camera-video');
const canvasEl = document.getElementById('camera-canvas');
const placeholderEl = document.getElementById('board-placeholder');
const emojiLayerEl = document.getElementById('emoji-layer');
const wordPillEl = document.getElementById('word-pill');
const statusLineEl = document.getElementById('status-line');

let gestures = loadGestures();
let votes = [];
let lastSpawnedId = null;

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

function updateDisplay() {
  const winnerId = currentWinner();
  const gesture = winnerId ? gestures.find((g) => g.id === winnerId) : null;

  if (gesture) {
    wordPillEl.textContent = gesture.word;
    if (winnerId !== lastSpawnedId) {
      spawnEmoji(gesture.emoji);
      lastSpawnedId = winnerId;
    }
  } else {
    wordPillEl.textContent = '—';
    lastSpawnedId = null;
  }
}

function onResults(landmarks) {
  if (!landmarks) {
    pushVote(null);
    updateDisplay();
    return;
  }
  const vec = normalize(landmarks);
  const match = classify(vec, gestures);
  pushVote(match ? match.gesture.id : null);
  updateDisplay();
}

async function init() {
  initDoodleInteractions();

  statusLineEl.textContent = gestures.length
    ? 'Watching for signs…'
    : 'No gestures trained yet — visit the Training Page first.';

  try {
    await startHandTracking({ videoEl, canvasEl, onResults, numHands: 1 });
    placeholderEl.style.display = 'none';
  } catch (err) {
    statusLineEl.textContent = `Camera unavailable: ${err.message}`;
    placeholderEl.textContent = 'Camera unavailable. This needs to run over https:// (or http://localhost) with camera access allowed.';
  }
}

init();
