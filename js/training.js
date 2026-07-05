import { startHandTracking } from './handTracker.js';
import { loadGestures, createGesture, addSequenceToGesture, updateGestureMeta, deleteGesture, captureFrame, buildSequence } from './gestureStore.js';
import { initDoodleInteractions } from './doodles.js';

const PREP_SECONDS = 3;
const CAPTURE_DURATION_MS = 5000;
const SAMPLE_INTERVAL_MS = 40;
const MIN_SAMPLES_REQUIRED = 40;

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
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const gestureListEl = document.getElementById('gesture-list');
const gestureCountEl = document.getElementById('gesture-count');
const countdownEl = document.getElementById('capture-countdown');
const countdownNumberEl = document.getElementById('capture-countdown-number');
const countdownLabelEl = document.getElementById('capture-countdown-label');

let currentHands = [];
let pendingFrames = [];
let pendingHandCount = null;
let capturing = false;
let editingGestureId = null;

function handCountLabel(count) {
  return count === 2 ? '2 hands' : '1 hand';
}

function onResults(hands) {
  currentHands = hands;
  handDot.classList.toggle('is-active', hands.length > 0);
  handLabel.textContent = hands.length === 0 ? 'No hand detected' : `${handCountLabel(hands.length)} detected`;
}

function renderGestureList() {
  const gestures = loadGestures();
  gestureCountEl.textContent = `${gestures.length} ${gestures.length === 1 ? 'Gesture' : 'Gestures'} Saved`;
  gestureListEl.innerHTML = '';
  for (const gesture of gestures) {
    const frameCount = gesture.sequences.reduce((sum, seq) => sum + seq.length, 0);
    const takeCount = gesture.sequences.length;
    const li = document.createElement('li');
    li.className = 'gesture-list__item';
    li.innerHTML = `
      <span class="gesture-list__emoji">${gesture.emoji}</span>
      <span class="gesture-list__word">${gesture.word}</span>
      <span class="gesture-list__samples">${frameCount} samples &middot; ${takeCount} take${takeCount === 1 ? '' : 's'} &middot; ${handCountLabel(gesture.handCount || 1)}</span>
      <button class="gesture-list__edit" type="button" aria-label="Edit ${gesture.word}">✏️</button>
      <button class="gesture-list__delete" type="button" aria-label="Delete ${gesture.word}">🗑</button>
    `;
    li.querySelector('.gesture-list__edit').addEventListener('click', () => {
      startEditingGesture(gesture);
    });
    li.querySelector('.gesture-list__delete').addEventListener('click', () => {
      if (editingGestureId === gesture.id) cancelEditing();
      deleteGesture(gesture.id);
      renderGestureList();
    });
    gestureListEl.appendChild(li);
  }
}

function startEditingGesture(gesture) {
  editingGestureId = gesture.id;
  pendingFrames = [];
  pendingHandCount = null;
  wordInput.value = gesture.word;
  emojiInput.value = gesture.emoji;
  progressBar.style.width = '0%';
  saveBtn.disabled = false;
  cancelEditBtn.hidden = false;
  captureStatus.textContent = `Editing "${gesture.word}" — change the word/emoji and hit Save, or Capture Pose to add another take, then Save.`;
  wordInput.focus();
}

function cancelEditing() {
  editingGestureId = null;
  pendingFrames = [];
  pendingHandCount = null;
  wordInput.value = '';
  emojiInput.value = '';
  saveBtn.disabled = true;
  cancelEditBtn.hidden = true;
  progressBar.style.width = '0%';
  captureStatus.textContent = 'Press Capture, then get into position — recording starts after a 3-second countdown and runs for 5 seconds.';
}

function setCapturing(isCapturing) {
  capturing = isCapturing;
  captureBtn.disabled = isCapturing;
  wordInput.disabled = isCapturing;
  emojiInput.disabled = isCapturing;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPrepCountdown(seconds) {
  countdownEl.classList.remove('is-recording');
  countdownEl.classList.add('is-visible');
  countdownLabelEl.textContent = 'Get ready';
  for (let i = seconds; i > 0; i--) {
    countdownNumberEl.textContent = i;
    captureStatus.textContent = `Get in position… capturing starts in ${i}`;
    await wait(1000);
  }
}

function runCaptureWindow() {
  return new Promise((resolve) => {
    countdownEl.classList.add('is-recording');
    countdownLabelEl.textContent = 'Capturing';
    const startedAt = performance.now();

    const tick = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      progressBar.style.width = `${Math.min(100, (elapsed / CAPTURE_DURATION_MS) * 100)}%`;
      countdownNumberEl.textContent = Math.max(1, Math.ceil((CAPTURE_DURATION_MS - elapsed) / 1000));

      if (currentHands.length > 0) {
        // Lock in whichever hand count shows up first, then only keep
        // frames that match it — a stray dropped hand mid-capture shouldn't
        // corrupt the gesture with mixed-length vectors.
        if (pendingHandCount === null) {
          pendingHandCount = currentHands.length;
        }
        if (currentHands.length === pendingHandCount) {
          pendingFrames.push(captureFrame(currentHands));
        }
      }

      if (elapsed >= CAPTURE_DURATION_MS) {
        clearInterval(tick);
        resolve();
      }
    }, SAMPLE_INTERVAL_MS);
  });
}

