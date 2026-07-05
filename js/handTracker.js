// Thin wrapper around MediaPipe's HandLandmarker (runs fully in-browser via
// WASM, no server) plus webcam setup. Shared by the live page and training page.

import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/**
 * Starts the webcam into `videoEl` and begins running hand-landmark
 * detection on every new frame. Calls `onResults(hands)` each time a frame
 * is processed, where `hands` is an array of 0, 1, or 2 entries shaped
 * `{ landmarks, handedness }` (handedness is "Left" or "Right", used to
 * keep a stable ordering for two-hand gestures regardless of on-screen
 * position). Two hands are tracked by default, but neither is required.
 *
 * If `canvasEl` is given, the tracked hand skeleton(s) (nodes + connecting
 * lines) are drawn onto it every frame, matched to the video's native size.
 *
 * Returns { stop() } to tear down the camera stream and detection loop.
 */
export async function startHandTracking({ videoEl, canvasEl, onResults, numHands = 2 }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();

  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands,
  });

  const canvasCtx = canvasEl ? canvasEl.getContext('2d') : null;
  const drawingUtils = canvasCtx ? new DrawingUtils(canvasCtx) : null;

  let stopped = false;
  let lastVideoTime = -1;

  function drawSkeleton(hands) {
    if (!canvasCtx) return;
    if (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
    }
    canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    for (const hand of hands) {
      drawingUtils.drawConnectors(hand.landmarks, HandLandmarker.HAND_CONNECTIONS, {
        color: '#EFE561',
        lineWidth: 3,
      });
      drawingUtils.drawLandmarks(hand.landmarks, {
        color: '#FFA948',
        fillColor: '#FFA948',
        lineWidth: 1,
        radius: 4,
      });
    }
  }

  function loop() {
    if (stopped) return;
    if (videoEl.currentTime !== lastVideoTime) {
      lastVideoTime = videoEl.currentTime;
      const results = handLandmarker.detectForVideo(videoEl, performance.now());
      const hands = (results.landmarks || []).map((landmarks, i) => ({
        landmarks,
        handedness: results.handedness?.[i]?.[0]?.categoryName || 'Unknown',
      }));
      hands.sort((a, b) => a.handedness.localeCompare(b.handedness));
      drawSkeleton(hands);
      onResults(hands);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    stop() {
      stopped = true;
      handLandmarker.close();
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
