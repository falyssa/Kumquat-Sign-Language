import { startHandTracking } from './handTracker.js';
import { loadGestures, createGesture, addSamplesToGesture, deleteGesture, normalize } from './gestureStore.js';
import { initDoodleInteractions } from './doodles.js';

const CAPTURE_DURATION_MS = 1500;
const SAMPLE_INTERVAL_MS = 100;
const MIN_SAMPLES_REQUIRED = 5;

const videoEl = document.getElementById('camera-video');
const canvasEl = document.getElementById('camera-canvas');
const handDot = document.getElementById('hand-status-dot');
const handLabel = document.getElementById('hand-status-label');
const wordInput = document.getElementById('word-input');
const emojiInput = document.getElementById('emoji-input');
const captureBtn = document.getElementById('capture-btn');
const progressBar = document.getElementById('capture-progress-bar');
const captureStatus = document.getElementById('capture-status');
const saveBtn = document.getElementById('save-btn');
const gestureListEl = document.getElementById('gesture-list');

let currentLandmarks = null;
let pendingSamples = [];
let capturing = false;

function onResults(landmarks) {
  currentLandmarks = landmarks;
  handDot.classList.toggle('is-active', Boolean(landmarks));
  handLabel.textContent = landmarks ? 'Hand detected' : 'No hand detected';
}

function renderGestureList() {
  const gestures = loadGestures();
  gestureListEl.innerHTML = '';
  for (const gesture of gestures) {
    const li = document.createElement('li');
    li.className = 'gesture-list__item';
    li.innerHTML = `
      <span class="gesture-list__emoji">${gesture.emoji}</span>
      <span class="gesture-list__word">${gesture.word}</span>
      <span class="gesture-list__samples">${gesture.samples.length} samples</span>
      <button class="gesture-list__delete" type="button" aria-label="Delete ${gesture.word}">🗑</button>
    `;
    li.querySelector('.gesture-list__delete').addEventListener('click', () => {
      deleteGesture(gesture.id);
      renderGestureList();
    });
    gestureListEl.appendChild(li);
  }
}

function setCapturing(isCapturing) {
  capturing = isCapturing;
  captureBtn.disabled = isCapturing;
  wordInput.disabled = isCapturing;
  emojiInput.disabled = isCapturing;
}

function runCapture() {
  if (capturing) return;
  setCapturing(true);
  pendingSamples = [];
  progressBar.style.width = '0%';
  captureStatus.textContent = 'Capturing… hold your sign steady.';

  const startedAt = performance.now();

  const tick = setInterval(() => {
    const elapsed = performance.now() - startedAt;
    progressBar.style.width = `${Math.min(100, (elapsed / CAPTURE_DURATION_MS) * 100)}%`;

    if (currentLandmarks) {
      pendingSamples.push(normalize(currentLandmarks));
    }

    if (elapsed >= CAPTURE_DURATION_MS) {
      clearInterval(tick);
      setCapturing(false);
      progressBar.style.width = '100%';

      if (pendingSamples.length >= MIN_SAMPLES_REQUIRED) {
        captureStatus.textContent = `Captured ${pendingSamples.length} samples. Fill in a word + emoji, then Save.`;
        saveBtn.disabled = false;
      } else {
        captureStatus.textContent = 'Not enough hand data captured — keep your hand in frame and try again.';
        saveBtn.disabled = true;
        pendingSamples = [];
      }
    }
  }, SAMPLE_INTERVAL_MS);
}

function saveGesture() {
  const word = wordInput.value.trim();
  const emoji = emojiInput.value.trim();

  if (!word || !emoji || pendingSamples.length === 0) return;

  const existing = loadGestures().find((g) => g.word.toLowerCase() === word.toLowerCase());
  if (existing) {
    addSamplesToGesture(existing.id, pendingSamples);
  } else {
    createGesture({ word, emoji, samples: pendingSamples });
  }

  pendingSamples = [];
  saveBtn.disabled = true;
  progressBar.style.width = '0%';
  captureStatus.textContent = `Saved "${word}". Capture again to add more samples for this sign, or train a new one.`;
  renderGestureList();
}

async function init() {
  initDoodleInteractions();
  renderGestureList();

  captureBtn.addEventListener('click', runCapture);
  saveBtn.addEventListener('click', saveGesture);

  try {
    await startHandTracking({ videoEl, canvasEl, onResults, numHands: 1 });
  } catch (err) {
    handLabel.textContent = `Camera unavailable: ${err.message}`;
    captureBtn.disabled = true;
  }
}

init();