async function runCapture() {
  if (capturing) return;
  setCapturing(true);
  pendingFrames = [];
  pendingHandCount = null;
  progressBar.style.width = '0%';

  await runPrepCountdown(PREP_SECONDS);
  await runCaptureWindow();

  countdownEl.classList.remove('is-visible', 'is-recording');
  countdownNumberEl.textContent = '';
  countdownLabelEl.textContent = '';
  setCapturing(false);
  progressBar.style.width = '100%';

  if (pendingFrames.length >= MIN_SAMPLES_REQUIRED) {
    captureStatus.textContent = editingGestureId
      ? `Captured a new take (${pendingFrames.length} ${handCountLabel(pendingHandCount)} samples). Hit Save to add it.`
      : `Captured ${pendingFrames.length} ${handCountLabel(pendingHandCount)} samples — move through the sign the same way you want it recognized. Fill in a word + emoji, then Save.`;
    saveBtn.disabled = false;
  } else {
    captureStatus.textContent = 'Not enough hand data captured — keep your hand(s) in frame for the whole capture and try again.';
    pendingFrames = [];
    pendingHandCount = null;
    // Editing a gesture's word/emoji alone doesn't need a capture, so Save
    // should stay usable — only a fresh (non-edit) gesture requires one.
    saveBtn.disabled = !editingGestureId;
  }
}

function saveEditedGesture(word, emoji) {
  const gestures = loadGestures();
  const gesture = gestures.find((g) => g.id === editingGestureId);
  if (!gesture) {
    cancelEditing();
    return;
  }

  const collision = gestures.find(
    (g) => g.id !== editingGestureId && g.word.toLowerCase() === word.toLowerCase()
  );
  if (collision) {
    captureStatus.textContent = `"${word}" is already used by another sign — pick a different word.`;
    return;
  }

  if (pendingFrames.length > 0) {
    const gestureHandCount = gesture.handCount || 1;
    if (pendingHandCount !== gestureHandCount) {
      captureStatus.textContent = `"${gesture.word}" was trained with ${handCountLabel(gestureHandCount)} — this capture used ${handCountLabel(pendingHandCount)}. Retrain with the same hand count.`;
      return;
    }
    addSequenceToGesture(gesture.id, buildSequence(pendingFrames));
  }

  updateGestureMeta(gesture.id, { word, emoji });
  cancelEditing();
  captureStatus.textContent = `Updated "${word}".`;
  renderGestureList();
}

function saveGesture() {
  const word = wordInput.value.trim();
  const emoji = emojiInput.value.trim();

  if (!word || !emoji) return;

  if (editingGestureId) {
    saveEditedGesture(word, emoji);
    return;
  }

  if (pendingFrames.length === 0) return;

  const sequence = buildSequence(pendingFrames);
  const existing = loadGestures().find((g) => g.word.toLowerCase() === word.toLowerCase());
  if (existing) {
    const existingHandCount = existing.handCount || 1;
    if (existingHandCount !== pendingHandCount) {
      captureStatus.textContent = `"${word}" was already trained with ${handCountLabel(existingHandCount)} — this capture used ${handCountLabel(pendingHandCount)}. Use a different word, or delete "${word}" and retrain.`;
      return;
    }
    addSequenceToGesture(existing.id, sequence);
  } else {
    createGesture({ word, emoji, sequence, handCount: pendingHandCount });
  }

  pendingFrames = [];
  pendingHandCount = null;
  saveBtn.disabled = true;
  progressBar.style.width = '0%';
  captureStatus.textContent = `Saved "${word}". Capture again to add more takes of this sign, or train a new one.`;
  renderGestureList();
}

async function init() {
  initDoodleInteractions();
  renderGestureList();

  captureBtn.addEventListener('click', runCapture);
  saveBtn.addEventListener('click', saveGesture);
  cancelEditBtn.addEventListener('click', cancelEditing);

  try {
    await startHandTracking({ videoEl, canvasEl, onResults, numHands: 2 });
  } catch (err) {
    handLabel.textContent = `Camera unavailable: ${err.message}`;
    captureBtn.disabled = true;
  }
}

init();
