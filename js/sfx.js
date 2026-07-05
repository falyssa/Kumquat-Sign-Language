// Tiny Web Audio synth helper for short UI chimes. Used by both pages, so
// the sound-generation code (and its suspended-context handling) lives in
// one place instead of being duplicated. No audio files/asset pipeline
// needed since this is a no-build static site.

let ctx = null;

function getContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
}

// Browsers only allow audio to start inside a trusted user gesture (click,
// keydown, touchstart). Chimes triggered from the hand-tracking loop are not
// a user gesture, so without this the context would stay silently suspended
// forever on pages (like the live page) that never call playChime from a
// click handler. Unlocking eagerly on the very first interaction anywhere on
// the page means it's already running by the time recognition needs it.
function unlock() {
  getContext().resume();
}

['pointerdown', 'keydown', 'touchstart'].forEach((type) => {
  document.addEventListener(type, unlock, { once: true });
});

export async function playChime(frequencies, { gain = 0.5, noteDuration = 0.3, noteGap = 0.12 } = {}) {
  try {
    const audioCtx = getContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    frequencies.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * noteGap;
      gainNode.gain.setValueAtTime(0, start);
      gainNode.gain.linearRampToValueAtTime(gain, start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + noteDuration + 0.02);
    });
  } catch (err) {
    console.error('Chime playback failed:', err);
  }
}

// Springy "boing" for the bone shake: a triangle oscillator that bends up
// then decays back down in pitch, like a wobbling spring.
export async function playBoing({ gain = 0.4, duration = 0.35 } = {}) {
  try {
    const audioCtx = getContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(420, now + 0.06);
    osc.frequency.exponentialRampToValueAtTime(90, now + duration);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch (err) {
    console.error('Boing playback failed:', err);
  }
}

// Soft "poof" for the dino print stomp: filtered noise that darkens quickly,
// like a puff of dust.
export async function playPoof({ gain = 0.35, duration = 0.25 } = {}) {
  try {
    const audioCtx = getContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const now = audioCtx.currentTime;

    const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + duration);

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(gain, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    noise.start(now);
    noise.stop(now + duration + 0.02);
  } catch (err) {
    console.error('Poof playback failed:', err);
  }
}
